const { Events } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const { SUPORTE_GUILD_ID, SUPORTE_CANAL_BOAS_VINDAS, PREFIXO } = require('../config');
const Guild = require('../models/Guild');
const User = require('../models/User');
const { limparFalhasDestino } = require('../services/destinos');
const { ehMensagemOriginal, sincronizarEdicao, apagarCopiasDoGrupo } = require('../services/chat/sincronizacao');
const { retransmitirMensagemGlobal } = require('../services/chat/retransmissao');
const { tratarComando } = require('../handlers/commandHandler');
const { idDoServidor } = require('../util/ids');
const { log, descreverContexto } = require('../util/logger');
const { iniciarStatusRotativo } = require('../services/status');
const { acaoDaReacao, tratarReacaoPainel } = require('../services/configPainel');

function registrarLogReacao(tipo, payload, userId, emoji) {
  if (!acaoDaReacao(emoji)) return;
  const messageId = payload.messageId || (payload.message && payload.message.id) || '?';
  const guildId = payload.guildId || (payload.reaction && payload.reaction.guildId) || (payload.message && payload.message.guildId) || (payload.channel && payload.channel.guildId) || '?';
  const channelId = payload.channelId || (payload.message && payload.message.channelId) || '?';
  log.debug('CONFIG', `Evento ${tipo} recebido: guild=${guildId} channel=${channelId} message=${messageId} user=${userId || '?'} emoji=${JSON.stringify(emoji)} cachedMessage=${Boolean(payload.message)}`);
}

function registrarEventos() {
  client.on(Events.MessageReactionAdd, async (payload) => {
    registrarLogReacao('MessageReactionAdd', payload, payload.userId || (payload.user && payload.user.id), payload.emoji && payload.emoji.name);
    await tratarReacaoPainel(payload);
  });

  client.on(Events.MessageReactionAddMany, async (payload) => {
    for (const reaction of payload.reactions || []) {
      registrarLogReacao('MessageReactionAddMany', payload, reaction.userId, reaction.emoji && reaction.emoji.name);
      await tratarReacaoPainel({
        ...payload,
        userId: reaction.userId,
        member: reaction.member,
        emoji: reaction.emoji
      });
    }
  });

  client.on(Events.Ready, async () => {
    log.debug('BOT', `Gateway READY; guilds em cache=${client.guilds.cache.size}`);
    const [canais, staffs] = await Promise.all([
      Guild.countDocuments({ canalId: { $ne: null } }),
      User.countDocuments({ staff: true })
    ]);
    log.ok('BOT', `Conectado como ${client.user.username} (${client.user.id}) | ${canais} servidor(es) conectado(s) | ${staffs} staff(s)`);
    iniciarStatusRotativo();
  });

  client.on(Events.GuildDelete, async (guild) => {
    try {
      const guildId = String(guild.id);
      const r = await Guild.updateOne(
        { guildId, canalId: { $ne: null } },
        { canalId: null, pausado: false, filtrarPalavroes: false, filtrarLinks: false }
      );
      if (r.matchedCount > 0) {
        limparFalhasDestino(guildId);
        log.warn('LIMPEZA', `Bot saiu/servidor deletado (${guildId}); conexão global removida.`);
      }
    } catch (e) {
      log.error('LIMPEZA', 'Erro ao tratar GuildDelete', e);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || message.author.id === client.user.id) return;

    try {
      const conteudo = message.content ? message.content.trim() : '';

      if (conteudo.includes(`<@${client.user.id}>`)) {
        log.info('MENCAO', descreverContexto(message));
        await message.channel.send(`<:earthline1:1562606683371339780> Olá, eu sou o **Global**, eu conecto comunidades através de um chat global e o meu prefixo é \`${PREFIXO}\`, caso você gostar de mim, que tal me [adicionar em seu servidor?](<https://web.fluxer.app/oauth2/authorize?client_id=1562253521942745089&scope=bot&permissions=22527189434367169>)`);
        return;
      }

      if (await tratarComando(message, conteudo)) return;

      const guildId = idDoServidor(message);
      if (guildId) {
        const row = await Guild.findOne({ guildId: String(guildId) }).lean();
        if (row && message.channel.id === row.canalId) {
          if (row.pausado) return;
          await retransmitirMensagemGlobal(message);
        }
      }
    } catch (e) {
      log.error('MSG', `Erro ao processar mensagem ${message.id} de ${descreverContexto(message)}`, e);
    }
  });

  client.on(Events.MessageUpdate, async (antiga, nova) => {
    try {
      await sincronizarEdicao(antiga, nova);
    } catch (e) {
      log.error('SYNC', 'Erro ao sincronizar edição', e);
    }
  });

  client.on(Events.MessageDelete, async (msg) => {
    try {
      if (!msg || !msg.id) return;
      const id = String(msg.id);
      if (!(await ehMensagemOriginal(id))) return;
      const n = await apagarCopiasDoGrupo(id);
      log.info('SYNC', `Mensagem ${id} apagada na origem; ${n} cópia(s) removida(s).`);
    } catch (e) {
      log.error('SYNC', 'Erro ao sincronizar exclusão', e);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    const guildId = member.guild ? member.guild.id : /** @type {any} */ (member).guildId;
    if (guildId !== SUPORTE_GUILD_ID) return;
    if (member.user && member.user.bot) return;

    const userId = member.user ? member.user.id : member.id;

    try {
      /** @type {any} */
      const canal = await client.channels.fetch(SUPORTE_CANAL_BOAS_VINDAS);
      if (!canal) return;
      await canal.send(`<:heart2fill:1562975992086007808> Saalve <@${userId}>, bem-vindo(a) a minha casa, o lugar onde surgi e cresci, aqui leia sobre minhas atualizações, erros e entre outras coisas...`);
      log.info('BOAS-VINDAS', `Novo membro no servidor de suporte: ${userId}`);
    } catch (e) {
      log.error('BOAS-VINDAS', 'Falha ao enviar mensagem', e);
    }
  });
}

module.exports = { registrarEventos };
