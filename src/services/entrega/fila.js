// Scheduler de entrega do relay.
//
// Antes: cada mensagem disparava Promise.allSettled() com N requests simultâneos e, como o SDK
// não faz retry de POST/PATCH/DELETE, todo 429 virava uma cópia perdida.
//
// Agora: cada destino (canal) tem a sua fila; o scheduler limita a concorrência e o throughput
// global, respeita o retry_after dos 429 reenfileirando o job (sem perder nem duplicar) e
// mantém a ordem dentro de cada destino.
const { log } = require('../../util/logger');
const { ehRateLimit, definirContadorRelays } = require('../../util/ratelimit');

const CONCORRENCIA_GLOBAL = Number(process.env.ENTREGA_CONCORRENCIA) || 10;
// O bucket global do bot é 50 req/s; fica com folga porque comandos e reações também consomem.
const REQS_POR_SEGUNDO = Number(process.env.ENTREGA_REQS_POR_SEGUNDO) || 35;
// Rajada pequena de propósito: com capacidade = taxa, uma janela de 1s poderia ver rajada cheia +
// reposição (~2x a taxa) e estourar o limite. Assim o pico por segundo fica em ~1,3x a taxa.
const CAPACIDADE_RAJADA = Math.max(1, Math.floor(REQS_POR_SEGUNDO * 0.3));
const MAX_TENTATIVAS_429 = 8;
const MAX_TENTATIVAS_ERRO = 3;
const ESPERA_MIN_MS = 50;
const ESPERA_MAX_MS = 60_000;
const ESPERA_429_PADRAO_MS = 1000;
// Depois de N jobs de prioridade alta seguidos, deixa um normal passar (evita starvation).
const MAX_ALTAS_SEGUIDAS = 5;
const INTERVALO_METRICAS_MS = 60_000;

/**
 * @typedef {object} Job
 * @property {() => Promise<any>} fn
 * @property {'alta'|'normal'} prioridade
 * @property {string|null} dedupe
 * @property {boolean} idempotente
 * @property {number} tentativas429
 * @property {number} tentativasErro
 * @property {Promise<any>} promessa
 * @property {(v: any) => void} resolve
 * @property {(e: any) => void} reject
 */

/**
 * @typedef {object} Destino
 * @property {string} chave
 * @property {Job[]} alta
 * @property {Job[]} normal
 * @property {Map<string, Job>} pendentesPorDedupe
 * @property {boolean} emVoo
 * @property {number} pausadoAte
 * @property {number} altasSeguidas
 */

/** @type {Map<string, Destino>} */
const destinos = new Map();

let emVoo = 0;
let pendentes = 0;
let globalPausadoAte = 0;
let tokens = CAPACIDADE_RAJADA;
let ultimoReabastecimento = Date.now();
/** @type {NodeJS.Timeout|null} */
let timer = null;
let bombeando = false;

const metricas = { requisicoes: 0, sucessos: 0, rate429: 0, retries: 0, falhas: 0, latenciaTotalMs: 0, maiorBacklog: 0 };

function statusDe(e) {
  return e?.status ?? e?.statusCode ?? e?.response?.status;
}

function lerRateLimit(e) {
  if (!ehRateLimit(e)) return null;
  const segundos = [e?.retryAfter, e?.retry_after, e?.data?.retry_after, e?.rawError?.retry_after]
    .map(Number)
    .find((n) => Number.isFinite(n) && n >= 0);
  return {
    retryAfterMs: segundos === undefined ? ESPERA_429_PADRAO_MS : segundos * 1000,
    global: e?.global === true || e?.data?.global === true
  };
}

// Só vale tentar de novo, sem risco de duplicar, o que é idempotente (edit/delete).
function erroTransiente(e) {
  if (e?.name === 'AbortError') return true;
  const s = statusDe(e);
  if (s === undefined) return true; // falha de rede sem resposta da API
  return s === 408 || s >= 500;
}

