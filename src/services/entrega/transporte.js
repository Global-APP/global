const { Routes } = require('@fluxerjs/core');
const { client } = require('../../lib/client');
const { marcarEnvio, ehRateLimit } = require('../../util/ratelimit');
const { log, errMsg } = require('../../util/logger');
const { obterWebhook, esquecerWebhook, webhookDaCopia } = require('../webhooks');
const { enfileirar, cancelarPendente, statusDe } = require('./fila');

function enviarMensagem(canalId, opcoes) {
  return enfileirar(canalId, () => {
    marcarEnvio(canalId);
    return client.channels.send(String(canalId), opcoes);
  });
}

function webhookInvalido(e) {
  const code = Number(e?.code ?? e?.rawError?.code);
  const status = statusDe(e);
  return status === 404 || status === 401 || code === 10015;
}

async function executarWebhook(destino, payload) {
  const webhook = await obterWebhook(destino);
  if (!webhook) return null;

  marcarEnvio(destino.canalId);
  try {
    const mensagem = await webhook.send(payload, true);
    return { mensagem, webhookId: String(webhook.id) };
  } catch (e) {
    if (!webhookInvalido(e)) throw e;
  }

  await esquecerWebhook(destino.guildId);
  const novo = await obterWebhook({ ...destino, webhookId: null, webhookToken: null, webhookCanalId: null });
  if (!novo) return null;

  marcarEnvio(destino.canalId);
  const mensagem = await novo.send(payload, true);
  return { mensagem, webhookId: String(novo.id) };
}

async function enviarPorWebhook(destino, payload, alvoReply) {
  if (alvoReply) {
    try {
      const enviada = await executarWebhook(destino, {
        ...payload,
        replyTo: { channelId: alvoReply.canalId, messageId: alvoReply.msgId, guildId: destino.guildId },
        ping: false
      });
      return enviada && { ...enviada, comReply: true };
    } catch (e) {
      if (ehRateLimit(e)) throw e;
      log.warn('GLOBAL', `Reply por webhook falhou no servidor ${destino.guildId}, enviando sem reply: ${errMsg(e)}`);
    }
  }

  const enviada = await executarWebhook(destino, payload);
  return enviada && { ...enviada, comReply: false };
}

function editarMensagem(canalId, msgId, body) {
  return enfileirar(
    canalId,
    () => client.rest.patch(Routes.channelMessage(String(canalId), String(msgId)), { body }),
    { prioridade: 'alta', idempotente: true, dedupe: `edit:${msgId}` }
  );
}

function editarMensagemWebhook(copia, credenciais, body) {
  const webhook = webhookDaCopia(copia, credenciais);
  if (!webhook) return Promise.resolve('sem-webhook');

  return enfileirar(
    copia.canalId,
    async () => {
      await webhook.editMessage(String(copia.msgId), body);
      return 'editada';
    },
    { prioridade: 'alta', idempotente: true, dedupe: `edit:${copia.msgId}` }
  );
}

function apagarMensagem(canalId, msgId) {
  cancelarPendente(canalId, `edit:${msgId}`);
  return enfileirar(
    canalId,
    async () => {
      try {
        await client.rest.delete(Routes.channelMessage(String(canalId), String(msgId)));
        return 'apagada';
      } catch (e) {
        if (statusDe(e) === 404) return 'ausente';
        throw e;
      }
    },
    { prioridade: 'alta', idempotente: true, dedupe: `del:${msgId}` }
  );
}

function apagarCopia(copia, credenciais) {
  const webhook = webhookDaCopia(copia, credenciais);
  if (!webhook) return apagarMensagem(copia.canalId, copia.msgId);

  cancelarPendente(copia.canalId, `edit:${copia.msgId}`);
  return enfileirar(
    copia.canalId,
    async () => {
      try {
        await webhook.deleteMessage(String(copia.msgId));
        return 'apagada';
      } catch (e) {
        if (statusDe(e) === 404) return 'ausente';
        throw e;
      }
    },
    { prioridade: 'alta', idempotente: true, dedupe: `del:${copia.msgId}` }
  );
}

function erroPermanente(e) {
  const s = statusDe(e);
  return typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429;
}

module.exports = {
  enviarMensagem,
  enviarPorWebhook,
  editarMensagem,
  editarMensagemWebhook,
  apagarMensagem,
  apagarCopia,
  erroPermanente
};
