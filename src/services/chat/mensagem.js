const { client } = require('../../lib/client');

async function infoMensagem(message) {
  const guildId = String(message.guildId || (message.guild ? message.guild.id : '0'));
  const guild = message.guild || client.guilds.get(guildId);
  return {
    guildId,
    nomeServidor: guild && guild.name ? guild.name : 'Servidor Desconhecido'
  };
}

function listar(itens) {
  if (!itens) return [];
  if (Array.isArray(itens)) return itens;
  if (typeof itens.values === 'function') return [...itens.values()];
  if (typeof itens[Symbol.iterator] === 'function') return [...itens];
  return [];
}

function nomeDaFigurinha(figurinha, indice) {
  if (figurinha.name) return figurinha.name;
  try {
    const nome = new URL(figurinha.url).pathname.split('/').pop();
    if (nome && /\.[a-z0-9]{2,5}$/i.test(nome)) return nome;
  } catch (_) {
    // Usa o nome genérico abaixo para URL incomum.
  }
  return `figurinha-${indice + 1}.png`;
}

/**
 * @param {any} message
 * @param {any} info
 * @param {any} [replyTarget]
 * @returns {any}
 */
function montarPayloadWebhook(message, info, replyTarget) {
  const autor = message.author || {};
  const nome = (message.member && message.member.displayName)
    || autor.displayName
    || autor.globalName
    || autor.username
    || 'Usuário';
  const nomeWebhook = autor.username ? `${nome} (@${autor.username})` : nome;
  const avatarUrl = typeof autor.displayAvatarURL === 'function' ? autor.displayAvatarURL() : null;
  const files = listar(message.attachments)
    .filter((anexo) => anexo && anexo.url)
    .map((anexo, indice) => ({
      name: anexo.filename || anexo.title || `anexo-${indice + 1}`,
      url: anexo.url,
      filename: anexo.filename || anexo.title || `anexo-${indice + 1}`
    }));

  for (const [indice, figurinha] of listar(message.stickers).entries()) {
    if (!figurinha || !figurinha.url || /\.json(\?|$)/i.test(figurinha.url)) continue;
    files.push({
      name: nomeDaFigurinha(figurinha, indice),
      url: figurinha.url,
      filename: nomeDaFigurinha(figurinha, indice)
    });
  }

  const texto = message.content || '';
  const nomeMascarado = String(nome).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const linkUsuario = autor.id
    ? `[${nomeMascarado}](https://web.fluxer.app/users/${encodeURIComponent(String(autor.id))})`
    : '';
  const detalhes = [
    info && info.nomeServidor ? `Enviado de: ${info.nomeServidor}` : '',
    linkUsuario
  ].filter(Boolean).join(' • ');
  const atribuicao = detalhes ? `-# ${detalhes}` : '';
  const content = [texto, atribuicao].filter(Boolean).join('\n\n');
  const payload = {
    username: nomeWebhook,
    content,
    allowedMentions: { parse: [] }
  };

  if (avatarUrl) payload.avatarUrl = avatarUrl;
  if (files.length > 0) payload.files = files;
  if (replyTarget && replyTarget.channelId && replyTarget.messageId) {
    payload.replyTo = replyTarget;
    payload.ping = false;
  }

  return payload;
}

function montarPayloadEdicao(message) {
  return {
    content: message.content || '',
    embeds: [],
    allowedMentions: { parse: [] }
  };
}

module.exports = { infoMensagem, montarPayloadWebhook, montarPayloadEdicao };
