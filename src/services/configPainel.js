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
  return ACOES_REACAO[emojiName] || null;
}

function textoPainel(config = {}) {
  const modo = config.modoMensagem === 'embed' ? 'Embed' : 'Cru';
  const icone = config.mostrarIcone === true ? 'visível' : 'oculto';
  const canal = config.canalId ? `<#${config.canalId}>` : 'não configurada';

  return [
    '**Configurações do Global**',
    `Modo atual: **${modo}**`,
    `Ícone do servidor: **${icone}**`,
    `Conexão global: **${canal}**`,
    '',
    'Reaja para escolher uma opção. Para reutilizar a mesma reação, remova sua reação anterior primeiro.',
    '🖼️ Embed · 📝 Cru · 🌄 Exibir ícone · 🚫 Ocultar ícone · 📌 Conectar este canal'
  ].join('\n');
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
    if (!message) return false;

    const guildId = String(payload.guildId || message.guildId || '');
    const messageId = String(payload.messageId || message.id || '');
    if (!guildId || !messageId) return false;

    const action = acaoDaReacao((payload.emoji && payload.emoji.name) || (payload.reaction && payload.reaction.emoji && payload.reaction.emoji.name));
    if (!action) return false;

    const guildConfig = await api.Guild.findOne({ guildId }).lean();
    if (!guildConfig || String(guildConfig.configPainelMessageId) !== messageId) return false;

    if (!api.ehDev(userId)) {
      const canResolveGuild = typeof message.resolveGuild === 'function';
      const actorMessage = {
        author: user,
        resolveGuild: async () => {
          if (canResolveGuild) return message.resolveGuild();
          const member = payload.member || null;
          if (!member) return null;
          return {
            members: { get: (id) => id === userId ? member : null },
            fetchMember: async () => member
          };
        }
      };
      if (!(await api.membroPodeGerenciarCanais(actorMessage))) return false;
    }

    if (action === 'definirCanal') {
      const channel = message.channel || (typeof message.resolveChannel === 'function' ? await message.resolveChannel() : null);
      if (!channel) return false;
      await api.obterWebhook(guildId, String(channel.id), channel);
      api.limparFalhasDestino(guildId);
    } else {
      const set = action === 'embed' ? { modoMensagem: 'embed' }
        : action === 'cru' ? { modoMensagem: 'cru' }
          : action === 'mostrarIcone' ? { mostrarIcone: true }
            : { mostrarIcone: false };
      const result = await api.Guild.updateOne(
        { guildId, configPainelMessageId: messageId },
        { $set: set }
      );
      if (!result || result.matchedCount === 0) return false;
    }

    try {
      const atualizado = await api.Guild.findOne({ guildId }).lean();
      await message.edit({ content: textoPainel(atualizado || {}), allowedMentions: { parse: [] } });
    } catch (e) {
      api.log.error('CONFIG', `Configuração salva, mas o painel ${messageId} não pôde ser atualizado`, e);
    }
    return true;
  } catch (e) {
    api.log.error('CONFIG', 'Erro ao processar reação do painel', e);
    return false;
  }
}

module.exports = { ACOES_REACAO, acaoDaReacao, textoPainel, tratarReacaoPainel };
