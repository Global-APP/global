const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../../lib/client');
const { DONO_ID, MUBI_ID, COR_EMBED_MUBI } = require('../../config');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const { corDaBadge } = require('../badges');

const AVATAR_WEBHOOK_GLOBAL = 'https://fluxerusercontent.com/avatars/1562253521942745089/152b6f43.webp?size=240';

function obterIconeServidor(guild) {
  if (!guild) return null;

  if (typeof guild.iconURL === 'function') {
    try {
      const url = guild.iconURL({ extension: 'webp', forceStatic: true, size: 128 }) || guild.iconURL();
      if (url) return String(url).replace(/\.(?:png|jpe?g|gif)(?=\?|$)/i, '.webp');
    } catch (_) {
      try {
        const url = guild.iconURL();
        if (url) return String(url).replace(/\.(?:png|jpe?g|gif)(?=\?|$)/i, '.webp');
      } catch (_) {}
    }
  }

  if (guild.icon) {
    return `https://fluxerusercontent.com/icons/${guild.id}/${guild.icon}.webp`;
  }

  return null;
}

async function infoMensagem(message, preferenciasExibicao) {
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

  const configExibicao = preferenciasExibicao || guildConfig;
  const mostrarIcone = !configExibicao || configExibicao.mostrarIcone !== false;
  return {
    guildId,
    modoMensagem: configExibicao && configExibicao.modoMensagem === 'cru' ? 'cru' : 'embed',
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

function descreverUrlMidia(valor) {
  if (!valor) return null;
  try {
    const url = new URL(String(valor));
    const extensao = url.pathname.match(/\.([a-z0-9]{2,8})$/i);
    return { host: url.hostname, extensao: extensao ? extensao[1].toLowerCase() : null };
  } catch (_) {
    return null;
  }
}

function resumirMidiaMensagem(message = {}) {
  const attachments = listar(message.attachments).map((anexo) => ({
    tipo: anexo.contentType || 'desconhecido',
    bytes: Number.isFinite(anexo.size) ? anexo.size : null,
    dimensoes: anexo.width && anexo.height ? `${anexo.width}x${anexo.height}` : null,
    duracaoSegundos: Number.isFinite(anexo.duration) ? anexo.duration : null,
    url: descreverUrlMidia(anexo.url)
  }));
  const embeds = listar(message.embeds).map((embed) => ({
    tipo: embed.type || 'desconhecido',
    video: embed.video ? {
      contentType: embed.video.contentType || null,
      dimensoes: embed.video.width && embed.video.height ? `${embed.video.width}x${embed.video.height}` : null,
      url: descreverUrlMidia(embed.video.url)
    } : null,
    imagem: embed.image ? {
      contentType: embed.image.contentType || null,
      dimensoes: embed.image.width && embed.image.height ? `${embed.image.width}x${embed.image.height}` : null,
      url: descreverUrlMidia(embed.image.url)
    } : null,
    audio: embed.audio ? {
      contentType: embed.audio.contentType || null,
      url: descreverUrlMidia(embed.audio.url)
    } : null
  }));
  const links = [...String(message.content || '').matchAll(/https?:\/\/[^\s<>]+/gi)]
    .map((match) => descreverUrlMidia(match[0].replace(/[),.!?]+$/, '')))
    .filter(Boolean);
  const stickers = listar(message.stickers).map((sticker) => ({
    formato: sticker.formatType || sticker.format || null,
    url: descreverUrlMidia(sticker.url)
  }));

  return JSON.stringify({
    anexos: attachments,
    embeds,
    links,
    stickers,
    total: attachments.length + embeds.length + stickers.length
  });
}

function ehUrlVideo(valor) {
  try {
    return /\.(?:mp4|m4v|mov|webm|ogv|avi|mkv)$/i.test(new URL(String(valor)).pathname);
  } catch (_) {
    return false;
  }
}

function ehAnexoVideo(anexo) {
  return String(anexo.contentType || '').toLowerCase().startsWith('video/') || ehUrlVideo(anexo.url);
}

function obterLinksVideo(message = {}) {
  const anexos = listar(message.attachments)
    .filter((anexo) => anexo && anexo.url && ehAnexoVideo(anexo))
    .map((anexo) => String(anexo.url));
  const linksNoTexto = [...String(message.content || '').matchAll(/https?:\/\/[^\s<>]+/gi)]
    .map((match) => match[0].replace(/[),.!?]+$/, ''))
    .filter(ehUrlVideo);
  return [...new Set([...anexos, ...linksNoTexto])];
}

function montarPayloadVideo(message = {}) {
  const links = obterLinksVideo(message);
  if (links.length === 0) return null;
  return { content: links.join('\n'), allowedMentions: { parse: [] } };
}

