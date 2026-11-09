const { log } = require('../../util/logger');
const { ehRateLimit, definirContadorRelays } = require('../../util/ratelimit');

const CONCORRENCIA_GLOBAL = Number(process.env.ENTREGA_CONCORRENCIA) || 10;
const TAXA_MAXIMA = Number(process.env.ENTREGA_REQS_POR_SEGUNDO) || 35;
const TAXA_MINIMA = Math.min(5, TAXA_MAXIMA);
const MAX_TENTATIVAS_429 = 8;
const MAX_TENTATIVAS_ERRO = 3;
const ESPERA_MIN_MS = 50;
const ESPERA_MAX_MS = 60_000;
const ESPERA_429_PADRAO_MS = 1000;
const MAX_ALTAS_SEGUIDAS = 5;
const INTERVALO_METRICAS_MS = 60_000;
const INTERVALO_LOG_429_MS = 3000;
const INTERVALO_CORTE_TAXA_MS = 2000;
const INTERVALO_RECUPERACAO_MS = 5000;
const PASSO_RECUPERACAO = 0.1;
const FATOR_RAJADA = 0.3;

const destinos = new Map();

let emVoo = 0;
let pendentes = 0;
let globalPausadoAte = 0;
let taxaAtual = TAXA_MAXIMA;
let ultimoCorteTaxa = 0;
let ultimoAjusteTaxa = 0;
let tokens = capacidadeRajada();
let ultimoReabastecimento = Date.now();
let timer = null;
let bombeando = false;
let ultimoLog429 = 0;
let suprimidos429 = 0;

const metricas = {
  requisicoes: 0,
  sucessos: 0,
  rate429: 0,
  retries: 0,
  falhas: 0,
  latenciaTotalMs: 0,
  maiorBacklog: 0
};

function capacidadeRajada() {
  return Math.max(1, Math.floor(taxaAtual * FATOR_RAJADA));
}

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

function erroTransiente(e) {
  if (e?.name === 'AbortError') return true;
  const status = statusDe(e);
  if (status === undefined) return true;
  return status === 408 || status >= 500;
}

function destinoDe(chave) {
  let destino = destinos.get(chave);
  if (!destino) {
    destino = {
      chave,
      alta: [],
      normal: [],
      pendentesPorDedupe: new Map(),
      emVoo: false,
      pausadoAte: 0,
      altasSeguidas: 0
    };
    destinos.set(chave, destino);
  }
  return destino;
}

function criarJob(fn, prioridade, dedupe, idempotente) {
  const job = { fn, prioridade, dedupe, idempotente, tentativas429: 0, tentativasErro: 0 };
  job.promessa = new Promise((resolve, reject) => {
    job.resolve = resolve;
    job.reject = reject;
  });
  return job;
}

function filaDoJob(destino, job) {
  return job.prioridade === 'alta' ? destino.alta : destino.normal;
}

function temPendente(destino) {
  return destino.alta.length > 0 || destino.normal.length > 0;
}

function escolherJob(destino) {
  const deixarNormalPassar = destino.altasSeguidas >= MAX_ALTAS_SEGUIDAS && destino.normal.length > 0;
  if (destino.alta.length > 0 && !deixarNormalPassar) {
    destino.altasSeguidas++;
    return destino.alta.shift();
  }
  destino.altasSeguidas = 0;
  return destino.normal.shift() || destino.alta.shift();
}

function reabastecer(agora) {
  const decorrido = agora - ultimoReabastecimento;
  if (decorrido <= 0) return;
  tokens = Math.min(capacidadeRajada(), tokens + (decorrido * taxaAtual) / 1000);
  ultimoReabastecimento = agora;
}

function reduzirTaxa(agora) {
  if (agora - ultimoCorteTaxa < INTERVALO_CORTE_TAXA_MS) return;
  ultimoCorteTaxa = agora;
  ultimoAjusteTaxa = agora;
  taxaAtual = Math.max(TAXA_MINIMA, taxaAtual / 2);
  tokens = Math.min(tokens, capacidadeRajada());
}

