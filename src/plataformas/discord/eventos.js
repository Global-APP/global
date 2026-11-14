const { Events, PermissionsBitField } = require('discord.js');
const { discordClient } = require('../../lib/discordClient');
const { PREFIXO } = require('../../config');
const Guild = require('../../models/Guild');
const { removerConexaoDeGuild } = require('../../services/destinos');
const { sincronizarEdicao } = require('../../services/chat/sincronizacao');
const { retransmitirMensagemGlobal } = require('../../services/chat/retransmissao');
const { aoApagarOriginal } = require('../../services/chat/exclusao');
const { pontePorCanal } = require('../../services/pontes');
const { tratarComando } = require('../../handlers/commandHandler');
const { COMANDOS_SLASH } = require('../../util/conversao');
const { log, errMsg, descreverContexto } = require('../../util/logger');
const { criarMensagemCompat } = require('./compat');
const { registrarSlash, tratarInteracao } = require('./slash');

const CATEGORIAS = ['conexao', 'geral'];

const PERMISSOES_CONVITE = new PermissionsBitField([
  'ViewChannel',
  'SendMessages',
  'EmbedLinks',
  'AttachFiles',
  'ReadMessageHistory',
  'AddReactions',
  'ManageMessages',
  'ManageWebhooks'
]);

function linkDeConvite() {
  return `https://discord.com/oauth2/authorize?client_id=${discordClient.user.id}&scope=bot%20applications.commands&permissions=${PERMISSOES_CONVITE.bitfield}`;
}

function comandoDisponivel(conteudo) {
  if (!conteudo.startsWith(PREFIXO)) return false;
  const nome = conteudo.slice(PREFIXO.length).trim().split(/\s+/)[0];
  return COMANDOS_SLASH.has((nome || '').toLowerCase());
}

async function aoCriarMensagem(raw) {
  if (!raw.guild || raw.system || raw.webhookId) return;
  if (raw.author.bot || raw.author.id === discordClient.user.id) return;

  const message = criarMensagemCompat(raw);
  const conteudo = raw.content ? raw.content.trim() : '';

  if (conteudo === `<@${discordClient.user.id}>` || conteudo === `<@!${discordClient.user.id}>`) {
    log.info('MENCAO', descreverContexto(message));
    await message.channel.send(`<:earthline1:1562606683371339780> Olá, eu sou o **Global**, eu conecto comunidades através de um chat global e o meu prefixo é \`g.\`, caso você gostar de mim, que tal me [adicionar em seu servidor?](<${linkDeConvite()}>)`);
    return;
  }

  if (comandoDisponivel(conteudo) && await tratarComando(message, conteudo, CATEGORIAS)) return;

  const ponte = await pontePorCanal(raw.channelId);
  if (ponte) {
    await retransmitirMensagemGlobal(message, ponte);
    return;
  }

  const row = await Guild.findOne({ guildId: String(raw.guildId) }).lean();
  if (!row || (row.plataforma || 'fluxer') !== 'discord') return;
  if (String(raw.channelId) !== String(row.canalId) || row.pausado) return;

  await retransmitirMensagemGlobal(message);
}

async function aoAtualizarMensagem(antiga, nova) {
  if (nova.partial) nova = await nova.fetch();
  if (nova.webhookId || (nova.author && nova.author.bot)) return;

  await sincronizarEdicao(
    { content: antiga ? antiga.content : null },
    { id: nova.id, content: nova.cleanContent, channelId: nova.channelId, plataforma: 'discord' }
  );
}

function protegido(tag, funcao) {
  return async (...args) => {
    try {
      await funcao(...args);
    } catch (e) {
      log.error(tag, `Erro no evento do Discord: ${errMsg(e)}`, e);
    }
  };
}

function registrarEventosDiscord() {
  discordClient.once(Events.ClientReady, protegido('DISCORD', async (cliente) => {
    const conectados = await Guild.countDocuments({ canalId: { $ne: null }, plataforma: 'discord' });
    log.ok('DISCORD', `Conectado como ${cliente.user.tag} (${cliente.user.id}) | ${cliente.guilds.cache.size} servidor(es) | ${conectados} conectado(s) ao global`);
    await registrarSlash(cliente);
  }));

  discordClient.on(Events.GuildDelete, protegido('LIMPEZA', async (guild) => {
    if (guild.available === false) return;
    await removerConexaoDeGuild(guild.id);
  }));

  discordClient.on(Events.MessageCreate, protegido('MSG', aoCriarMensagem));
  discordClient.on(Events.MessageUpdate, protegido('SYNC', aoAtualizarMensagem));
  discordClient.on(Events.MessageDelete, protegido('SYNC', async (msg) => {
    if (msg && msg.id) await aoApagarOriginal(msg.id);
  }));
  discordClient.on(Events.MessageBulkDelete, protegido('SYNC', async (mensagens) => {
    for (const id of mensagens.keys()) await aoApagarOriginal(id);
  }));
  discordClient.on(Events.InteractionCreate, tratarInteracao);
  discordClient.on(Events.Error, (e) => log.error('DISCORD', `Erro no cliente: ${errMsg(e)}`, e));
}

module.exports = { registrarEventosDiscord, linkDeConvite };