function assinaturaAnexosMensagem(message = {}) {
  return JSON.stringify(listar(message.attachments)
    .map((anexo) => ({ url: anexo && anexo.url, contentType: anexo && anexo.contentType, size: anexo && anexo.size })));
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

function ehLinkGifKlipy(valor) {
  try {
    const url = new URL(valor);
    return /(^|\.)klipy\.com$/i.test(url.hostname) && /^\/gifs\//i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function obterImagemPreviewKlipy(message) {
  const linksOrigem = [...String(message.content || '').matchAll(/https?:\/\/[^\s<>]+/gi)]
    .map((match) => match[0].replace(/[),.!?]+$/, ''));
  return listar(message.embeds)
    .filter((preview) => [preview && preview.url, ...linksOrigem].some(ehLinkGifKlipy))
    .map((preview) => preview.image && preview.image.url || preview.thumbnail && preview.thumbnail.url)
    .find(Boolean) || null;
}

function removerLinksGifKlipy(texto) {
  return String(texto || '')
    .replace(/https?:\/\/[^\s<>]+/gi, (url) => ehLinkGifKlipy(url.replace(/[),.!?]+$/, '')) ? '' : url)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function removerLinksVideo(texto) {
  return String(texto || '')
    .replace(/https?:\/\/[^\s<>]+/gi, (url) => ehUrlVideo(url.replace(/[),.!?]+$/, '')) ? '' : url)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function mascararLinksVideo(texto) {
  return String(texto || '').replace(/https?:\/\/[^\s<>]+/gi, (url) => {
    const link = url.replace(/[),.!?]+$/, '');
    if (!ehUrlVideo(link)) return url;
    return `[Vídeo](${link})${url.slice(link.length)}`;
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

  const profileUrl = autor.id ? `https://web.fluxer.app/users/${encodeURIComponent(String(autor.id))}` : null;
  const creditoDesenvolvedor = [DONO_ID, MUBI_ID].includes(String(autor.id))
    ? ' - Desenvolvedor do Global'
    : '';
  const nomeAutorEmbed = `${autor.username ? `${nome} (@${autor.username})` : nome}${creditoDesenvolvedor}`;
  embed.setAuthor({ name: nomeAutorEmbed, ...(avatarUrl ? { iconURL: avatarUrl } : {}), ...(profileUrl ? { url: profileUrl } : {}) });
  if (texto) embed.setDescription(texto);

  const imagemAnexo = listar(message.attachments)
    .find((anexo) => anexo && anexo.url && /\.(?:png|jpe?g|gif|webp)(?:\?|$)/i.test(anexo.url));
  if (imagemAnexo) {
    embed.setImage(imagemAnexo.url);
    return embed;
  }

  const previewImagem = obterImagemPreviewKlipy(message);
  if (previewImagem) embed.setImage(previewImagem);
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
  const embedMode = info && info.modoMensagem === 'embed';
  const attachments = listar(message.attachments).filter((anexo) => anexo && anexo.url);
  const imagemEmbedAnexo = embedMode
    ? attachments.find((anexo) => /\.(?:png|jpe?g|gif|webp)(?:\?|$)/i.test(anexo.url))
    : null;
  const videoLinks = obterLinksVideo(message);
  const files = attachments
    .filter((anexo) => !ehAnexoVideo(anexo) && (!imagemEmbedAnexo || anexo.url !== imagemEmbedAnexo.url))
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
  const linksVideoAdicionais = videoLinks.filter((url) => !texto.includes(url));
  const textoComLinksVideo = mascararLinksVideo([texto, ...linksVideoAdicionais].filter(Boolean).join('\n\n'));
  const textoEmbed = embedMode ? removerLinksVideo(removerLinksGifKlipy(texto)) : texto;
  const nomeMascarado = String(nome).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const linkUsuario = autor.id
    ? `[${nomeMascarado}](https://web.fluxer.app/users/${encodeURIComponent(String(autor.id))})`
    : '';
  const creditoDesenvolvedor = [DONO_ID, MUBI_ID].includes(String(autor.id))
    ? ' - Desenvolvedor do Global'
    : '';
  const detalhes = embedMode ? '' : [
    info && info.nomeServidor ? `Enviado de: ${info.nomeServidor}` : '',
    linkUsuario ? `${linkUsuario}${creditoDesenvolvedor}` : ''
  ].filter(Boolean).join(' • ');
  const atribuicao = detalhes ? `-# ${detalhes}` : '';
  const content = [textoComLinksVideo, atribuicao].filter(Boolean).join('\n\n');
  const payload = {
    username: embedMode ? 'Global' : nomeWebhook,
    content: embedMode ? '' : content,
    allowedMentions: { parse: [] }
  };

  if (embedMode) payload.embeds = [montarEmbedMensagem(message, info, [textoEmbed, atribuicao].filter(Boolean).join('\n\n'))];

  const webhookAvatarUrl = embedMode ? AVATAR_WEBHOOK_GLOBAL : avatarUrl;
  if (webhookAvatarUrl) payload.avatarUrl = webhookAvatarUrl;
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
    embeds: [],
    allowedMentions: { parse: [] }
  };
  if (info && info.modoMensagem === 'embed') {
    payload.content = '';
    payload.embeds = [montarEmbedMensagem(message, info, message.content || '')];
  }
  return payload;
}

module.exports = {
  infoMensagem,
  montarPayloadWebhook,
  montarPayloadEdicao,
  resumirMidiaMensagem,
  ehAnexoVideo,
  ehUrlVideo,
  obterLinksVideo,
  montarPayloadVideo,
  assinaturaAnexosMensagem,
  removerLinksVideo
};