function recuperarTaxa(agora) {
  if (taxaAtual >= TAXA_MAXIMA) return;
  const passos = Math.floor((agora - ultimoAjusteTaxa) / INTERVALO_RECUPERACAO_MS);
  if (passos < 1) return;
  taxaAtual = Math.min(TAXA_MAXIMA, taxaAtual + passos * TAXA_MAXIMA * PASSO_RECUPERACAO);
  ultimoAjusteTaxa += passos * INTERVALO_RECUPERACAO_MS;
}

function logar429(chave, limite, job, erro) {
  const agora = Date.now();
  if (agora - ultimoLog429 < INTERVALO_LOG_429_MS) {
    suprimidos429++;
    return;
  }
  ultimoLog429 = agora;
  const repetidos = suprimidos429 > 0 ? ` (+${suprimidos429} nos últimos segundos)` : '';
  suprimidos429 = 0;
  log.warn(
    'ENTREGA',
    `429 ${limite.global ? 'GLOBAL' : 'de canal'} | canal=${chave} | espera=${(limite.retryAfterMs / 1000).toFixed(2)}s | ` +
    `tentativa=${job.tentativas429 + 1}/${MAX_TENTATIVAS_429} | taxa agora=${Math.round(taxaAtual)}/s | ` +
    `pendentes=${pendentes} em voo=${emVoo}${repetidos} | ${erro?.message || ''}`
  );
}

function agendarBomba(ms = 0) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    bombear();
  }, Math.max(0, ms));
}

function bombear() {
  if (bombeando) return;
  bombeando = true;
  try {
    const agora = Date.now();
    recuperarTaxa(agora);
    reabastecer(agora);
    let proximo = Infinity;

    if (globalPausadoAte > agora) {
      proximo = globalPausadoAte - agora;
    } else {
      for (const destino of [...destinos.values()]) {
        if (destino.emVoo) continue;
        if (!temPendente(destino)) {
          if (destino.pausadoAte <= agora) destinos.delete(destino.chave);
          continue;
        }
        if (destino.pausadoAte > agora) {
          proximo = Math.min(proximo, destino.pausadoAte - agora);
          continue;
        }
        if (emVoo >= CONCORRENCIA_GLOBAL) break;
        if (tokens < 1) {
          proximo = Math.min(proximo, Math.ceil(((1 - tokens) * 1000) / taxaAtual));
          break;
        }
        tokens -= 1;
        destinos.delete(destino.chave);
        destinos.set(destino.chave, destino);
        iniciar(destino, escolherJob(destino));
      }
    }

    if (Number.isFinite(proximo)) agendarBomba(proximo + 1);
  } finally {
    bombeando = false;
  }
}

function iniciar(destino, job) {
  if (job.dedupe) destino.pendentesPorDedupe.delete(job.dedupe);
  pendentes--;
  destino.emVoo = true;
  emVoo++;
  executar(destino, job);
}

function reenfileirarNaFrente(destino, job) {
  filaDoJob(destino, job).unshift(job);
  if (job.dedupe) destino.pendentesPorDedupe.set(job.dedupe, job);
  pendentes++;
}

function tratarRateLimit(destino, job, erro, limite) {
  metricas.rate429++;
  reduzirTaxa(Date.now());
  logar429(destino.chave, limite, job, erro);

  const espera = Math.min(ESPERA_MAX_MS, Math.max(ESPERA_MIN_MS, limite.retryAfterMs)) + Math.floor(Math.random() * 100);
  if (limite.global) globalPausadoAte = Math.max(globalPausadoAte, Date.now() + espera);
  else destino.pausadoAte = Math.max(destino.pausadoAte, Date.now() + espera);

  job.tentativas429++;
  if (job.tentativas429 <= MAX_TENTATIVAS_429) {
    metricas.retries++;
    reenfileirarNaFrente(destino, job);
    return;
  }
  metricas.falhas++;
  job.reject(erro);
}

