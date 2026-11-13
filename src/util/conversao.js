const UNICODE_POR_NOME = {
  closecirclefill: '❌',
  checkboxcirclefill: '✅',
  checkboxfill: '☑️',
  togglefill: '🟢',
  toggleline: '⚪',
  information2fill: 'ℹ️',
  errorwarningfill: '⚠️',
  chat1fill: '💬',
  imagefill: '🖼️',
  earthline1: '🌍',
  heart2fill: '❤️',
  brushaifill: '✨',
  forbidline: '🚫'
};

const COMANDOS_SLASH = new Set(['ping', 'ajuda', 'botinfo', 'conectar', 'desconectar', 'pausar', 'retomar', 'config', 'automod', 'ponte']);

const EMOJI_PERSONALIZADO = /<a?:([\w~]+):\d+>/g;
const EMOJI_PERSONALIZADO_UNICO = /^<a?:([\w~]+):\d+>$/;
const COMANDO_COM_PREFIXO = /\bg\.([a-zà-ú]+)/gi;
const NOMES_PROIBIDOS_NO_WEBHOOK = /(clyde|discord)/gi;

function emojiPersonalizadoParaUnicode(texto) {
  return String(texto).replace(EMOJI_PERSONALIZADO, (_, nome) => UNICODE_POR_NOME[nome] || `:${nome}:`);
}

function comandosParaSlash(texto) {
  return String(texto).replace(COMANDO_COM_PREFIXO, (trecho, nome) => {
    const minusculo = nome.toLowerCase();
    return COMANDOS_SLASH.has(minusculo) ? `/${minusculo}` : trecho;
  });
}

function textoDoBotParaDiscord(texto) {
  return comandosParaSlash(emojiPersonalizadoParaUnicode(texto));
}

function emojiParaReacaoDiscord(emoji) {
  const encontrado = String(emoji).match(EMOJI_PERSONALIZADO_UNICO);
  if (!encontrado) return emoji;
  return UNICODE_POR_NOME[encontrado[1]] || '❓';
}

function converterConteudo(texto, origem, destino) {
  if (!texto || origem === destino) return texto;
  return String(texto)
    .replace(EMOJI_PERSONALIZADO, ':$1:')
    .replace(/<@&\d+>/g, '@cargo')
    .replace(/<@!?\d+>/g, '@usuário')
    .replace(/<#\d+>/g, '#canal')
    .replace(/@(everyone|here)\b/g, '@​$1');
}

function nomeWebhookDiscord(nome) {
  return String(nome)
    .replace(NOMES_PROIBIDOS_NO_WEBHOOK, (trecho) => `${trecho[0]}​${trecho.slice(1)}`)
    .slice(0, 80);
}

function limitar(texto, maximo) {
  const valor = String(texto);
  return valor.length > maximo ? `${valor.slice(0, maximo - 1)}…` : valor;
}

module.exports = {
  COMANDOS_SLASH,
  emojiPersonalizadoParaUnicode,
  comandosParaSlash,
  textoDoBotParaDiscord,
  emojiParaReacaoDiscord,
  converterConteudo,
  nomeWebhookDiscord,
  limitar
};
