const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const { ehDev } = require('../config');
const {
  membroPodeGerenciarCanais,
  permissoesBotFaltando,
  PERMISSOES_ABRIR_CONFIG,
  PERMISSOES_OPERAR_CONFIG
} = require('./permissoes');
const { obterWebhook, removerWebhooksAnteriores } = require('./webhooks');
const { limparFalhasDestino } = require('./destinos');
const { log } = require('../util/logger');

const EMOJI_MODO_EMBED = '🖼️';
const EMOJI_MODO_NORMAL = '📝';
const EMOJI_EXIBIR_ICONE = '<:imagefill:1564798265130487813>';
const EMOJI_OCULTAR_ICONE = '🚫';
const EMOJI_CONECTAR_CANAL = '📌';

const ACOES_REACAO = Object.freeze({
  [EMOJI_MODO_EMBED]: 'embed',
  [EMOJI_MODO_NORMAL]: 'cru',
  [EMOJI_EXIBIR_ICONE]: 'mostrarIcone',
  [EMOJI_OCULTAR_ICONE]: 'ocultarIcone',
  [EMOJI_CONECTAR_CANAL]: 'definirCanal'
});

function acaoDaReacao(emojiName) {
  if (typeof emojiName === 'string' && Object.hasOwn(ACOES_REACAO, emojiName)) {
    return ACOES_REACAO[emojiName];
  }
  if (emojiName && typeof emojiName === 'object') {
    if (emojiName.id) {
      const match = Object.entries(ACOES_REACAO).find(([emoji]) => {
        const customMatch = emoji.match(/^<a?:[^:]+:(\d+)>$/);
        return customMatch && String(emojiName.id) === customMatch[1];
      });
      if (match) return match[1];
    }
    emojiName = emojiName.name;
  }
  const normalizedEmoji = String(emojiName || '').replace(/\uFE0F/g, '');
  const matchedEmoji = Object.keys(ACOES_REACAO).find((emoji) => {
    const customMatch = emoji.match(/^<a?:[^:]+:(\d+)>$/);
    if (customMatch) return false;
    return emoji.replace(/\uFE0F/g, '') === normalizedEmoji;
  });
  return matchedEmoji ? ACOES_REACAO[matchedEmoji] : null;
}

function emojiParaAPI(emoji) {
  const match = emoji.match(/^<a?:([^:]+):(\d+)>$/);
  return match ? `${match[1]}:${match[2]}` : emoji;
}

function emojiDaAcaoParaAPI(action) {
  const emoji = Object.entries(ACOES_REACAO).find(([, acao]) => acao === action)?.[0];
  return emoji ? emojiParaAPI(emoji) : null;
}

function podeConectarCanal(config = {}, canalPainelId) {
  return !canalPainelId || !config.canalId || String(config.canalId) !== String(canalPainelId);
}

function textoPainel(config = {}, feedback, canalPainelId) {
  const modoEmbed = config.modoMensagem !== 'cru';
  const modo = modoEmbed ? 'Embed' : 'Normal';
  const icone = config.mostrarIcone === false ? 'oculto' : 'visível';
  const canal = config.canalId ? `<#${config.canalId}>` : 'não configurada';

  return [
    `<:information2fill:1562606683371339784> Modo atual: **${modo}**`,
    ...(modoEmbed ? [`<:information2fill:1562606683371339784> Ícone do servidor: **${icone}**`] : []),
    `<:information2fill:1562606683371339784> Conexão global: **${canal}**`,
    '',
    '<:brushaifill:1562606683371339785> Reaja para escolher uma opção.',
    `${EMOJI_MODO_EMBED} Embed · ${EMOJI_MODO_NORMAL} Normal${modoEmbed ? ` · ${EMOJI_EXIBIR_ICONE} Exibir ícone · ${EMOJI_OCULTAR_ICONE} Ocultar ícone` : ''}${podeConectarCanal(config, canalPainelId) ? ` · ${EMOJI_CONECTAR_CANAL} Conectar este canal` : ''}`,
    ...(feedback ? ['', feedback.startsWith('<:errorwarningfill:1563362758655746048>') ? feedback : `<:checkboxcirclefill:1562606683371339777> ${feedback}`] : [])
  ].join('\n');
}

