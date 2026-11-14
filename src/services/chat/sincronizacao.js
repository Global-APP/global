const MensagemGlobal = require('../../models/MensagemGlobal');
const { analisarConteudo, configDaGuild, motivoFiltroGuild } = require('../filtros/moderacao');
const { log, errMsg } = require('../../util/logger');
const { ehStaffOuDono } = require('../permissoes');
const { carregarCredenciais } = require('../webhooks');
const { converterConteudo } = require('../../util/conversao');
const { obterPlataforma, plataformaDaMensagem, apagarCopia } = require('../../plataformas');
const { infoMensagem } = require('./mensagem');
const { erroPermanente } = require('../entrega/transporte');

async function ehMensagemOriginal(id) {
  const r = await MensagemGlobal.findOne({ msgId: String(id) }).lean();
  return !!r && r.grupoId === String(id);
}

async function apagarCopiasDoGrupo(grupoId) {
  const gId = String(grupoId);
  const copias = await MensagemGlobal.find({ grupoId: gId, msgId: { $ne: gId } }).lean();
  const credenciais = await carregarCredenciais(copias.filter((c) => c.webhookId));
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

  const origem = plataformaDaMensagem(nova);
  const adaptadorOrigem = obterPlataforma(origem);
  if (!adaptadorOrigem) return;

  const completa = await adaptadorOrigem.buscarMensagem(String(nova.channelId), id);
  if (!completa.author || completa.author.bot) return;

  const info = await infoMensagem(completa);
  const analise = analisarConteudo(completa.content);
  const copias = await MensagemGlobal.find({ grupoId: id, msgId: { $ne: id } }).lean();
  const ehPonte = copias.some((c) => c.ponteId);

  if (!ehPonte && !(await ehStaffOuDono(completa.author.id))) {
    const motivo = motivoFiltroGuild(analise, await configDaGuild(info.guildId));
    if (motivo) {
      await apagarCopiasDoGrupo(id);
      await completa.delete().catch(() => {});
      log.warn('FILTRO', `Edição bloqueada (msg ${id}) | ${motivo}`);
      return;
    }
  }

  const credenciais = await carregarCredenciais(copias.filter((c) => c.webhookId));

  const edicoes = new Map();
  const edicaoPara = (plataforma) => {
    if (!edicoes.has(plataforma)) {
      edicoes.set(plataforma, obterPlataforma(plataforma).montarEdicao(completa, info, {
        conteudo: converterConteudo(completa.content, origem, plataforma),
        rotulo: origem === plataforma ? null : info.rotuloOrigem
      }));
    }
    return edicoes.get(plataforma);
  };

  const resultados = await Promise.allSettled(copias.map(async (c) => {
    if (!c.ponteId && motivoFiltroGuild(analise, await configDaGuild(c.guildId))) {
      await apagarCopia(c, credenciais);
      return 'removida';
    }
    const adaptador = obterPlataforma(c.plataforma);
    if (!adaptador) return 'sem-plataforma';
    return adaptador.editarCopia(c, edicaoPara(adaptador.nome), credenciais);
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