function tratarErro(destino, job, erro) {
  const podeRepetir = job.idempotente && erroTransiente(erro) && job.tentativasErro < MAX_TENTATIVAS_ERRO;
  if (!podeRepetir) {
    metricas.falhas++;
    job.reject(erro);
    return;
  }
  job.tentativasErro++;
  metricas.retries++;
  destino.pausadoAte = Math.max(destino.pausadoAte, Date.now() + 500 * job.tentativasErro);
  reenfileirarNaFrente(destino, job);
}

async function executar(destino, job) {
  const inicio = Date.now();
  metricas.requisicoes++;
  try {
    const resultado = await job.fn();
    metricas.sucessos++;
    metricas.latenciaTotalMs += Date.now() - inicio;
    job.resolve(resultado);
  } catch (erro) {
    const limite = lerRateLimit(erro);
    if (limite) tratarRateLimit(destino, job, erro, limite);
    else tratarErro(destino, job, erro);
  } finally {
    destino.emVoo = false;
    emVoo--;
    agendarBomba(0);
  }
}

function enfileirar(chave, fn, opcoes = {}) {
  const destino = destinoDe(String(chave));
  const { prioridade = 'normal', dedupe = null, idempotente = false } = opcoes;

  if (dedupe) {
    const existente = destino.pendentesPorDedupe.get(dedupe);
    if (existente) {
      existente.fn = fn;
      return existente.promessa;
    }
  }

  const job = criarJob(fn, prioridade, dedupe, idempotente);
  filaDoJob(destino, job).push(job);
  if (dedupe) destino.pendentesPorDedupe.set(dedupe, job);
  pendentes++;
  metricas.maiorBacklog = Math.max(metricas.maiorBacklog, pendentes);
  agendarBomba(0);
  return job.promessa;
}

function cancelarPendente(chave, dedupe) {
  const destino = destinos.get(String(chave));
  const job = destino && destino.pendentesPorDedupe.get(dedupe);
  if (!destino || !job) return false;

  const faixa = filaDoJob(destino, job);
  const posicao = faixa.indexOf(job);
  if (posicao === -1) return false;

  faixa.splice(posicao, 1);
  destino.pendentesPorDedupe.delete(dedupe);
  pendentes--;
  job.resolve('cancelado');
  return true;
}

function estatisticas() {
  return { emVoo, pendentes, destinosAtivos: destinos.size, taxaAtual, ...metricas };
}

function registrarMetricas() {
  const m = metricas;
  if (m.requisicoes === 0 && pendentes === 0) return;

  const latenciaMedia = m.sucessos > 0 ? Math.round(m.latenciaTotalMs / m.sucessos) : 0;
  log.info(
    'ENTREGA',
    `${INTERVALO_METRICAS_MS / 1000}s | reqs=${m.requisicoes} ok=${m.sucessos} 429=${m.rate429} retries=${m.retries} ` +
    `falhas=${m.falhas} | latência média=${latenciaMedia}ms | taxa=${Math.round(taxaAtual)}/s | ` +
    `backlog=${pendentes} (pico ${m.maiorBacklog}) em voo=${emVoo}`
  );

  m.requisicoes = 0;
  m.sucessos = 0;
  m.rate429 = 0;
  m.retries = 0;
  m.falhas = 0;
  m.latenciaTotalMs = 0;
  m.maiorBacklog = pendentes;
}

definirContadorRelays(() => emVoo + pendentes);

const intervaloMetricas = setInterval(registrarMetricas, INTERVALO_METRICAS_MS);
if (typeof intervaloMetricas.unref === 'function') intervaloMetricas.unref();

module.exports = { enfileirar, cancelarPendente, estatisticas, statusDe };
