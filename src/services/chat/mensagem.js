const { client } = require('../../lib/client');
const { ROTULO_BADGE, ehDev, NOME_WEBHOOK_MAX } = require('../../config');
const User = require('../../models/User');
const { badgeAtiva } = require('../badges');

const CONTEUDO_MAX = 2000;
const RESERVA_MENCAO = 40;
const ROTULO_PLATAFORMA = { fluxer: 'Fluxer', discord: 'Discord' };

function escaparMarkdown(texto) {
  return String(texto).replace(/[\\`*_~|[\]<>]/g, '\\$&');
}

function discriminadorVisivel(discriminator) {
  if (discriminator === undefined || discriminator === null) return false;
  return String(discriminator) !== '0';
}

function montarNomeWebhook(nickname, username, discriminator, rotulo) {
  const tag = discriminadorVisivel(discriminator) ? `#${discriminator}` : '';
  const sufixo = ` (@${username}${tag})${rotulo ? ` — ${rotulo}` : ''}`;
  const espaco = NOME_WEBHOOK_MAX - sufixo.length;

  let nick = String(nickname);
  if (nick.length > espaco) nick = espaco > 1 ? `${nick.slice(0, espaco - 1)}…` : nick.slice(0, 1);
  return `${nick}${sufixo}`.slice(0, NOME_WEBHOOK_MAX);
}

function urlDoPerfil(plataforma, autorId) {
  return plataforma === 'discord'
    ? `https://discord.com/users/${autorId}`
    : `https://web.fluxer.app/users/${autorId}`;
}

async function infoMensagem(message) {
  const autor = message.author;
  const plataforma = message.plataforma || 'fluxer';
  const guildId = String(message.guildId || (message.guild ? message.guild.id : '0'));
  const g = message.guild || (plataforma === 'fluxer' ? client.guilds.get(guildId) : null);
  const nomeServidor = g && g.name ? g.name : 'Servidor Desconhecido';

  const nickname = autor.displayName || autor.username;
  const username = autor.username;

  const usuario = await User.findOne({ userId: String(autor.id) }).select('staff badges selectedBadge').lean();
  const badge = badgeAtiva(usuario);

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
  const perfilUrl = urlDoPerfil(plataforma, autor.id);
  const avatarUrl = autor.displayAvatarURL ? autor.displayAvatarURL() : null;

  return {
    plataforma,
    rotuloOrigem: ROTULO_PLATAFORMA[plataforma] || plataforma,
    guildId,
    nomeServidor,
    urlMidia,
    nomeWebhook,
    perfilUrl,
    avatarUrl
  };
}

function nomeDoServidorExibido(info, rotulo) {
  return rotulo ? `${info.nomeServidor} · ${rotulo}` : info.nomeServidor;
}

function montarConteudoWebhook(message, info, links = [], opcoes = {}) {
  const conteudo = opcoes.conteudo === undefined ? message.content : opcoes.conteudo;
  const origem = escaparMarkdown(nomeDoServidorExibido(info, opcoes.rotulo));
  const rodape = `-# ${origem} — [Ver perfil](${info.perfilUrl})`;
  const texto = [conteudo || '', ...links].filter(Boolean).join('\n');
  const limite = CONTEUDO_MAX - rodape.length - RESERVA_MENCAO;
  const corpo = texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
  return [corpo, rodape].filter(Boolean).join('\n');
}

function montarPayloadWebhook(message, info, anexos = { arquivos: [], links: [] }, opcoes = {}) {
  const payload = {
    username: info.nomeWebhook,
    content: montarConteudoWebhook(message, info, anexos.links, opcoes),
    allowedMentions: { parse: [] }
  };
  if (info.avatarUrl) payload.avatarUrl = info.avatarUrl;
  if (anexos.arquivos.length > 0) payload.files = anexos.arquivos;
  return payload;
}

function montarCorpoEdicaoWebhook(message, info, opcoes = {}) {
  return {
    content: montarConteudoWebhook(message, info, [], opcoes),
    allowedMentions: { parse: [] }
  };
}

module.exports = {
  infoMensagem,
  montarPayloadWebhook,
  montarCorpoEdicaoWebhook
};
