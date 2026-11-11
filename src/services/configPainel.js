const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const { MODO_ENVIO, ehDev, PREFIXO } = require('../config');
const { membroPodeGerenciarCanais } = require('./permissoes');
const { log, errMsg } = require('../util/logger');

const EMOJI_LIGADO = '<:togglefill:1562606683371339783>';
const EMOJI_DESLIGADO = '<:toggleline:1562606683371339782>';
const EMOJI_INFO = '<:information2fill:1562606683371339784>';
const EMOJI_ERRO = '<:errorwarningfill:1563362758655746048>';
const EMOJI_SUCESSO = '<:checkboxcirclefill:1562606683371339777>';

const REACAO_WEBHOOK = '<:chat1fill:1569877160041132032>';
const REACAO_ICONE = '<:imagefill:1569878138362535939>';

const PADRAO_CUSTOMIZADO = /^<a?:([^:]+):(\d+)>$/;

function semVariacao(emoji) {
  return String(emoji || '').replace(/\uFE0F/g, '');
}

function emojiParaAPI(emoji) {
  const m = String(emoji).match(PADRAO_CUSTOMIZADO);
  return m ? `${m[1]}:${m[2]}` : emoji;
}

function mesmoEmoji(recebido, configurado) {
  const custom = configurado.match(PADRAO_CUSTOMIZADO);
  if (custom) {
    if (recebido && typeof recebido === 'object') return String(recebido.id) === custom[2];
    return String(recebido || '').endsWith(`:${custom[2]}`);
  }
  const nome = recebido && typeof recebido === 'object' ? recebido.name : recebido;
  return semVariacao(nome) === semVariacao(configurado);
}

function acaoDaReacao(emoji) {
  if (mesmoEmoji(emoji, REACAO_WEBHOOK)) return 'webhook';
  if (mesmoEmoji(emoji, REACAO_ICONE)) return 'icone';
  return null;
}

function webhookAtivo(config = {}) {
  return (config.modoEnvio || MODO_ENVIO) === 'webhook';
}

function iconeAtivo(config = {}) {
  return config.mostrarIcone !== false;
}

function linhaDeOpcao(ativo, titulo, descricao) {
  return [
    `${ativo ? EMOJI_LIGADO : EMOJI_DESLIGADO} **${titulo}** · ${ativo ? 'habilitado' : 'desabilitado'}`,
    `-# ${descricao}`
  ].join('\n');
}

function textoPainel(config = {}, feedback) {
  const canal = config.canalId ? `<#${config.canalId}>` : `não conectada, use \`${PREFIXO}conectar\``;

  return [
    '# Configurações do Global',
    '',
    linhaDeOpcao(
      webhookAtivo(config),
      'Modo webhook',
      'Habilitado: as mensagens chegam com o nome e o avatar de quem enviou. Desabilitado: chegam em embed.'
    ),
    '',
    linhaDeOpcao(
      iconeAtivo(config),
      'Ícone do servidor',
      'Mostra o ícone do servidor de origem no rodapé. Vale apenas no modo embed.'
    ),
    '',
    `${EMOJI_INFO} Conexão global: ${canal}`,
    '',
    `-# Reaja para alternar: ${REACAO_WEBHOOK} Modo webhook · ${REACAO_ICONE} Ícone do servidor`,
    ...(feedback ? ['', feedback] : [])
  ].join('\n');
}

function embedPainel(config = {}, feedback) {
  return new EmbedBuilder()
    .setDescription(textoPainel(config, feedback));
}

function reacoesDoPainel() {
  return [REACAO_WEBHOOK, REACAO_ICONE].map(emojiParaAPI);
}

async function resolverMensagem(payload) {
  const direta = payload.message || (payload.reaction && payload.reaction.message);
  if (direta) return direta;
  if (payload.reaction && typeof payload.reaction.fetchMessage === 'function') {
    return payload.reaction.fetchMessage();
  }
  return null;
}

function autorComoMensagem(payload, message, user, guildId, api) {
  const guildDoPayload = (payload.reaction && payload.reaction.guild)
    || (payload.channel && payload.channel.guild)
    || (api.client.guilds && api.client.guilds.get(guildId))
    || null;
  const membro = payload.member || null;

  return {
    author: user,
    resolveGuild: async () => {
      if (typeof message.resolveGuild === 'function') {
        const guild = await message.resolveGuild();
        if (guild) return guild;
      }
      if (guildDoPayload) return guildDoPayload;
      if (membro) {
        return {
          members: { get: (id) => (id === String(user.id) ? membro : null) },
          fetchMember: async () => membro
        };
      }
      return null;
    }
  };
}

async function tratarReacaoPainel(payload, deps = {}) {
  const api = {
    Guild: deps.Guild || Guild,
    client: deps.client || client,
    ehDev: deps.ehDev || ehDev,
    podeGerenciar: deps.podeGerenciar || membroPodeGerenciarCanais,
    log: deps.log || log
  };

  try {
    const user = payload.user || (payload.member && payload.member.user) || { id: payload.userId };
    const userId = String(payload.userId || user.id || '');
    if (!userId || user.bot || (api.client.user && userId === String(api.client.user.id))) return false;

    const acao = acaoDaReacao(payload.emoji || (payload.reaction && payload.reaction.emoji));
    if (!acao) return false;

    const message = await resolverMensagem(payload);
    if (!message) return false;

    const guildId = String(payload.guildId || message.guildId || (message.channel && message.channel.guildId) || '');
    const messageId = String(payload.messageId || message.id || '');
    if (!guildId || !messageId) return false;

    const config = await api.Guild.findOne({ guildId }).lean();
    if (!config || String(config.configPainelMessageId) !== messageId) return false;
    if (String(config.configPainelUserId) !== userId) return false;

    if (!api.ehDev(userId) && !(await api.podeGerenciar(autorComoMensagem(payload, message, user, guildId, api)))) {
      return false;
    }

    const alteracao = acao === 'webhook'
      ? { modoEnvio: webhookAtivo(config) ? 'embed' : 'webhook' }
      : { mostrarIcone: !iconeAtivo(config) };

    const resultado = await api.Guild.updateOne(
      { guildId, configPainelMessageId: messageId, configPainelUserId: userId },
      { $set: alteracao }
    );
    if (!resultado || resultado.matchedCount === 0) return false;

    const emoji = acao === 'webhook' ? REACAO_WEBHOOK : REACAO_ICONE;
    try {
      await message.removeReaction(emojiParaAPI(emoji), userId);
    } catch (e) {
      api.log.warn('CONFIG', `Não consegui remover a reação do painel ${messageId}: ${errMsg(e)}`);
    }

    const atualizado = await api.Guild.findOne({ guildId }).lean();
    try {
      await message.edit({
        embeds: [embedPainel(atualizado || {}, `${EMOJI_SUCESSO} Configuração atualizada com sucesso!`)],
        allowedMentions: { parse: [] }
      });
    } catch (e) {
      api.log.error('CONFIG', `Configuração salva, mas o painel ${messageId} não pôde ser atualizado`, e);
      return true;
    }

    api.log.ok('CONFIG', `Painel ${messageId} | ${acao} alterado por ${userId} no servidor ${guildId}`);
    return true;
  } catch (e) {
    api.log.error('CONFIG', 'Erro ao processar reação do painel', e);
    return false;
  }
}

module.exports = {
  EMOJI_ERRO,
  REACAO_WEBHOOK,
  REACAO_ICONE,
  acaoDaReacao,
  emojiParaAPI,
  webhookAtivo,
  iconeAtivo,
  textoPainel,
  embedPainel,
  reacoesDoPainel,
  tratarReacaoPainel
};
