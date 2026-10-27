const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../../lib/client');
const { DONO_ID, MUBI_ID, COR_EMBED_MUBI } = require('../../config');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const { corDaBadge } = require('../badges');

function obterIconeServidor(guild) {
  if (!guild) return null;

  if (typeof guild.iconURL === 'function') {
    try {
      const url = guild.iconURL({ extension: 'gif', forceStatic: false, size: 128 }) || guild.iconURL();
      if (url) return url;
    } catch (_) {
      try {
        const url = guild.iconURL();
        if (url) return url;
      } catch (_) {}
    }
  }

  if (guild.icon) {
    const extension = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
    return `https://fluxerusercontent.com/icons/${guild.id}/${guild.icon}.${extension}?size=128`;
  }

  return null;
}

async function infoMensagem(message) {
  const guildId = String(message.guildId || (message.guild ? message.guild.id : '0'));
  const guild = message.guild || client.guilds.get(guildId);
  const autor = message.author || {};
  const [guildConfig, usuario] = await Promise.all([
    Guild.findOne({ guildId }).lean(),
    User.findOne({ userId: String(autor.id) }).select('staff badges selectedBadge').lean()
  ]);
  const corGuild = guildConfig && guildConfig.cor != null ? guildConfig.cor : 0x0B0B0B;
  let corEmbed = corDaBadge(usuario) ?? corGuild;

  if (String(autor.id) === DONO_ID) corEmbed = 0xC0B29D;
  else if (String(autor.id) === MUBI_ID) corEmbed = COR_EMBED_MUBI;

  const mostrarIcone = !guildConfig || guildConfig.mostrarIcone !== false;
  return {
    guildId,
    modoMensagem: guildConfig && guildConfig.modoMensagem === 'embed' ? 'embed' : 'cru',
    nomeServidor: guild && guild.name ? guild.name : 'Servidor Desconhecido',
    iconeServidor: mostrarIcone ? obterIconeServidor(guild) : null,
    corEmbed
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

function montarEmbedContexto(info) {
  return new EmbedBuilder()
    .setColor(info && info.corEmbed != null ? info.corEmbed : 0x0B0B0B)
    .setFooter({
      text: info && info.nomeServidor ? info.nomeServidor : 'Servidor Desconhecido',
      ...(info && info.iconeServidor ? { iconURL: info.iconeServidor } : {})
    });
}

function montarEmbedMensagem(message, info, texto) {
  const embed = montarEmbedContexto(info);
  const autor = message.author || {};
  const nome = (message.member && message.member.displayName)
    || autor.displayName
    || autor.globalName
    || autor.username
    || 'Usuário';
  const avatarUrl = typeof autor.displayAvatarURL === 'function' ? autor.displayAvatarURL() : null;

  embed.setAuthor({ name: nome, ...(avatarUrl ? { iconURL: avatarUrl } : {}) });
  if (texto) embed.setDescription(texto);

  const imagem = listar(message.attachments)
    .find((anexo) => anexo && anexo.url && /\.(?:png|jpe?g|gif|webp)(?:\?|$)/i.test(anexo.url));
  if (imagem) embed.setImage(imagem.url);
  return embed;
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
  const creditoDesenvolvedor = [DONO_ID, MUBI_ID].includes(String(autor.id))
    ? ' - Desenvolvedor do Global'
    : '';
  const detalhes = [
    info && info.nomeServidor ? `Enviado de: ${info.nomeServidor}` : '',
    linkUsuario ? `${linkUsuario}${creditoDesenvolvedor}` : ''
  ].filter(Boolean).join(' • ');
  const atribuicao = detalhes ? `-# ${detalhes}` : '';
  const content = [texto, atribuicao].filter(Boolean).join('\n\n');
  const embedMode = info && info.modoMensagem === 'embed';
  const payload = {
    username: nomeWebhook,
    content: embedMode ? '' : content,
    allowedMentions: { parse: [] }
  };

  if (embedMode) payload.embeds = [montarEmbedMensagem(message, info, [texto, atribuicao].filter(Boolean).join('\n\n'))];

  if (avatarUrl) payload.avatarUrl = avatarUrl;
  if (files.length > 0) payload.files = files;
  if (replyTarget && replyTarget.channelId && replyTarget.messageId) {
    payload.replyTo = replyTarget;
    payload.ping = false;
  }

  return payload;
}

function montarPayloadEdicao(message, info) {
  const payload = {
    content: message.content || '',
    allowedMentions: { parse: [] }
  };
  if (info && info.modoMensagem === 'embed') {
    payload.content = '';
    payload.embeds = [montarEmbedMensagem(message, info, message.content || '')];
  }
  return payload;
}

module.exports = { infoMensagem, montarPayloadWebhook, montarPayloadEdicao };
