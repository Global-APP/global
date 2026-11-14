const { PermissionFlagsBits } = require('discord.js');
const { DONO_ID } = require('../../config');
const { textoDoBotParaDiscord, emojiParaReacaoDiscord } = require('../../util/conversao');
const fila = require('./fila');

const SEM_MENCOES = { parse: [], repliedUser: false };

function normalizarResposta(conteudo) {
  const opcoes = typeof conteudo === 'string' ? { content: conteudo } : { ...conteudo };
  if (opcoes.content) opcoes.content = textoDoBotParaDiscord(opcoes.content);
  if (Array.isArray(opcoes.embeds)) opcoes.embeds = opcoes.embeds.map(embedParaDiscord);
  opcoes.allowedMentions = SEM_MENCOES;
  return opcoes;
}

function embedParaDiscord(embed) {
  const json = typeof embed.toJSON === 'function' ? embed.toJSON() : { ...embed };
  if (json.title) json.title = textoDoBotParaDiscord(json.title);
  if (json.description) json.description = textoDoBotParaDiscord(json.description);
  if (Array.isArray(json.fields)) {
    json.fields = json.fields.map((f) => ({
      ...f,
      name: textoDoBotParaDiscord(f.name),
      value: textoDoBotParaDiscord(f.value)
    }));
  }
  if (json.footer && json.footer.text) json.footer = { ...json.footer, text: textoDoBotParaDiscord(json.footer.text) };
  return json;
}

function nomeExibido(usuario, membro) {
  return (membro && membro.displayName) || usuario.globalName || usuario.username;
}

function autorCompat(usuario, membro) {
  const origemAvatar = membro && typeof membro.displayAvatarURL === 'function' ? membro : usuario;
  return {
    id: usuario.id,
    username: usuario.username,
    discriminator: usuario.discriminator,
    displayName: nomeExibido(usuario, membro),
    bot: usuario.bot,
    toString: () => `<@${usuario.id}>`,
    displayAvatarURL: () => origemAvatar.displayAvatarURL({ extension: 'png', size: 128 })
  };
}

function podeGerenciar(permissoes, usuarioId) {
  if (String(usuarioId) === DONO_ID) return true;
  return !!permissoes && permissoes.has(PermissionFlagsBits.ManageChannels);
}

function mencoesCompat(colecao) {
  return { users: colecao };
}

function criarMensagemCompat(raw) {
  const membro = raw.member || null;
  return {
    plataforma: 'discord',
    raw,
    id: raw.id,
    content: raw.cleanContent,
    contentBruto: raw.content,
    channelId: raw.channelId,
    guildId: raw.guildId,
    guild: raw.guild,
    webhookId: raw.webhookId,
    type: raw.type,
    attachments: raw.attachments,
    stickers: raw.stickers,
    messageReference: raw.reference ? { messageId: raw.reference.messageId } : null,
    mentions: mencoesCompat(raw.mentions.users),
    author: autorCompat(raw.author, membro),
    channel: {
      id: raw.channelId,
      guildId: raw.guildId,
      nsfw: !!raw.channel.nsfw,
      send: (conteudo) => raw.channel.send(normalizarResposta(conteudo))
    },
    reply: (conteudo) => raw.reply(normalizarResposta(conteudo)),
    react: (emoji) => raw.react(emojiParaReacaoDiscord(emoji)),
    delete: () => raw.delete(),
    podeGerenciarCanais: async () => podeGerenciar(membro && membro.permissions, raw.author.id),
    bloqueioAtivo: () => fila.bloqueioAtivo()
  };
}

function criarInteracaoCompat(interacao, args) {
  const membro = interacao.member || null;
  let respondeu = false;

  async function responder(conteudo) {
    const opcoes = normalizarResposta(conteudo);
    if (!respondeu) {
      respondeu = true;
      return interacao.deferred || interacao.replied ? interacao.editReply(opcoes) : interacao.reply({ ...opcoes, fetchReply: true });
    }
    return interacao.followUp(opcoes);
  }

  return {
    plataforma: 'discord',
    interacao,
    id: interacao.id,
    content: '',
    channelId: interacao.channelId,
    guildId: interacao.guildId,
    guild: interacao.guild,
    mentions: mencoesCompat(new Map()),
    messageReference: null,
    author: autorCompat(interacao.user, membro),
    channel: {
      id: interacao.channelId,
      guildId: interacao.guildId,
      nsfw: !!(interacao.channel && interacao.channel.nsfw),
      send: (conteudo) => interacao.channel.send(normalizarResposta(conteudo))
    },
    argumentos: args,
    jaRespondeu: () => respondeu,
    reply: responder,
    react: async () => null,
    delete: async () => null,
    podeGerenciarCanais: async () => podeGerenciar(interacao.memberPermissions, interacao.user.id),
    bloqueioAtivo: () => fila.bloqueioAtivo()
  };
}

module.exports = {
  criarMensagemCompat,
  criarInteracaoCompat,
  normalizarResposta,
  embedParaDiscord,
  podeGerenciar
};