function destinoDe(chave) {
  let d = destinos.get(chave);
  if (!d) {
    d = { chave, alta: [], normal: [], pendentesPorDedupe: new Map(), emVoo: false, pausadoAte: 0, altasSeguidas: 0 };
    destinos.set(chave, d);
  }
  return d;
}

function reabastecer(agora) {
  const decorrido = agora - ultimoReabastecimento;
  if (decorrido <= 0) return;
  tokens = Math.min(CAPACIDADE_RAJADA, tokens + (decorrido * REQS_POR_SEGUNDO) / 1000);
  ultimoReabastecimento = agora;
}

function temPendente(d) {
  return d.alta.length > 0 || d.normal.length > 0;
}

function escolherJob(d) {
  const preferirNormal = d.altasSeguidas >= MAX_ALTAS_SEGUIDAS && d.normal.length > 0;
  if (d.alta.length > 0 && !preferirNormal) {
    d.altasSeguidas++;
    return d.alta.shift();
  }
  d.altasSeguidas = 0;
  return d.normal.shift() || d.alta.shift();
}

function agendarBomba(ms = 0) {
  if (timer) clearTimeout(timer);
  // Sem unref: entrega pendente tem que manter o processo vivo.
  timer = setTimeout(() => { timer = null; bombear(); }, Math.max(0, ms));
}

function bombear() {
  if (bombeando) return;
  bombeando = true;
  try {
    const agora = Date.now();
    reabastecer(agora);
    let proximo = Infinity;

    if (globalPausadoAte > agora) {
      proximo = globalPausadoAte - agora;
    } else {
      for (const d of [...destinos.values()]) {
        if (d.emVoo) continue;
        if (!temPendente(d)) {
          if (d.pausadoAte <= agora) destinos.delete(d.chave);
          continue;
        }
        if (d.pausadoAte > agora) {
          proximo = Math.min(proximo, d.pausadoAte - agora);
          continue;
        }
        if (emVoo >= CONCORRENCIA_GLOBAL) break;
        if (tokens < 1) {
          proximo = Math.min(proximo, Math.ceil(((1 - tokens) * 1000) / REQS_POR_SEGUNDO));
          break;
        }
        tokens -= 1;
        // Round-robin: quem acabou de ser atendido vai pro fim da fila de destinos.
        destinos.delete(d.chave);
        destinos.set(d.chave, d);
        iniciar(d, escolherJob(d));
      }
    }

    if (Number.isFinite(proximo)) agendarBomba(proximo + 1);
  } finally {
    bombeando = false;
  }
}

function iniciar(d, job) {
  if (job.dedupe) d.pendentesPorDedupe.delete(job.dedupe);
  pendentes--;
  d.emVoo = true;
  emVoo++;
  executar(d, job);
}

function reenfileirarNaFrente(d, job) {
  (job.prioridade === 'alta' ? d.alta : d.normal).unshift(job);
  if (job.dedupe) d.pendentesPorDedupe.set(job.dedupe, job);
  pendentes++;
}

async function executar(d, job) {
  const t0 = Date.now();
  metricas.requisicoes++;
  try {
    const r = await job.fn();
    metricas.sucessos++;
    metricas.latenciaTotalMs += Date.now() - t0;
    job.resolve(r);
  } catch (e) {
    const limite = lerRateLimit(e);
    if (limite) {
      metricas.rate429++;
      const espera = Math.min(ESPERA_MAX_MS, Math.max(ESPERA_MIN_MS, limite.retryAfterMs)) + Math.floor(Math.random() * 100);
      if (limite.global) globalPausadoAte = Math.max(globalPausadoAte, Date.now() + espera);
      else d.pausadoAte = Math.max(d.pausadoAte, Date.now() + espera);
      if (++job.tentativas429 <= MAX_TENTATIVAS_429) {
        metricas.retries++;
        // O 429 significa que a API recusou o request, então repetir não duplica nada.
        reenfileirarNaFrente(d, job);
      } else {
        metricas.falhas++;
        job.reject(e);
      }
    } else if (job.idempotente && erroTransiente(e) && ++job.tentativasErro <= MAX_TENTATIVAS_ERRO) {
      metricas.retries++;
      d.pausadoAte = Math.max(d.pausadoAte, Date.now() + 500 * job.tentativasErro);
      reenfileirarNaFrente(d, job);
    } else {
      metricas.falhas++;
      job.reject(e);
    }
  } finally {
    d.emVoo = false;
    emVoo--;
    agendarBomba(0);
  }
}

