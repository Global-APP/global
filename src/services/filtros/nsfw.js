const { NSFW_URL, NSFW_API_KEY, NSFW_TIMEOUT_MS, NSFW_FALHA_BLOQUEIA } = require('../../config');
const { log, descreverContexto } = require('../../util/logger');

const EXT_AUDIO = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|wma|amr|mid|midi)$/i;

const EXT_MIDIA = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|mp4|webm|mov|mkv|avi)$/i;

const MAX_MIDIAS_VERIFICADAS = 10;

function listar(itens) {
  if (!itens) return [];
  if (Array.isArray(itens)) return itens;
  if (typeof itens.values === 'function') return [...itens.values()];
  return [];
}

function ehMidiaVerificavel(item) {
  const url = item && item.url;
  if (!url) return false;

  const tipo = String(item.contentType || item.content_type || '').toLowerCase();
  const nome = String(item.filename || item.name || '');
  let caminho;
  try { caminho = new URL(url).pathname; } catch (_) { caminho = String(url); }

  if (tipo.startsWith('audio/') || EXT_AUDIO.test(caminho) || EXT_AUDIO.test(nome)) return false;
  return tipo.startsWith('image/') || tipo.startsWith('video/') || EXT_MIDIA.test(caminho);
}

function midiasParaVerificar(message) {
  const anexos = listar(message.attachments).filter(ehMidiaVerificavel);
  const figurinhas = listar(message.stickers).filter((f) => f && f.url && !/\.json(\?|$)/i.test(f.url));
  return [...anexos, ...figurinhas].map((m) => String(m.url)).slice(0, MAX_MIDIAS_VERIFICADAS);
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

async function checarUrl(message, url) {
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

async function checarMidia(message) {
  for (const url of midiasParaVerificar(message)) {
    const motivo = await checarUrl(message, url);
    if (motivo) return motivo;
  }
  return null;
}

module.exports = { checarMidia };