function reacoesDoPainel(config = {}, canalPainelId) {
  const modoEmbed = config.modoMensagem !== 'cru';
  return Object.entries(ACOES_REACAO)
    .filter(([emoji, action]) => (modoEmbed || (action !== 'mostrarIcone' && action !== 'ocultarIcone'))
      && (emoji !== EMOJI_CONECTAR_CANAL || podeConectarCanal(config, canalPainelId)))
    .map(([emoji]) => emoji);
}

async function sincronizarReacoesIcone(message, modoMensagem, clientId, apiLog = log) {
  if (modoMensagem === 'cru') {
    if (typeof message.removeReaction !== 'function' || !clientId) return;
    for (const emoji of [emojiParaAPI(EMOJI_EXIBIR_ICONE), emojiParaAPI(EMOJI_OCULTAR_ICONE)]) {
      try {
        await message.removeReaction(emoji, clientId);
      } catch (error) {
        apiLog.error('CONFIG', `Não foi possível ocultar a reação ${emoji} do painel`, error);
      }
    }
    return;
  }

  if (typeof message.react !== 'function') return;
  for (const emoji of [emojiParaAPI(EMOJI_EXIBIR_ICONE), emojiParaAPI(EMOJI_OCULTAR_ICONE)]) {
    try {
      await message.react(emoji);
    } catch (error) {
      apiLog.error('CONFIG', `Não foi possível exibir a reação ${emoji} do painel`, error);
    }
  }
}

async function sincronizarReacaoConexao(message, config, clientId, apiLog = log) {
  const canalId = String(message.channelId || (message.channel && message.channel.id) || '');
  if (podeConectarCanal(config, canalId)) return;
  try {
    if (typeof message.removeReaction === 'function' && clientId) await message.removeReaction(emojiParaAPI(EMOJI_CONECTAR_CANAL), clientId);
  } catch (error) {
    apiLog.error('CONFIG', `Não foi possível ocultar a reação 📌 no canal ${canalId || '?'}`, error);
  }
}

function embedPainel(config = {}, carregando = false, feedback, canalPainelId) {
  const embed = new EmbedBuilder();
  embed.setTitle('<:earthline1:1562606683371339780> Configurações do Global');
  embed.setDescription(carregando ? 'Carregando…' : textoPainel(config, feedback, canalPainelId));
  return embed;
}

function ehLimiteWebhooks(error) {
  const mensagens = [
    error && error.message,
    error && error.rawError && error.rawError.message,
    error && error.response && error.response.data && error.response.data.message,
    error && error.data && error.data.message
  ].filter(Boolean).join(' ');
  return /15\s+webhooks?\s+per\s+channel/i.test(mensagens);
}

