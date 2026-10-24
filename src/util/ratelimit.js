const { log, errMsg } = require('./logger');

const janelaEnvios = new Map();

let ultimoLogRL = 0;

let relaysAtivos = 0;

function marcarEnvio(canalId) {
  const k = String(canalId);
  const arr = janelaEnvios.get(k) || [];
  arr.push(Date.now());
  janelaEnvios.set(k, arr);
}

function enviosNaJanela(canalId, ms = 10_000) {
  const arr = janelaEnvios.get(String(canalId));
  if (!arr) return 0;
  const limite = Date.now() - ms;
  while (arr.length && arr[0] < limite) arr.shift();
  return arr.length;
}

function totalEnviosNaJanela(ms = 10_000) {
  let t = 0;
  for (const k of janelaEnvios.keys()) t += enviosNaJanela(k, ms);
  return t;
}

function ehRateLimit(e) {
  return !!e && (
    e.name === 'RateLimitError' ||
    e.constructor?.name === 'RateLimitError' ||
    /rate ?limit/i.test(errMsg(e))
  );
}

function logRateLimit(e, ctx = '', canalId = null) {
  if (!ehRateLimit(e)) return;
  const agora = Date.now();
  // Evita ~11 linhas iguais por mensagem retransmitida.
  if (agora - ultimoLogRL < 2000) return;
  ultimoLogRL = agora;

  const dados = {};
  for (const k of Object.getOwnPropertyNames(e)) {
    if (k === 'stack' || k === 'response' || k === 'request') continue;
    const v = e[k];
    if (typeof v === 'function') continue;
    dados[k] = v;
  }

  const h = e.headers ?? e.response?.headers;
  if (h) {
    const get = typeof h.get === 'function' ? (n) => h.get(n) : (n) => h[n];
    for (const n of [
      'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
      'x-ratelimit-reset-after', 'x-ratelimit-bucket', 'x-ratelimit-global', 'x-ratelimit-scope'
    ]) {
      const v = get(n);
      if (v != null) dados[`h:${n}`] = v;
    }
  }
  if (e.response?.status) dados.httpStatus = e.response.status;
  if (e.cause) dados.cause = errMsg(e.cause);

  let json;
  try { json = JSON.stringify(dados, (_, v) => (typeof v === 'bigint' ? v.toString() : v)); }
  catch (_) { json = String(Object.keys(dados)); }

  const contagem =
    `nossos sends em 10s: total=${totalEnviosNaJanela()}` +
    (canalId ? `, canal ${canalId}=${enviosNaJanela(canalId)}` : '') +
    ` | relays em andamento=${relaysAtivos}`;

  log.warn('RATELIMIT', `${ctx} | ${contagem}`, json);
}

setInterval(() => {
  for (const k of janelaEnvios.keys()) if (enviosNaJanela(k) === 0) janelaEnvios.delete(k);
}, 60_000);

module.exports = { marcarEnvio, logRateLimit };
