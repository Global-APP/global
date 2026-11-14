const { COOLDOWN_TEMPO } = require('../../config');
const { emojis } = require('../../util/emojis');
const MensagemGlobal = require('../../models/MensagemGlobal');
const { contarMensagemParaAnuncio } = require('../anuncio');
const { tratarFalhaDestino, registrarSucessoDestino, listarDestinosAtivos } = require('../destinos');
const { destinosDaPonte } = require('../pontes');
const Bloqueio = require('../../models/Bloqueio');
const { checarMidia } = require('../filtros/nsfw');
const { origemAdulta } = require('../filtros/adulto');
const { analisarConteudo, configDaGuild, motivoFiltroGuild, bloquearPorFiltro } = require('../filtros/moderacao');
const { verificarSpam } = require('../filtros/spam');
const { log, errMsg, descreverContexto } = require('../../util/logger');
const { ehStaffOuDono, estaBloqueado } = require('../permissoes');
const { reagir } = require('../../util/reacoes');
const { converterConteudo } = require('../../util/conversao');
const { obterPlataforma, plataformaDaMensagem, apagarCopia } = require('../../plataformas');
const { carregarCredenciais } = require('../webhooks');
const { ErroSemWebhook } = require('../entrega/semWebhook');
const { avisarSemWebhook } = require('../avisoWebhook');
const { infoMensagem } = require('./mensagem');
const { prepararAnexos } = require('./anexos');

const cooldownUsuarios = new Map();

async function destinosDaPonteAtivos(ponte, guildIdOrigem) {
  const bloqueados = new Set(await Bloqueio.find({ tipo: 'servidor' }).distinct('id'));
  return destinosDaPonte(ponte, guildIdOrigem).filter((d) => !bloqueados.has(d.guildId));
}

const retransmissoesEmAndamento = new Map();

function cancelarRetransmissao(grupoId) {
  const estado = retransmissoesEmAndamento.get(String(grupoId));
  if (!estado) return false;
  estado.cancelado = true;
  return true;
}