/**
 * Enfileira uma operação para um destino. A fila garante a ordem por destino (um request por vez
 * em cada canal) e o respeito aos limites; o resultado só chega quando o job de fato rodou.
 *
 * @template T
 * @param {string} chave destino (id do canal)
 * @param {() => Promise<T>} fn operação; deve lançar o erro original do SDK
 * @param {{ prioridade?: 'alta'|'normal', dedupe?: string, idempotente?: boolean }} [opcoes]
 *   dedupe: se já houver um job pendente (não iniciado) com essa chave, ele é substituído pela
 *   versão mais nova em vez de enfileirar outro (ex.: 5 edições seguidas viram 1 PATCH).
 *   idempotente: permite retry de falhas transitórias além do 429 (edit/delete, nunca send).
 * @returns {Promise<T>}
 */
function enfileirar(chave, fn, opcoes = {}) {
  const k = String(chave);
  const d = destinoDe(k);
  const { prioridade = 'normal', dedupe = null, idempotente = false } = opcoes;

  if (dedupe) {
    const existente = d.pendentesPorDedupe.get(dedupe);
    if (existente) {
      existente.fn = fn;
      return existente.promessa;
    }
  }

  /** @type {Job} */
  const job = {
    fn, prioridade, dedupe, idempotente, tentativas429: 0, tentativasErro: 0,
    promessa: /** @type {any} */ (null), resolve: () => {}, reject: () => {}
  };
  job.promessa = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });

  (prioridade === 'alta' ? d.alta : d.normal).push(job);
  if (dedupe) d.pendentesPorDedupe.set(dedupe, job);
  pendentes++;
  metricas.maiorBacklog = Math.max(metricas.maiorBacklog, pendentes);
  agendarBomba(0);
  return job.promessa;
}

/** Cancela um job ainda não iniciado. Retorna true se havia algo para cancelar. */
function cancelarPendente(chave, dedupe) {
  const d = destinos.get(String(chave));
  const job = d && d.pendentesPorDedupe.get(dedupe);
  if (!d || !job) return false;
  const lane = job.prioridade === 'alta' ? d.alta : d.normal;
  const i = lane.indexOf(job);
  if (i === -1) return false;
  lane.splice(i, 1);
  d.pendentesPorDedupe.delete(dedupe);
  pendentes--;
  job.resolve('cancelado');
  return true;
}

function estatisticas() {
  return { emVoo, pendentes, destinosAtivos: destinos.size, ...metricas };
}

definirContadorRelays(() => emVoo + pendentes);

const intervaloMetricas = setInterval(() => {
  const m = metricas;
  if (m.requisicoes === 0 && pendentes === 0) return;
  const media = m.sucessos > 0 ? Math.round(m.latenciaTotalMs / m.sucessos) : 0;
  log.info(
    'ENTREGA',
    `${INTERVALO_METRICAS_MS / 1000}s | reqs=${m.requisicoes} ok=${m.sucessos} 429=${m.rate429} retries=${m.retries} ` +
    `falhas=${m.falhas} | latência média=${media}ms | backlog=${pendentes} (pico ${m.maiorBacklog}) em voo=${emVoo}`
  );
  m.requisicoes = m.sucessos = m.rate429 = m.retries = m.falhas = m.latenciaTotalMs = 0;
  m.maiorBacklog = pendentes;
}, INTERVALO_METRICAS_MS);
if (typeof intervaloMetricas.unref === 'function') intervaloMetricas.unref();

module.exports = { enfileirar, cancelarPendente, estatisticas, statusDe };
