const { client } = require('../../lib/client');
const MensagemGlobal = require('../../models/MensagemGlobal');
const { analisarConteudo, configDaGuild, motivoFiltroGuild } = require('../filtros/moderacao');
const { log } = require('../../util/logger');
const { ehStaffOuDono } = require('../permissoes');
const { apagarMensagemWebhook, editarMensagemWebhook } = require('../webhooks');
const { infoMensagem, montarPayloadEdicao } = require('./mensagem');

async function ehMensagemOriginal(id) {
  const r = await MensagemGlobal.findOne({ msgId: String(id) }).lean();
  return !!r && r.grupoId === String(id);
}

async function apagarCopiasDoGrupo(grupoId) {
  const gId = String(grupoId);
  const copias = await MensagemGlobal.find({ grupoId: gId, msgId: { $ne: gId } }).lean();
  const resultados = await Promise.allSettled(copias.map(async (c) => {
    const apagadaWebhook = await apagarMensagemWebhook(c.guildId, c.canalId, c.msgId);
    if (apagadaWebhook !== null) return;

    const canal = await client.channels.fetch(c.canalId);
    const m = await canal.messages.fetch(c.msgId);
    await m.delete();
  }));
  await MensagemGlobal.deleteMany({ grupoId: gId });
  return resultados.filter((r) => r.status === 'fulfilled').length;
}

async function sincronizarEdicao(antiga, nova) {
  if (!nova || !nova.id) return;
  const id = String(nova.id);
  if (!(await ehMensagemOriginal(id))) return;
  if (antiga && antiga.content != null && antiga.content === nova.content) return;

  const canalOrigem = await client.channels.fetch(String(nova.channelId));
  const completa = await canalOrigem.messages.fetch(id);
  if (!completa.author || completa.author.bot) return;

  const info = await infoMensagem(completa);
  const analise = analisarConteudo(completa.content);

  if (!(await ehStaffOuDono(completa.author.id))) {
    const motivo = motivoFiltroGuild(analise, await configDaGuild(info.guildId));
    if (motivo) {
      await apagarCopiasDoGrupo(id);
      await completa.delete().catch(() => {});
      log.warn('FILTRO', `Edição bloqueada (msg ${id}) | ${motivo}`);
      return;
    }
  }

  const payload = montarPayloadEdicao(completa);
  const copias = await MensagemGlobal.find({ grupoId: id, msgId: { $ne: id } }).lean();

  const resultados = await Promise.allSettled(copias.map(async (c) => {
    if (motivoFiltroGuild(analise, await configDaGuild(c.guildId))) {
      const apagadaWebhook = await apagarMensagemWebhook(c.guildId, c.canalId, c.msgId);
      if (apagadaWebhook === null) {
        const canal = await client.channels.fetch(c.canalId);
        const m = await canal.messages.fetch(c.msgId);
        await m.delete();
      }
      return 'removida';
    }

    const editadaWebhook = await editarMensagemWebhook(c.guildId, c.canalId, c.msgId, payload);
    if (editadaWebhook !== null) return 'editada';

    const canal = await client.channels.fetch(c.canalId);
    const m = await canal.messages.fetch(c.msgId);
    await m.edit(payload);
    return 'editada';
  }));

  const editadas = resultados.filter((x) => x.status === 'fulfilled' && x.value === 'editada').length;
  const removidas = resultados.filter((x) => x.status === 'fulfilled' && x.value === 'removida').length;
  log.info('SYNC', `Edição da msg ${id}: ${editadas} editada(s), ${removidas} removida(s) por filtro, de ${copias.length} cópia(s).`);
}

module.exports = { sincronizarEdicao, apagarCopiasDoGrupo, ehMensagemOriginal };
