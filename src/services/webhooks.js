const { Webhook } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const { log, errMsg } = require('../util/logger');
const { ehRateLimit } = require('../util/ratelimit');
const { definirWebhookDoParticipante, credenciaisDasPontes, carregarPontes } = require('./pontes');

const NOME_WEBHOOK = 'Global';
const ESPERA_NOVA_TENTATIVA_MS = 10 * 60 * 1000;

function credencialValida(destino) {
  return !!destino.webhookId && !!destino.webhookToken && destino.webhookCanalId === destino.canalId;
}

function chaveCredencial(guildId, ponteId) {
  return ponteId ? `${ponteId}:${guildId}` : String(guildId);
}

async function salvarCredencial(destino, credencial) {
  if (destino.ponteId) {
    await definirWebhookDoParticipante(destino.ponteId, destino.guildId, credencial);
    return;
  }
  await Guild.updateOne({ guildId: String(destino.guildId) }, { $set: credencial });
}

function esquecerWebhook(destino) {
  return salvarCredencial(destino, { webhookId: null, webhookToken: null, webhookCanalId: null });
}

async function carregarCredenciais(copias) {
  const globais = [...new Set(copias.filter((c) => !c.ponteId).map((c) => String(c.guildId)))];
  const mapa = new Map();

  if (globais.length > 0) {
    const guilds = await Guild.find({ guildId: { $in: globais }, webhookId: { $ne: null } })
      .select('+webhookToken')
      .lean();
    for (const g of guilds) {
      if (g.webhookToken) mapa.set(g.guildId, { webhookId: g.webhookId, webhookToken: g.webhookToken });
    }
  }

  if (copias.some((c) => c.ponteId)) {
    await carregarPontes();
    for (const [chave, cred] of credenciaisDasPontes(copias)) mapa.set(chave, cred);
  }

  return mapa;
}

function criarGerenciadorWebhooks({ montar, buscarCanal }) {
  const criacoesEmAndamento = new Map();
  const bloqueadosAte = new Map();

  function webhookDe(guildId, canalId, webhookId, token) {
    return montar({
      guildId: String(guildId),
      canalId: String(canalId),
      webhookId: String(webhookId),
      token
    });
  }

  async function removerWebhookAntigo(destino) {
    if (!destino.webhookId || !destino.webhookToken) return;
    try {
      await webhookDe(destino.guildId, destino.webhookCanalId || destino.canalId, destino.webhookId, destino.webhookToken).delete();
    } catch (_) {
      return;
    }
  }

  async function criarWebhook(destino) {
    const canal = await buscarCanal(destino.canalId);
    if (!canal || typeof canal['createWebhook'] !== 'function') {
      throw new Error(`Canal ${destino.canalId} não aceita webhook`);
    }

    const nova = await canal['createWebhook']({ name: NOME_WEBHOOK });
    if (!nova.token) throw new Error('A API não devolveu o token do webhook');

    await salvarCredencial(destino, {
      webhookId: String(nova.id),
      webhookToken: nova.token,
      webhookCanalId: String(destino.canalId)
    });
    await removerWebhookAntigo(destino);
    return nova;
  }

  async function obterWebhook(destino) {
    if (credencialValida(destino)) {
      return webhookDe(destino.guildId, destino.canalId, destino.webhookId, destino.webhookToken);
    }

    const chave = `${destino.ponteId || 'global'}:${destino.guildId}:${destino.canalId}`;
    if ((bloqueadosAte.get(chave) || 0) > Date.now()) return null;

    let tarefa = criacoesEmAndamento.get(chave);
    if (!tarefa) {
      tarefa = criarWebhook(destino).finally(() => criacoesEmAndamento.delete(chave));
      criacoesEmAndamento.set(chave, tarefa);
    }

    try {
      return await tarefa;
    } catch (e) {
      if (ehRateLimit(e)) throw e;
      bloqueadosAte.set(chave, Date.now() + ESPERA_NOVA_TENTATIVA_MS);
      log.warn(
        'WEBHOOK',
        `Servidor ${destino.guildId}: não consegui criar o webhook, usando envio normal por ${ESPERA_NOVA_TENTATIVA_MS / 60_000} min (${errMsg(e)})`
      );
      return null;
    }
  }

  function webhookDaCopia(copia, credenciais) {
    const cred = credenciais.get(chaveCredencial(copia.guildId, copia.ponteId));
    if (!cred || !copia.webhookId || cred.webhookId !== String(copia.webhookId)) return null;
    return webhookDe(copia.guildId, copia.canalId, cred.webhookId, cred.webhookToken);
  }

  return { obterWebhook, esquecerWebhook, webhookDaCopia };
}

const gerenciadorFluxer = criarGerenciadorWebhooks({
  montar: ({ guildId, canalId, webhookId, token }) => Webhook.fromToken(client, webhookId, token, {
    guildId,
    channelId: canalId,
    name: NOME_WEBHOOK
  }),
  buscarCanal: (canalId) => client.channels.fetch(String(canalId))
});

module.exports = {
  criarGerenciadorWebhooks,
  carregarCredenciais,
  esquecerWebhook,
  obterWebhook: gerenciadorFluxer.obterWebhook,
  webhookDaCopia: gerenciadorFluxer.webhookDaCopia
};
