const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const { ehDev } = require('../config');
const { membroPodeGerenciarCanais } = require('./permissoes');
const { obterWebhook } = require('./webhooks');
const { limparFalhasDestino } = require('./destinos');
const { log } = require('../util/logger');

const ACOES_REACAO = Object.freeze({
  '🖼️': 'embed',
  '📝': 'cru',
  '🌄': 'mostrarIcone',
  '🚫': 'ocultarIcone',
  '📌': 'definirCanal'
});

function acaoDaReacao(emojiName) {
  const normalizedEmoji = String(emojiName || '').replace(/\uFE0F/g, '');
  const matchedEmoji = Object.keys(ACOES_REACAO).find((emoji) => emoji.replace(/\uFE0F/g, '') === normalizedEmoji);
  return matchedEmoji ? ACOES_REACAO[matchedEmoji] : null;
}

function textoPainel(config = {}, feedback) {
  const modo = config.modoMensagem === 'cru' ? 'Normal' : 'Embed';
  const icone = config.mostrarIcone === false ? 'oculto' : 'visível';
  const canal = config.canalId ? `<#${config.canalId}>` : 'não configurada';

  return [
    '**Configurações do Global**',
    `Modo atual: **${modo}**`,
    `Ícone do servidor: **${icone}**`,
    `Conexão global: **${canal}**`,
    '',
    'Reaja para escolher uma opção. Sua reação será removida após o processamento.',
    '🖼️ Embed · 📝 Normal · 🌄 Exibir ícone · 🚫 Ocultar ícone · 📌 Conectar este canal',
    ...(feedback ? ['', `✅ ${feedback}`] : [])
  ].join('\n');
}

function embedPainel(config = {}, carregando = false, feedback) {
  const embed = new EmbedBuilder();
  embed.setDescription(carregando ? 'Carregando…' : textoPainel(config, feedback));
  return embed;
}

async function tratarReacaoPainel(payload, deps = {}) {
  const api = {
    Guild: deps.Guild || Guild,
    client: deps.client || client,
    ehDev: deps.ehDev || ehDev,
    membroPodeGerenciarCanais: deps.membroPodeGerenciarCanais || membroPodeGerenciarCanais,
    obterWebhook: deps.obterWebhook || obterWebhook,
    limparFalhasDestino: deps.limparFalhasDestino || limparFalhasDestino,
    log: deps.log || log
  };

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

    const action = acaoDaReacao((payload.emoji && payload.emoji.name) || (payload.reaction && payload.reaction.emoji && payload.reaction.emoji.name));
    if (!action) {
      api.log.debug('CONFIG', `Reação ignorada: emoji não reconhecido (${JSON.stringify(payload.emoji && payload.emoji.name)})`);
      return false;
    }

    const guildConfig = await api.Guild.findOne({ guildId }).lean();
    if (!guildConfig) {
      api.log.debug('CONFIG', `Reação ignorada: não há configuração salva para guild ${guildId}`);
      return false;
    }
    if (String(guildConfig.configPainelMessageId) !== messageId) {
      api.log.debug('CONFIG', `Reação ignorada: painel ${messageId} não é o ativo; atual=${guildConfig.configPainelMessageId || 'nenhum'}`);
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

    if (action === 'definirCanal') {
      const channel = message.channel || (typeof message.resolveChannel === 'function' ? await message.resolveChannel() : null);
      if (!channel) {
        api.log.debug('CONFIG', `Reação 📌 ignorada: canal do painel ${messageId} indisponível`);
        return false;
      }
      await api.obterWebhook(guildId, String(channel.id), channel);
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

    const emojiName = (payload.emoji && payload.emoji.name)
      || (payload.reaction && payload.reaction.emoji && payload.reaction.emoji.name);
    try {
      await message.removeReaction(emojiName, userId);
    } catch (e) {
      api.log.error('CONFIG', `Configuração salva, mas a reação ${emojiName} do autor ${userId} não pôde ser removida do painel ${messageId}`, e);
    }

    try {
      const atualizado = await api.Guild.findOne({ guildId }).lean();
      await message.edit({
        embeds: [embedPainel(atualizado || {}, false, 'Configuração atualizada com sucesso!')],
        allowedMentions: { parse: [] }
      });
    } catch (e) {
      api.log.error('CONFIG', `Configuração salva, mas o painel ${messageId} não pôde ser atualizado`, e);
    }
    return true;
  } catch (e) {
    api.log.error('CONFIG', 'Erro ao processar reação do painel', e);
    return false;
  }
}

module.exports = { ACOES_REACAO, acaoDaReacao, textoPainel, embedPainel, tratarReacaoPainel };
