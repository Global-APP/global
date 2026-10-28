const { Webhook } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const { RETENCAO_MENSAGENS_MS } = require('../config');
const { log } = require('../util/logger');

function createWebhookService(deps = {}) {
  const api = {
    client: deps.client || client,
    Guild: deps.Guild || Guild,
    Webhook: deps.Webhook || Webhook,
    log: deps.log || log
  };
  const emAndamento = new Map();

  async function obterWebhook(guildId, canalId, canalOpcional) {
    const gId = String(guildId);
    const cId = String(canalId);
    const chave = `${gId}:${cId}`;
    if (emAndamento.has(chave)) return emAndamento.get(chave);

    const tarefa = (async () => {
      const guild = await api.Guild.findOne({ guildId: gId }).select('+webhookToken +webhooksAntigas.webhookToken').lean();
      if (guild && guild.canalId === cId && guild.webhookId && guild.webhookToken) {
        return api.Webhook.fromToken(api.client, guild.webhookId, guild.webhookToken, {
          guildId: gId,
          channelId: cId,
          name: 'Global'
        });
      }

      const agora = Date.now();
      const webhookAntiga = guild && (guild.webhooksAntigas || []).find((item) => item.canalId === cId && item.expiraEm > agora);
      if (webhookAntiga) {
        const webhooksAntigas = guild.webhooksAntigas.filter((item) => item.webhookId !== webhookAntiga.webhookId);
        if (guild.webhookId && guild.webhookToken) {
          webhooksAntigas.push({
            canalId: guild.canalId,
            webhookId: guild.webhookId,
            webhookToken: guild.webhookToken,
            expiraEm: agora + RETENCAO_MENSAGENS_MS
          });
        }
        await api.Guild.findOneAndUpdate(
          { guildId: gId },
          { $set: {
            canalId: cId,
            webhookId: webhookAntiga.webhookId,
            webhookToken: webhookAntiga.webhookToken,
            webhooksAntigas
          } },
          { upsert: true, new: true }
        );
        return api.Webhook.fromToken(api.client, webhookAntiga.webhookId, webhookAntiga.webhookToken, {
          guildId: gId,
          channelId: cId,
          name: 'Global'
        });
      }

      const canal = canalOpcional || await api.client.channels.fetch(cId);
      if (!canal) throw new Error(`Canal ${cId} não encontrado para criar webhook`);

      const nova = await canal.createWebhook({ name: 'Global' });
      if (!nova.token) throw new Error('A API não retornou o token da webhook criada');

      const webhooksAntigas = guild && Array.isArray(guild.webhooksAntigas) ? [...guild.webhooksAntigas] : [];
      if (guild && guild.canalId && guild.webhookId && guild.webhookToken) {
        webhooksAntigas.push({
          canalId: guild.canalId,
          webhookId: guild.webhookId,
          webhookToken: guild.webhookToken,
          expiraEm: agora + RETENCAO_MENSAGENS_MS
        });
      }

      await api.Guild.findOneAndUpdate(
        { guildId: gId },
        { $set: { canalId: cId, webhookId: String(nova.id), webhookToken: nova.token, webhooksAntigas } },
        { upsert: true, new: true }
      );

      return nova;
    })();

    emAndamento.set(chave, tarefa);
    try {
      return await tarefa;
    } finally {
      if (emAndamento.get(chave) === tarefa) emAndamento.delete(chave);
    }
  }

  async function obterWebhookSalvo(guildId, canalId) {
    const gId = String(guildId);
    const cId = String(canalId);
    const guild = await api.Guild.findOne({ guildId: gId }).select('+webhookToken +webhooksAntigas.webhookToken').lean();
    if (!guild) return null;
    const webhook = guild.canalId === cId && guild.webhookId && guild.webhookToken
      ? { webhookId: guild.webhookId, webhookToken: guild.webhookToken }
      : (guild.webhooksAntigas || []).find((item) => item.canalId === cId && item.webhookId && item.webhookToken && item.expiraEm > Date.now());
    if (!webhook) return null;
    return api.Webhook.fromToken(api.client, webhook.webhookId, webhook.webhookToken, {
      guildId: gId,
      channelId: cId,
      name: 'Global'
    });
  }

  async function editarMensagemWebhook(guildId, canalId, messageId, payload) {
    const webhook = await obterWebhookSalvo(guildId, canalId);
    if (!webhook) return null;
    return webhook.editMessage(String(messageId), payload);
  }

  async function apagarMensagemWebhook(guildId, canalId, messageId) {
    const webhook = await obterWebhookSalvo(guildId, canalId);
    if (!webhook) return null;
    return webhook.deleteMessage(String(messageId));
  }

  async function limparWebhooksAntigos(agora = Date.now()) {
    const guilds = await api.Guild.find({ 'webhooksAntigas.expiraEm': { $lte: agora } })
      .select('+webhooksAntigas.webhookToken')
      .lean();
    let removidas = 0;

    for (const guild of guilds) {
      const expiradas = (guild.webhooksAntigas || []).filter((item) => item.expiraEm <= agora);
      for (const item of expiradas) {
        try {
          await api.Webhook.fromToken(api.client, item.webhookId, item.webhookToken, {
            guildId: guild.guildId,
            channelId: item.canalId,
            name: 'Global'
          }).delete();
        } catch (e) {
          const status = e && (e.status || e.statusCode || (e.response && e.response.status));
          const code = Number(e && (e.code || (e.rawError && e.rawError.code)));
          if (status !== 404 && code !== 10015) continue;
        }

        try {
          await api.Guild.updateOne(
            { guildId: guild.guildId },
            { $pull: { webhooksAntigas: { webhookId: item.webhookId } } }
          );
          removidas++;
        } catch (_) {
          // Mantém credencial e tenta novamente na próxima execução se o banco estiver indisponível.
        }
      }
    }

    return removidas;
  }

  async function removerWebhooksAnteriores(guildId, webhookAtualId) {
    const gId = String(guildId);
    const manterId = String(webhookAtualId || '');
    const guild = await api.Guild.findOne({ guildId: gId })
      .select('+webhookToken +webhooksAntigas.webhookToken')
      .lean();
    if (!guild) return { removidas: 0, falhas: 0 };

    const anteriores = [...(guild.webhooksAntigas || [])];
    if (guild.webhookId && guild.webhookToken && String(guild.webhookId) !== manterId) {
      anteriores.push({
        canalId: guild.canalId,
        webhookId: guild.webhookId,
        webhookToken: guild.webhookToken
      });
    }

    const unicas = [...new Map(anteriores
      .filter((item) => item.webhookId && item.webhookToken && String(item.webhookId) !== manterId)
      .map((item) => [String(item.webhookId), item])).values()];
    let removidas = 0;
    let falhas = 0;

    for (const item of unicas) {
      try {
        await api.Webhook.fromToken(api.client, item.webhookId, item.webhookToken, {
          guildId: gId,
          channelId: item.canalId,
          name: 'Global'
        }).delete();
        removidas++;
      } catch (error) {
        const status = error && (error.status || error.statusCode || (error.response && error.response.status));
        const code = Number(error && (error.code || (error.rawError && error.rawError.code)));
        if (status !== 404 && code !== 10015) {
          falhas++;
          api.log.error('CONFIG', `Falha ao remover webhook Global antiga | guild=${gId} channel=${item.canalId || '?'} webhook=${item.webhookId} status=${status || '?'} code=${code || '?'}`);
          try {
            await api.Guild.updateOne(
              { guildId: gId, 'webhooksAntigas.webhookId': String(item.webhookId) },
              { $set: { 'webhooksAntigas.$.expiraEm': Date.now() } }
            );
          } catch (_) {}
          continue;
        }
      }

      try {
        await api.Guild.updateOne(
          { guildId: gId },
          { $pull: { webhooksAntigas: { webhookId: String(item.webhookId) } } }
        );
      } catch (error) {
        falhas++;
        api.log.error('CONFIG', `Webhook Global ${item.webhookId} removida, mas não consegui limpar o registro | guild=${gId} tipo=${error && error.name || 'erro'}`);
      }
    }

    return { removidas, falhas };
  }

  return { obterWebhook, editarMensagemWebhook, apagarMensagemWebhook, limparWebhooksAntigos, removerWebhooksAnteriores };
}

const servico = createWebhookService();

module.exports = { ...servico, createWebhookService };
