const fs = require('fs');
const path = require('path');
const { PASTA_LOGS } = require('../config');

const CORES_LOG = {
  INFO: '\x1b[36m',
  OK: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  RESET: '\x1b[0m',
  DIM: '\x1b[90m'
};

if (!fs.existsSync(PASTA_LOGS)) fs.mkdirSync(PASTA_LOGS, { recursive: true });

function errMsg(e) {
  return e && e.message ? e.message : String(e);
}

function escreverLog(nivel, tag, msg, detalhe) {
  const agora = new Date();
  const ts = agora.toISOString().replace('T', ' ').slice(0, 23);
  const linha = `[${ts}] [${nivel.padEnd(5)}] [${tag}] ${msg}`;

  const cor = CORES_LOG[nivel] || '';
  const stream = nivel === 'ERROR' ? console.error : console.log;
  stream(`${CORES_LOG.DIM}[${ts}]${CORES_LOG.RESET} ${cor}[${nivel.padEnd(5)}]${CORES_LOG.RESET} ${CORES_LOG.DIM}[${tag}]${CORES_LOG.RESET} ${msg}`);

  // Stack e detalhes vão só para o arquivo, para não poluir o console.
  let texto = linha + '\n';
  if (detalhe) texto += `    ${String(detalhe).replace(/\n/g, '\n    ')}\n`;
  const arquivo = path.join(PASTA_LOGS, `${agora.toISOString().slice(0, 10)}.log`);
  fs.appendFile(arquivo, texto, () => {});
}

const log = {
  info: (tag, msg) => escreverLog('INFO', tag, msg),
  ok: (tag, msg) => escreverLog('OK', tag, msg),
  warn: (tag, msg, det) => escreverLog('WARN', tag, msg, det),
  error: (tag, msg, e) => escreverLog('ERROR', tag, e ? `${msg}: ${errMsg(e)}` : msg, e && e.stack ? e.stack : null)
};

function descreverContexto(message) {
  const g = message.guild;
  const guildId = message.guildId || (g ? g.id : '?');
  const guildNome = g && g.name ? g.name : 'Desconhecido';
  const a = message.author;
  const autorNome = a ? (a.username || '?') : '?';
  return `${autorNome} (${a ? a.id : '?'}) em "${guildNome}" (${guildId})`;
}

module.exports = { log, errMsg, descreverContexto };
