const { Webhook } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const { log, errMsg } = require('../util/logger');
const { ehRateLimit } = require('../util/ratelimit');

const NOME_WEBHOOK = 'Global';
const ESPERA_NOVA_TENTATIVA_MS = 60 * 60 * 1000;

const criacoesEmAndamento = new Map();
const bloqueadosAte = new Map();

function webhookDe(guildId, canalId, webhookId, token) {
  return Webhook.fromToken(client, String(webhookId), token, {
    guildId: String(guildId),
    channelId: String(canalId),
    name: NOME_WEBHOOK
  });
}

function credencialValida(destino) {
  return !!destino.webhookId && !!destino.webhookToken && destino.webhookCanalId === destino.canalId;
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
  const canal = await client.channels.fetch(String(destino.canalId));
  if (!canal || typeof canal.createWebhook !== 'function') {
    throw new Error(`Canal ${destino.canalId} não aceita webhook`);
  }

  const nova = await canal.createWebhook({ name: NOME_WEBHOOK });
  if (!nova.token) throw new Error('A API não devolveu o token do webhook');

  await Guild.updateOne(
    { guildId: String(destino.guildId) },
    { $set: { webhookId: String(nova.id), webhookToken: nova.token, webhookCanalId: String(destino.canalId) } }
  );
  await removerWebhookAntigo(destino);
  return nova;
}

async function obterWebhook(destino) {
  if (credencialValida(destino)) {
    return webhookDe(destino.guildId, destino.canalId, destino.webhookId, destino.webhookToken);
  }

  const chave = `${destino.guildId}:${destino.canalId}`;
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

async function esquecerWebhook(guildId) {
  await Guild.updateOne(
    { guildId: String(guildId) },
    { $set: { webhookId: null, webhookToken: null, webhookCanalId: null } }
  );
}

async function carregarCredenciais(guildIds) {
  const ids = [...new Set(guildIds.map(String))];
  if (ids.length === 0) return new Map();

  const guilds = await Guild.find({ guildId: { $in: ids }, webhookId: { $ne: null } })
    .select('+webhookToken')
    .lean();

  return new Map(
    guilds
      .filter((g) => g.webhookToken)
      .map((g) => [g.guildId, { webhookId: g.webhookId, webhookToken: g.webhookToken }])
  );
}

function webhookDaCopia(copia, credenciais) {
  const cred = credenciais.get(String(copia.guildId));
  if (!cred || !copia.webhookId || cred.webhookId !== String(copia.webhookId)) return null;
  return webhookDe(copia.guildId, copia.canalId, cred.webhookId, cred.webhookToken);
}

module.exports = { obterWebhook, esquecerWebhook, carregarCredenciais, webhookDaCopia };