async function tratarReacaoPainel(payload, deps = {}) {
  const api = {
    Guild: deps.Guild || Guild,
    client: deps.client || client,
    ehDev: deps.ehDev || ehDev,
    membroPodeGerenciarCanais: deps.membroPodeGerenciarCanais || membroPodeGerenciarCanais,
    obterWebhook: deps.obterWebhook || obterWebhook,
    removerWebhooksAnteriores: deps.removerWebhooksAnteriores || removerWebhooksAnteriores,
    permissoesBotFaltando: deps.permissoesBotFaltando || permissoesBotFaltando,
    limparFalhasDestino: deps.limparFalhasDestino || limparFalhasDestino,
    log: deps.log || log
  };
  let contextoGuildId = '?';
  let contextoChannelId = '?';
  let contextoMessageId = '?';
  let contextoUserId = '?';
  let contextoAction = '?';

  try {
    const userId = String(payload.userId || (payload.user && payload.user.id) || (payload.member && payload.member.user && payload.member.user.id) || '');
    const user = payload.user || (payload.member && payload.member.user) || { id: userId };
    if (!userId || user.bot || (api.client.user && userId === String(api.client.user.id))) return false;

    let message = payload.message || (payload.reaction && payload.reaction.message);
    if (!message && payload.reaction && typeof payload.reaction.fetchMessage === 'function') {
      message = await payload.reaction.fetchMessage();
    }
    if (!message) {
      api.log.debug('CONFIG', `Reação ignorada: mensagem ${payload.messageId || '?'} não está disponível no evento`);
      return false;
    }

    const messageGuildId = String(message.guildId || message.channel?.guildId || payload.channel?.guildId || '');
    const reactionGuildId = payload.reaction && payload.reaction.guildId;
    const guildId = String(payload.guildId || reactionGuildId || messageGuildId || '');
    const messageId = String(payload.messageId || message.id || '');
    if (!guildId || (messageGuildId && guildId !== messageGuildId) || !messageId) {
      api.log.debug('CONFIG', `Reação ignorada: contexto inválido guild=${guildId || '?'} messageGuild=${messageGuildId || '?'} message=${messageId || '?'}`);
      return false;
    }

    const action = acaoDaReacao(payload.emoji || (payload.reaction && payload.reaction.emoji));
    if (!action) {
      api.log.debug('CONFIG', `Reação ignorada: emoji não reconhecido (${JSON.stringify(payload.emoji && payload.emoji.name)})`);
      return false;
    }
    contextoGuildId = guildId;
    contextoChannelId = String(message.channelId || (message.channel && message.channel.id) || payload.channelId || '?');
    contextoMessageId = messageId;
    contextoUserId = userId;
    contextoAction = action;

    const guildConfig = await api.Guild.findOne({ guildId }).lean();
    if (!guildConfig) {
      api.log.debug('CONFIG', `Reação ignorada: não há configuração salva para guild ${guildId}`);
      return false;
    }
    if (String(guildConfig.configPainelMessageId) !== messageId) {
      api.log.debug('CONFIG', `Reação ignorada: painel ${messageId} não é o ativo; atual=${guildConfig.configPainelMessageId || 'nenhum'}`);
      return false;
    }

    if ((action === 'mostrarIcone' || action === 'ocultarIcone') && guildConfig.modoMensagem === 'cru') {
      api.log.debug('CONFIG', `Reação de ícone ignorada: painel ${messageId} está no modo Normal`);
      return false;
    }

    api.log.debug('CONFIG', `Reação recebida no painel ${messageId}: ${userId} ${payload.emoji && payload.emoji.name}`);
    if (!guildConfig.configPainelUserId || String(guildConfig.configPainelUserId) !== userId) {
      api.log.debug('CONFIG', `Reação ignorada: ${userId} não é o autor do painel ${messageId}`);
      return false;
    }

    if (!api.ehDev(userId)) {
      const canResolveGuild = typeof message.resolveGuild === 'function';
      const guildFromPayload = payload.reaction?.guild || payload.channel?.guild
        || (api.client.guilds && api.client.guilds.get(guildId));
      const payloadMember = payload.member || null;
      const actorMessage = {
        author: user,
        resolveGuild: async () => {
          if (canResolveGuild) {
            const guild = await message.resolveGuild();
            if (guild) return guild;
          }
          if (guildFromPayload) return guildFromPayload;
          if (payloadMember) {
            return {
              members: { get: (id) => id === userId ? payloadMember : null },
              fetchMember: async () => payloadMember
            };
          }
          return null;
        }
      };
      if (!(await api.membroPodeGerenciarCanais(actorMessage))) {
        api.log.debug('CONFIG', `Reação ignorada: autor ${userId} não tem mais permissão de configuração no servidor ${guildId}`);
        return false;
      }
    }

    const requeridas = [...PERMISSOES_ABRIR_CONFIG, ...PERMISSOES_OPERAR_CONFIG];
    const mesmoCanalConfigurado = action === 'definirCanal' && guildConfig.canalId
      && String(guildConfig.canalId) === contextoChannelId;
    if (action === 'definirCanal' && !mesmoCanalConfigurado) requeridas.push('ManageWebhooks');
    let faltando;
    try {
      const guildFallback = message.guild || payload.reaction?.guild || payload.channel?.guild || null;
      faltando = await api.permissoesBotFaltando(message, api.client, requeridas, guildFallback, guildId);
    } catch (error) {
      api.log.error('CONFIG', `Não foi possível verificar as permissões do bot | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, error);
      faltando = ['verificar as permissões do bot'];
    }
    if (faltando.length > 0) {
      api.log.warn('CONFIG', `Ação ${action} recusada por permissões insuficientes do bot | guild=${guildId} channel=${contextoChannelId} panel=${messageId}: ${faltando.join(', ')}`);
      const emojiName = emojiDaAcaoParaAPI(action);
      try {
        if (emojiName && !faltando.includes('Gerenciar mensagens')) await message.removeReaction(emojiName, userId);
      } catch (error) {
        api.log.error('CONFIG', `Falha ao remover reação após recusar ação por permissões | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, error);
      }
      try {
        await message.edit({
          embeds: [embedPainel(guildConfig, false, `<:errorwarningfill:1563362758655746048> Ação recusada: faltam permissões do bot neste canal: ${faltando.join(', ')}.`, contextoChannelId)],
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        api.log.error('CONFIG', `Não foi possível exibir o aviso de permissões no painel | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, error);
        try {
          await message.reply(`<:errorwarningfill:1563362758655746048> Ação recusada: faltam permissões do bot neste canal: ${faltando.join(', ')}.`);
        } catch (replyError) {
          api.log.error('CONFIG', `Não foi possível enviar o aviso alternativo de permissões | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, replyError);
        }
      }
      return true;
    }

    let feedbackConfig = 'Configuração atualizada com sucesso!';
    if (action === 'definirCanal') {
      if (mesmoCanalConfigurado) {
        try {
          await message.removeReaction(emojiParaAPI(EMOJI_CONECTAR_CANAL), userId);
          await sincronizarReacaoConexao(message, guildConfig, api.client.user && String(api.client.user.id), api.log);
          await message.edit({
            embeds: [embedPainel(guildConfig, false, 'Este canal já está configurado como Conexão Global.', contextoChannelId)],
            allowedMentions: { parse: [] }
          });
        } catch (error) {
          api.log.error('CONFIG', `Falha ao atualizar opção de conexão já configurada | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, error);
        }
        return true;
      }
      const channel = message.channel || (typeof message.resolveChannel === 'function' ? await message.resolveChannel() : null);
      if (!channel) {
        api.log.debug('CONFIG', `Reação ${EMOJI_CONECTAR_CANAL} ignorada: canal do painel ${messageId} indisponível`);
        return false;
      }
      contextoChannelId = String(channel.id);
      try {
        const webhook = await api.obterWebhook(guildId, contextoChannelId, channel);
        if (guildConfig.canalId && String(guildConfig.canalId) !== contextoChannelId) {
          let limpeza = { removidas: 0, falhas: 0 };
          try {
            limpeza = await api.removerWebhooksAnteriores(guildId, webhook && (webhook.id || webhook.webhookId));
          } catch (error) {
            limpeza.falhas++;
            api.log.error('CONFIG', `Canal alterado, mas falhou a limpeza das webhooks anteriores | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, error);
          }

          const canalAnterior = String(guildConfig.canalId);
          if (limpeza.falhas > 0) {
            feedbackConfig = `<:errorwarningfill:1563362758655746048> Conexão alterada, mas não consegui remover todas as webhooks Global antigas. Canal anterior: <#${canalAnterior}>.`;
          } else if (limpeza.removidas > 0) {
            feedbackConfig = `Conexão alterada. As webhooks Global antigas foram removidas, incluindo a do canal anterior <#${canalAnterior}>.`;
          } else {
            feedbackConfig = `Conexão alterada. Não havia webhooks Global antigas registradas para remover; canal anterior: <#${canalAnterior}>.`;
          }
        }
      } catch (error) {
        if (!ehLimiteWebhooks(error)) throw error;

        api.log.error('CONFIG', `Limite de 15 webhooks atingido | guild=${guildId} channel=${contextoChannelId} panel=${messageId} user=${userId}`, error);
        const emojiName = emojiDaAcaoParaAPI(action) || emojiParaAPI(EMOJI_CONECTAR_CANAL);
        try {
          await message.removeReaction(emojiName, userId);
        } catch (removeError) {
          api.log.error('CONFIG', `Falha ao remover reação ${emojiName} após erro de limite | guild=${guildId} channel=${contextoChannelId} panel=${messageId} user=${userId}`, removeError);
        }
        try {
          const atual = await api.Guild.findOne({ guildId }).lean();
          await message.edit({
            embeds: [embedPainel(atual || guildConfig, false, '<:errorwarningfill:1563362758655746048> Este canal já atingiu o limite de 15 webhooks. Apague uma webhook antiga deste canal ou escolha outro canal.')],
            allowedMentions: { parse: [] }
          });
        } catch (editError) {
          api.log.error('CONFIG', `Falha ao atualizar o painel com o aviso de limite | guild=${guildId} channel=${contextoChannelId} panel=${messageId}`, editError);
        }
        return true;
      }
      api.limparFalhasDestino(guildId);
    } else {
      const set = action === 'embed' ? { modoMensagem: 'embed' }
        : action === 'cru' ? { modoMensagem: 'cru' }
          : action === 'mostrarIcone' ? { mostrarIcone: true }
            : { mostrarIcone: false };
      const result = await api.Guild.updateOne(
        { guildId, configPainelMessageId: messageId, configPainelUserId: userId },
        { $set: set }
      );
      if (!result || result.matchedCount === 0) {
        api.log.debug('CONFIG', `Reação ignorada: painel ${messageId} ou autor ${userId} deixou de ser ativo antes de salvar`);
        return false;
      }
    }

    const emojiName = emojiDaAcaoParaAPI(action);
    try {
      await message.removeReaction(emojiName, userId);
    } catch (e) {
      api.log.error('CONFIG', `Configuração salva, mas a reação ${emojiName} do autor ${userId} não pôde ser removida do painel ${messageId}`, e);
    }

    try {
      const atualizado = await api.Guild.findOne({ guildId }).lean();
      if (action === 'embed' || action === 'cru') {
        await sincronizarReacoesIcone(message, atualizado && atualizado.modoMensagem, api.client.user && String(api.client.user.id), api.log);
      }
      await sincronizarReacaoConexao(message, atualizado || {}, api.client.user && String(api.client.user.id), api.log);
      await message.edit({
        embeds: [embedPainel(atualizado || {}, false, feedbackConfig, contextoChannelId)],
        allowedMentions: { parse: [] }
      });
    } catch (e) {
      api.log.error('CONFIG', `Configuração salva, mas o painel ${messageId} não pôde ser atualizado`, e);
    }
    return true;
  } catch (e) {
    api.log.error('CONFIG', `Erro ao processar reação do painel | guild=${contextoGuildId} channel=${contextoChannelId} panel=${contextoMessageId} user=${contextoUserId} action=${contextoAction}`, e);
    return false;
  }
}

module.exports = {
  EMOJI_MODO_EMBED,
  EMOJI_MODO_NORMAL,
  EMOJI_EXIBIR_ICONE,
  EMOJI_OCULTAR_ICONE,
  EMOJI_CONECTAR_CANAL,
  ACOES_REACAO,
  acaoDaReacao,
  textoPainel,
  reacoesDoPainel,
  embedPainel,
  tratarReacaoPainel
};
