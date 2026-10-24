const { client } = require('../../lib/client');
const { sql } = require('../../lib/database');
const { analisarConteudo, configDaGuild, motivoFiltroGuild } = require('../filtros/moderacao');
const { log } = require('../../util/logger');
const { ehStaffOuDono } = require('../permissoes');
const { infoMensagem, montarEmbedGlobal } = require('./mensagem');

function ehMensagemOriginal(id) {
  const r = sql.grupoPorMensagem.get(id);
  return !!r && r.grupo_id === id;
}

async function apagarCopiasDoGrupo(grupoId) {
  const copias = sql.copiasDoGrupo.all(String(grupoId), String(grupoId));
  const resultados = await Promise.allSettled(copias.map(async (c) => {
    const canal = await client.channels.fetch(c.canal_id);
    const m = await canal.messages.fetch(c.msg_id);
    await m.delete();
  }));
  sql.removerGrupo.run(String(grupoId));
  return resultados.filter((r) => r.status === 'fulfilled').length;
}

async function sincronizarEdicao(antiga, nova) {
  if (!nova || !nova.id) return;
  const id = String(nova.id);
  if (!ehMensagemOriginal(id)) return;
  if (antiga && antiga.content != null && antiga.content === nova.content) return;

  const canalOrigem = await client.channels.fetch(String(nova.channelId));
  const completa = await canalOrigem.messages.fetch(id);
  if (!completa.author || completa.author.bot) return;

  const info = infoMensagem(completa);
  const analise = analisarConteudo(completa.content);

  if (!ehStaffOuDono(completa.author.id)) {
    const motivo = motivoFiltroGuild(analise, configDaGuild(info.guildId));
    if (motivo) {
      await apagarCopiasDoGrupo(id);
      await completa.delete().catch(() => {});
      log.warn('FILTRO', `Edição bloqueada (msg ${id}) | ${motivo}`);
      return;
    }
  }

  const embed = montarEmbedGlobal(completa, info);
  const copias = sql.copiasDoGrupo.all(id, id);

  const resultados = await Promise.allSettled(copias.map(async (c) => {
    const canal = await client.channels.fetch(c.canal_id);
    const m = await canal.messages.fetch(c.msg_id);
    if (motivoFiltroGuild(analise, configDaGuild(c.guild_id))) {
      await m.delete();
      return 'removida';
    }
    await m.edit({ embeds: [embed] });
    return 'editada';
  }));

  const editadas = resultados.filter((x) => x.status === 'fulfilled' && x.value === 'editada').length;
  const removidas = resultados.filter((x) => x.status === 'fulfilled' && x.value === 'removida').length;
  log.info('SYNC', `Edição da msg ${id}: ${editadas} editada(s), ${removidas} removida(s) por filtro, de ${copias.length} cópia(s).`);
}

module.exports = { sincronizarEdicao, apagarCopiasDoGrupo, ehMensagemOriginal };
