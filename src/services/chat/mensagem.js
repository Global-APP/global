const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../../lib/client');
const { DONO_ID, MUBI_ID, COR_EMBED_MUBI, ROTULO_BADGE, ehDev, NOME_WEBHOOK_MAX } = require('../../config');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const { corDaBadge, badgeAtiva } = require('../badges');

const CONTEUDO_MAX = 2000;
const RESERVA_MENCAO = 40;

function escaparMarkdown(texto) {
  return String(texto).replace(/[\\`*_~|[\]<>]/g, '\\$&');
}

function montarNomeWebhook(nickname, username, discriminator, rotulo) {
  const tag = discriminator === undefined || discriminator === null ? '' : `#${discriminator}`;
  const sufixo = ` (@${username}${tag})${rotulo ? ` — ${rotulo}` : ''}`;
  const espaco = NOME_WEBHOOK_MAX - sufixo.length;

  let nick = String(nickname);
  if (nick.length > espaco) nick = espaco > 1 ? `${nick.slice(0, espaco - 1)}…` : nick.slice(0, 1);
  return `${nick}${sufixo}`.slice(0, NOME_WEBHOOK_MAX);
}

function obterIconeServidor(g) {
  if (!g) return null;

  if (typeof g.iconURL === 'function') {
    try {
      const url = g.iconURL({ extension: 'gif', forceStatic: false, size: 128 }) || g.iconURL();
      if (url) return url;
    } catch (_) {
      try {
        const url = g.iconURL();
        if (url) return url;
      } catch (_) {}
    }
  }

  if (g.icon) {
    const animado = String(g.icon).startsWith('a_');
    const ext = animado ? 'gif' : 'png';
    return `https://fluxerusercontent.com/icons/${g.id}/${g.icon}.${ext}?size=128`;
  }

  return null;
}

async function infoMensagem(message) {
  const autor = message.author;
  const guildId = String(message.guildId || (message.guild ? message.guild.id : '0'));
  const g = message.guild || client.guilds.get(guildId);
  const nomeServidor = g && g.name ? g.name : 'Servidor Desconhecido';

  const nickname = autor.displayName || autor.username;
  const username = autor.username;

  const [guildConfig, usuario] = await Promise.all([
    Guild.findOne({ guildId }).lean(),
    User.findOne({ userId: String(autor.id) }).select('staff badges selectedBadge').lean()
  ]);
  const badge = badgeAtiva(usuario);

  const mostrarIcone = !guildConfig || guildConfig.mostrarIcone !== false;
  const iconeServidor = mostrarIcone ? obterIconeServidor(g) : null;

  let authorText = `${nickname} (@${username}#${autor.discriminator})`;
  const corGuild = guildConfig && guildConfig.cor != null ? guildConfig.cor : 0x0B0B0B;
  let corEmbed = corDaBadge(usuario) ?? corGuild;

  if (autor.id === DONO_ID) {
    authorText = `${nickname} (@${username}#${autor.discriminator}) - Desenvolvedor do Global`;
    corEmbed = 0xC0B29D;
  } else if (autor.id === MUBI_ID) {
    authorText = `${nickname} (@${username}#${autor.discriminator}) - Desenvolvedor do Global`;
    corEmbed = COR_EMBED_MUBI;
    } else if (badge) {
    authorText = `${nickname} (@${username}#${autor.discriminator}) - ${ROTULO_BADGE[badge]}`;
  }

  let urlMidia = null;
  if (message.attachments && message.attachments.size > 0) {
    urlMidia = message.attachments.first().url;
  }
  if (!urlMidia) {
    const figurinhas = message.stickers;
    const figurinha = Array.isArray(figurinhas) ? figurinhas[0] : (figurinhas && figurinhas.first ? figurinhas.first() : null);
    if (figurinha && figurinha.url && !/\.json(\?|$)/i.test(figurinha.url)) {
      urlMidia = figurinha.url;
    }
  }

  const rotulo = ehDev(autor.id) ? ROTULO_BADGE.developer : (badge ? ROTULO_BADGE[badge] : null);
  const nomeWebhook = montarNomeWebhook(nickname, username, autor.discriminator, rotulo);
  const perfilUrl = `https://web.fluxer.app/users/${autor.id}`;
  const avatarUrl = autor.displayAvatarURL ? autor.displayAvatarURL() : null;

  return { guildId, nomeServidor, iconeServidor, authorText, corEmbed, urlMidia, nomeWebhook, perfilUrl, avatarUrl };
}

function montarConteudoWebhook(message, info, links = []) {
  const rodape = `-# ${escaparMarkdown(info.nomeServidor)} — [Ver perfil](${info.perfilUrl})`;
  const texto = [message.content || '', ...links].filter(Boolean).join('\n');
  const limite = CONTEUDO_MAX - rodape.length - RESERVA_MENCAO;
  const corpo = texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
  return [corpo, rodape].filter(Boolean).join('\n');
}

function montarPayloadWebhook(message, info, anexos = { arquivos: [], links: [] }) {
  const payload = {
    username: info.nomeWebhook,
    content: montarConteudoWebhook(message, info, anexos.links),
    allowedMentions: { parse: [] }
  };
  if (info.avatarUrl) payload.avatarUrl = info.avatarUrl;
  if (anexos.arquivos.length > 0) payload.files = anexos.arquivos;
  return payload;
}

function montarCorpoEdicaoWebhook(message, info) {
  return {
    content: montarConteudoWebhook(message, info),
    allowedMentions: { parse: [] }
  };
}

function montarEmbedGlobal(message, info) {
  const autor = message.author;
  const avatarUrl = autor.displayAvatarURL ? autor.displayAvatarURL() : null;

  const footer = { text: info.nomeServidor };
  if (info.iconeServidor) footer.iconURL = info.iconeServidor;

  const embed = new EmbedBuilder()
    .setDescription(message.content ? message.content : null)
    .setColor(info.corEmbed)
    .setAuthor({ name: info.authorText, iconURL: avatarUrl, url: `https://web.fluxer.app/users/${autor.id}` })
    .setFooter(footer);
  if (info.urlMidia) embed.setImage(info.urlMidia);
  return embed;
}

module.exports = { infoMensagem, montarEmbedGlobal, montarPayloadWebhook, montarCorpoEdicaoWebhook };
