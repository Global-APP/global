const { NSFW_ENABLED, NSFW_URL, NSFW_API_KEY, NSFW_TIMEOUT_MS, NSFW_FALHA_BLOQUEIA } = require('../../config');
const { log, descreverContexto } = require('../../util/logger');

const EXT_AUDIO = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|wma|amr|mid|midi)$/i;

const EXT_MIDIA = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|mp4|webm|mov|mkv|avi)$/i;

// Só o 1º anexo importa: é o único que o global retransmite.
function midiaParaVerificar(message) {
  const atts = message.attachments;
  if (!atts || atts.size === 0) return null;
  const a = atts.first();
  const url = a && a.url;
  if (!url) return null;

  const tipo = String(a.contentType || a.content_type || '').toLowerCase();
  const nome = String(a.filename || a.name || '');
  let caminho;
  try { caminho = new URL(url).pathname; } catch (_) { caminho = String(url); }

  if (tipo.startsWith('audio/') || EXT_AUDIO.test(caminho) || EXT_AUDIO.test(nome)) return null;

  if (tipo.startsWith('image/') || tipo.startsWith('video/') || EXT_MIDIA.test(caminho)) return url;
  return null;
}

/**
 * @param {string} url
 * @returns {Promise<any>}
 */
async function consultarServicoNsfw(url) {
  const headers = { 'content-type': 'application/json' };
  if (NSFW_API_KEY) headers['x-api-key'] = NSFW_API_KEY;

  const res = await fetch(`${NSFW_URL}/check`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(NSFW_TIMEOUT_MS)
  });
  /** @type {any} */
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    /** @type {any} */
    const err = new Error(dados.erro || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return dados;
}

async function checarMidia(message) {
  if (!NSFW_ENABLED) return null;

  const url = midiaParaVerificar(message);
  if (!url) return null;

  try {
    const r = await consultarServicoNsfw(url);
    log.info('NSFW', `${r.tipo} score=${r.score} ${r.nsfw ? 'BLOQUEADA' : 'ok'} em ${r.ms}ms${r.cache ? ' (cache)' : ''} | ${descreverContexto(message)}`);
    return r.nsfw ? 'mídia imprópria (NSFW) não é permitida' : null;
  } catch (e) {
    log.error('NSFW', `Falha ao verificar mídia de ${descreverContexto(message)}`, e);
    if (!NSFW_FALHA_BLOQUEIA) return null;
    if (e.status === 413) return 'a mídia é grande demais para ser verificada';
    if (e.status === 415) return 'tipo de mídia não suportado';
    return 'não consegui verificar a mídia, tente novamente';
  }
}

module.exports = { checarMidia };