async function retransmitirMensagemGlobal(message, ponte = null) {
  const autor = message.author;
  const agora = Date.now();
  const origem = plataformaDaMensagem(message);
  const info = await infoMensagem(message);
  const { guildId: guildIdOrigem, urlMidia } = info;

  const bloqueado = (await estaBloqueado('usuario', autor.id)) || (await estaBloqueado('servidor', guildIdOrigem));
  if (bloqueado) {
    log.warn('BAN', `Mensagem bloqueada de ${descreverContexto(message)}`);
    await reagir(message, [emojis.error]);
    return;
  }

  if (origemAdulta(message)) {
    log.warn('GLOBAL', `Mensagem de canal 18+ não retransmitida | ${descreverContexto(message)}`);
    await reagir(message, [emojis.error]);
    return;
  }

  const analise = analisarConteudo(message.content);
  const staff = await ehStaffOuDono(autor.id);

  if (!staff && !ponte) {
    const cfgOrigem = await configDaGuild(guildIdOrigem);
    const motivoFiltro = motivoFiltroGuild(analise, cfgOrigem) || verificarSpam(autor.id, message.content);
    if (motivoFiltro) {
      await bloquearPorFiltro(message, motivoFiltro);
      return;
    }
  }

  if (!staff && ponte) {
    const motivoSpam = verificarSpam(autor.id, message.content);
    if (motivoSpam) {
      await bloquearPorFiltro(message, motivoSpam);
      return;
    }
  }

  if (cooldownUsuarios.has(autor.id)) {
    const tempoDecorrido = agora - cooldownUsuarios.get(autor.id);
    if (tempoDecorrido < COOLDOWN_TEMPO) {
      const tempoRestante = ((COOLDOWN_TEMPO - tempoDecorrido) / 1000).toFixed(1);
      log.warn('COOLDOWN', `${descreverContexto(message)} bloqueado (${tempoRestante}s restantes)`);
      try {
        await reagir(message, [emojis.error]);
      } catch (e) {
        log.error('COOLDOWN', 'Erro ao reagir à mensagem bloqueada', e);
      }
      return;
    }
  }

  cooldownUsuarios.set(autor.id, agora);

  if (!staff) {
    const motivoMidia = await checarMidia(message);
    if (motivoMidia) {
      await bloquearPorFiltro(message, motivoMidia);
      return;
    }
  }

  const inicio = Date.now();

  let anexosPromise = null;
  const obterAnexos = () => {
    if (!anexosPromise) anexosPromise = prepararAnexos(message);
    return anexosPromise;
  };

  const preparos = new Map();
  const preparoDe = (plataforma) => {
    if (!preparos.has(plataforma)) {
      preparos.set(plataforma, obterPlataforma(plataforma).criarPreparo({
        message,
        info,
        obterAnexos,
        conteudo: converterConteudo(message.content, origem, plataforma),
        rotulo: origem === plataforma ? null : info.rotuloOrigem
      }));
    }
    return preparos.get(plataforma);
  };

  const refId = message.messageReference ? message.messageReference.messageId : null;
  let grupoRespondido = null;
  let origemReply = null;
  const copiasDoRespondido = new Map();
  if (refId) {
    const r = await MensagemGlobal.findOne({ msgId: String(refId) }).select('grupoId').lean();
    if (r) {
      grupoRespondido = r.grupoId;
      const linhasDoGrupo = await MensagemGlobal.find({ grupoId: grupoRespondido }).lean();
      for (const l of linhasDoGrupo) {
        copiasDoRespondido.set(l.guildId, l);
        if (l.msgId === grupoRespondido) origemReply = l;
      }
    }
  }

  // Servidor com filtro ativo não recebe o que violar.
  const candidatos = (ponte ? await destinosDaPonteAtivos(ponte, guildIdOrigem) : await listarDestinosAtivos())
    .filter((c) => c.guildId !== guildIdOrigem && obterPlataforma(c.plataforma));
  const destinos = ponte ? candidatos : candidatos.filter((c) => !motivoFiltroGuild(analise, c));
  const filtrados = candidatos.length - destinos.length;

  const ponteId = ponte ? ponte.codigo : null;
  const grupoId = String(message.id);
  const estado = { cancelado: false };
  retransmissoesEmAndamento.set(grupoId, estado);

  let resultados;
  try {
    resultados = await Promise.allSettled(destinos.map((destino) => {
      const adaptador = obterPlataforma(destino.plataforma);

      const mencao = (origemReply
        && destino.guildId === origemReply.guildId
        && origemReply.autorId !== String(autor.id))
        ? `<@${origemReply.autorId}>`
        : null;

      const alvoReply = grupoRespondido ? (copiasDoRespondido.get(destino.guildId) || null) : null;

      return adaptador.enfileirar(destino.canalId, async () => {
        if (estado.cancelado) return null;

        return adaptador.entregar(destino, {
          message,
          info,
          preparo: preparoDe(adaptador.nome),
          mencao,
          origemReply,
          alvoReply
        });
      });
    }));
  } finally {
    retransmissoesEmAndamento.delete(grupoId);
  }

  const criadoEm = Date.now();
  const linhas = [];

  if (message.id && message.channel) {
    linhas.push({ grupoId, guildId: guildIdOrigem, plataforma: origem, canalId: String(message.channel.id), msgId: String(message.id), autorId: String(autor.id), ponteId, criadoEm });
  }

  let ok = 0;
  let replies = 0;
  const falhas = [];
  const tratamentos = [];
  let cancelados = 0;
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value === null) {
      cancelados++;
    } else if (r.status === 'fulfilled' && r.value.msgId) {
      ok++;
      if (!ponte) registrarSucessoDestino(r.value.guildId);
      if (r.value.comReply) replies++;
      linhas.push({
        grupoId,
        guildId: r.value.guildId,
        plataforma: destinos[i].plataforma || 'fluxer',
        canalId: r.value.canalId,
        msgId: String(r.value.msgId),
        autorId: String(autor.id),
        webhookId: r.value.webhookId || null,
        ponteId,
        criadoEm
      });
    } else {
      const motivo = r.status === 'rejected' ? errMsg(r.reason) : 'sem id de mensagem';
      falhas.push(`${destinos[i].guildId}: ${motivo}`);
      if (r.status === 'rejected' && r.reason instanceof ErroSemWebhook) {
        tratamentos.push(avisarSemWebhook(obterPlataforma(destinos[i].plataforma), destinos[i]));
      } else if (r.status === 'rejected' && !ponte) {
        tratamentos.push(tratarFalhaDestino(destinos[i].guildId, r.reason));
      }
    }
  });

  if (estado.cancelado) {
    const jaEnviadas = linhas.filter((l) => l.msgId !== grupoId);
    const credenciais = await carregarCredenciais(jaEnviadas);
    await Promise.allSettled(jaEnviadas.map((l) => apagarCopia(l, credenciais)));
    await Promise.allSettled(tratamentos);
    log.info('GLOBAL', `msg ${message.id} apagada durante a retransmissão | ${cancelados} envio(s) cancelado(s), ${jaEnviadas.length} cópia(s) já enviada(s) removida(s)`);
    return;
  }

  if (linhas.length > 0) {
    try {
      await MensagemGlobal.bulkWrite(
        linhas.map((l) => ({
          updateOne: { filter: { msgId: l.msgId }, update: { $setOnInsert: l }, upsert: true }
        })),
        { ordered: false }
      );
    } catch (e) {
      log.error('DB', 'Erro ao registrar vínculos de mensagens', e);
    }
  }

  await Promise.allSettled(tratamentos);

  const ms = Date.now() - inicio;
  log.info(
    ponte ? 'PONTE' : 'GLOBAL',
    `msg ${message.id} | ${descreverContexto(message)} | ` +
    `${ok}/${destinos.length} servidor(es) em ${ms}ms` +
    (filtrados > 0 ? ` (${filtrados} com filtro ativo não receberam)` : '') +
    (refId ? ` | reply a ${refId} (${grupoRespondido ? `${replies} reply(s) aplicado(s)` : 'mensagem não rastreada, enviado sem reply'})` : '') +
    (urlMidia ? ' | com mídia' : '')
  );
  if (falhas.length > 0) {
    log.warn('GLOBAL', `${falhas.length} falha(s) na retransmissão da msg ${message.id}`, falhas.join('\n'));
  }

  if (!ponte) await contarMensagemParaAnuncio();
}

module.exports = { retransmitirMensagemGlobal, cancelarRetransmissao };
