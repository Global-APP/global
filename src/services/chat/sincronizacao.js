const { client } = require('../../lib/client');
const MensagemGlobal = require('../../models/MensagemGlobal');
const { analisarConteudo, configDaGuild, motivoFiltroGuild } = require('../filtros/moderacao');
const { log, errMsg } = require('../../util/logger');
const { ehStaffOuDono } = require('../permissoes');
const { carregarCredenciais } = require('../webhooks');
const { infoMensagem, montarEmbedGlobal, montarCorpoEdicaoWebhook } = require('./mensagem');
const { editarMensagem, editarMensagemWebhook, apagarCopia, erroPermanente } = require('../entrega/transporte');

async function ehMensagemOriginal(id) {
  const r = await MensagemGlobal.findOne({ msgId: String(id) }).lean();
  return !!r && r.grupoId === String(id);
}

async function apagarCopiasDoGrupo(grupoId) {
  const gId = String(grupoId);
  const copias = await MensagemGlobal.find({ grupoId: gId, msgId: { $ne: gId } }).lean();
  const credenciais = await carregarCredenciais(copias.filter((c) => c.webhookId).map((c) => c.guildId));
  const resultados = await Promise.allSettled(copias.map((c) => apagarCopia(c, credenciais)));

  const resolvidas = [];
  let apagadas = 0;
  let pendentes = 0;
  resultados.forEach((r, i) => {
    const c = copias[i];
    if (r.status === 'fulfilled') {
      resolvidas.push(c.msgId);
      if (r.value === 'apagada') apagadas++;
    } else if (erroPermanente(r.reason)) {
      resolvidas.push(c.msgId);
      log.warn('SYNC', `Não foi possível apagar a cópia ${c.msgId} no servidor ${c.guildId} (${errMsg(r.reason)}); vínculo removido.`);
    } else {
      pendentes++;
      log.warn('SYNC', `Falha ao apagar a cópia ${c.msgId} no servidor ${c.guildId} (${errMsg(r.reason)}); vínculo mantido.`);
    }
  });

  if (pendentes === 0) {
    await MensagemGlobal.deleteMany({ grupoId: gId });
  } else if (resolvidas.length > 0) {
    await MensagemGlobal.deleteMany({ msgId: { $in: resolvidas } });
  }
  return apagadas;
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

  const embed = montarEmbedGlobal(completa, info);
  const copias = await MensagemGlobal.find({ grupoId: id, msgId: { $ne: id } }).lean();
  const credenciais = await carregarCredenciais(copias.filter((c) => c.webhookId).map((c) => c.guildId));

  const corpoEmbed = { embeds: [embed.toJSON()] };
  const corpoWebhook = montarCorpoEdicaoWebhook(completa, info);

  const resultados = await Promise.allSettled(copias.map(async (c) => {
    if (motivoFiltroGuild(analise, await configDaGuild(c.guildId))) {
      await apagarCopia(c, credenciais);
      return 'removida';
    }
    if (c.webhookId) return editarMensagemWebhook(c, credenciais, corpoWebhook);
    await editarMensagem(c.canalId, c.msgId, corpoEmbed);
    return 'editada';
  }));

  const contar = (valor) => resultados.filter((x) => x.status === 'fulfilled' && x.value === valor).length;
  const semWebhook = contar('sem-webhook');
  log.info(
    'SYNC',
    `Edição da msg ${id}: ${contar('editada')} editada(s), ${contar('removida')} removida(s) por filtro, de ${copias.length} cópia(s).` +
    (semWebhook > 0 ? ` ${semWebhook} não editada(s) por falta do webhook.` : '')
  );
}

module.exports = { sincronizarEdicao, apagarCopiasDoGrupo, ehMensagemOriginal };
