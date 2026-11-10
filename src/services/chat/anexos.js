const { ANEXO_LIMITE_BYTES, ANEXO_TOTAL_BYTES, ANEXO_MAX_ARQUIVOS, ANEXO_TIMEOUT_MS } = require('../../config');
const { log, errMsg } = require('../../util/logger');

function listar(itens) {
  if (!itens) return [];
  if (Array.isArray(itens)) return itens;
  if (typeof itens.values === 'function') return [...itens.values()];
  return [];
}

function nomeDaUrl(url) {
  try {
    const nome = new URL(url).pathname.split('/').pop();
    return nome && /\.[a-z0-9]{2,5}$/i.test(nome) ? decodeURIComponent(nome) : null;
  } catch (_) {
    return null;
  }
}

function coletarItens(message) {
  const anexos = listar(message.attachments)
    .filter((a) => a && a.url)
    .map((a, i) => ({
      url: String(a.url),
      nome: a.filename || a.title || nomeDaUrl(a.url) || `anexo-${i + 1}`,
      tamanho: Number.isFinite(a.size) ? a.size : null
    }));

  const figurinhas = listar(message.stickers)
    .filter((s) => s && s.url && !/\.json(\?|$)/i.test(s.url))
    .map((s, i) => ({
      url: String(s.url),
      nome: nomeDaUrl(s.url) || `${s.name || 'figurinha'}-${i + 1}.png`,
      tamanho: null
    }));

  return [...anexos, ...figurinhas];
}

async function baixar(url) {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(ANEXO_TIMEOUT_MS) });
    if (!resposta.ok) return null;

    const declarado = Number(resposta.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > ANEXO_LIMITE_BYTES) return null;

    const dados = Buffer.from(await resposta.arrayBuffer());
    return dados.byteLength > ANEXO_LIMITE_BYTES ? null : dados;
  } catch (e) {
    log.warn('ANEXO', `Falha ao baixar ${url}: ${errMsg(e)}`);
    return null;
  }
}

async function prepararAnexos(message) {
  const arquivos = [];
  const links = [];
  let total = 0;

  for (const item of coletarItens(message)) {
    const cabe = arquivos.length < ANEXO_MAX_ARQUIVOS
      && (item.tamanho === null || item.tamanho <= ANEXO_LIMITE_BYTES)
      && total + (item.tamanho || 0) <= ANEXO_TOTAL_BYTES;

    const dados = cabe ? await baixar(item.url) : null;
    if (dados && total + dados.byteLength <= ANEXO_TOTAL_BYTES) {
      arquivos.push({ name: item.nome, filename: item.nome, data: dados });
      total += dados.byteLength;
    } else {
      links.push(item.url);
    }
  }

  return { arquivos, links };
}

module.exports = { prepararAnexos };
