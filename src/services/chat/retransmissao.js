const { client } = require('../../lib/client');
const { COOLDOWN_TEMPO, MODO_ENVIO } = require('../../config');
const { emojis } = require('../../util/emojis');
const MensagemGlobal = require('../../models/MensagemGlobal');
const { contarMensagemParaAnuncio } = require('../anuncio');
const { tratarFalhaDestino, registrarSucessoDestino, listarDestinosAtivos } = require('../destinos');
const { checarMidia } = require('../filtros/nsfw');
const { origemAdulta } = require('../filtros/adulto');
const { analisarConteudo, configDaGuild, motivoFiltroGuild, bloquearPorFiltro } = require('../filtros/moderacao');
const { verificarSpam } = require('../filtros/spam');
const { log, errMsg, descreverContexto } = require('../../util/logger');
const { ehStaffOuDono, estaBloqueado } = require('../permissoes');
const { reagir } = require('../../util/reacoes');
const { ehRateLimit, marcarEnvio } = require('../../util/ratelimit');
const { enfileirar } = require('../entrega/fila');
const { apagarCopia, enviarPorWebhook } = require('../entrega/transporte');
const { carregarCredenciais } = require('../webhooks');
const { infoMensagem, montarEmbedGlobal, montarPayloadWebhook } = require('./mensagem');
const { prepararAnexos } = require('./anexos');

const cooldownUsuarios = new Map();

const retransmissoesEmAndamento = new Map();

function payloadWebhookDoDestino(base, mencao, origemReply) {
  if (!mencao) return base;
  return {
    ...base,
    content: `${mencao}\n${base.content}`,
    allowedMentions: { parse: [], users: [origemReply.autorId], repliedUser: false }
  };
}

function cancelarRetransmissao(grupoId) {
  const estado = retransmissoesEmAndamento.get(String(grupoId));
  if (!estado) return false;
  estado.cancelado = true;
  return true;
}

async function retransmitirMensagemGlobal(message) {
  const autor = message.author;
  const agora = Date.now();
  const info = await infoMensagem(message);
  const { guildId: guildIdOrigem, nomeServidor, authorText, urlMidia } = info;

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

  if (!staff) {
    const cfgOrigem = await configDaGuild(guildIdOrigem);
    const motivoFiltro = motivoFiltroGuild(analise, cfgOrigem) || verificarSpam(autor.id, message.content);
    if (motivoFiltro) {
      await bloquearPorFiltro(message, motivoFiltro);
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

  let embed = null;
  try {
    embed = montarEmbedGlobal(message, info);
  } catch (e) {
    log.warn('GLOBAL', `Falha ao montar embed, usando texto simples: ${errMsg(e)}`);
    embed = null;
  }

  let payloadWebhookPronto = null;
  const payloadWebhook = () => {
    if (!payloadWebhookPronto) {
      payloadWebhookPronto = prepararAnexos(message).then((anexos) => montarPayloadWebhook(message, info, anexos));
    }
    return payloadWebhookPronto;
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
  const candidatos = (await listarDestinosAtivos()).filter((c) => c.guildId !== guildIdOrigem);
  const destinos = candidatos.filter((c) => !motivoFiltroGuild(analise, c));
  const filtrados = candidatos.length - destinos.length;

  const grupoId = String(message.id);
  const estado = { cancelado: false };
  retransmissoesEmAndamento.set(grupoId, estado);

  let resultados;
  try {
    resultados = await Promise.allSettled(destinos.map((destino) => {
      const mencao = (origemReply
        && destino.guildId === origemReply.guildId
        && origemReply.autorId !== String(autor.id))
        ? `<@${origemReply.autorId}>`
        : null;

      const extraMencao = mencao
        ? { allowedMentions: { users: [origemReply.autorId], repliedUser: false } }
        : {};

      const payload = embed
        ? { embeds: [embed], ...(mencao ? { content: mencao } : {}) }
        : { content: `${mencao ? mencao + '\n' : ''}👤 **${authorText}**\n${message.content || ''}\n${urlMidia || ''}\n\n_Enviado desde: ${nomeServidor}_` };

      const alvoReply = grupoRespondido ? (copiasDoRespondido.get(destino.guildId) || null) : null;

      return enfileirar(destino.canalId, async () => {
        if (estado.cancelado) return null;

        if ((destino.modoEnvio || MODO_ENVIO) === 'webhook') {
          const base = await payloadWebhook();
          const enviadaWebhook = await enviarPorWebhook(destino, payloadWebhookDoDestino(base, mencao, origemReply), alvoReply);
          if (enviadaWebhook) {
            if (!enviadaWebhook.mensagem || !enviadaWebhook.mensagem.id) throw new Error('Webhook não retornou a mensagem criada');
            return {
              guildId: destino.guildId,
              canalId: destino.canalId,
              msgId: enviadaWebhook.mensagem.id,
              comReply: enviadaWebhook.comReply,
              webhookId: enviadaWebhook.webhookId
            };
          }
        }

        marcarEnvio(destino.canalId);

        let enviada;
        let comReply = false;
        if (alvoReply) {
          try {
            enviada = await client.channels.send(destino.canalId, {
              ...payload,
              ...extraMencao,
              replyTo: { channelId: alvoReply.canalId, messageId: alvoReply.msgId, guildId: destino.guildId },
              ping: false
            });
            comReply = true;
          } catch (e) {
            if (ehRateLimit(e)) throw e;
            log.warn('GLOBAL', `Reply falhou no servidor ${destino.guildId}, enviando sem reply: ${errMsg(e)}`);
          }
        }
        if (!enviada) enviada = await client.channels.send(destino.canalId, { ...payload, ...extraMencao });

        return { guildId: destino.guildId, canalId: destino.canalId, msgId: enviada.id, comReply };
      });
    }));
  } finally {
    retransmissoesEmAndamento.delete(grupoId);
  }

  const criadoEm = Date.now();
  const linhas = [];

  if (message.id && message.channel) {
    linhas.push({ grupoId, guildId: guildIdOrigem, canalId: String(message.channel.id), msgId: String(message.id), autorId: String(autor.id), criadoEm });
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
      registrarSucessoDestino(r.value.guildId);
      if (r.value.comReply) replies++;
      linhas.push({ grupoId, guildId: r.value.guildId, canalId: r.value.canalId, msgId: String(r.value.msgId), autorId: String(autor.id), webhookId: r.value.webhookId || null, criadoEm });
    } else {
      const motivo = r.status === 'rejected' ? errMsg(r.reason) : 'sem id de mensagem';
      falhas.push(`${destinos[i].guildId}: ${motivo}`);
      if (r.status === 'rejected') tratamentos.push(tratarFalhaDestino(destinos[i].guildId, r.reason));
    }
  });

  if (estado.cancelado) {
    const jaEnviadas = linhas.filter((l) => l.msgId !== grupoId);
    const credenciais = await carregarCredenciais(jaEnviadas.map((l) => l.guildId));
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
    'GLOBAL',
    `msg ${message.id} | ${descreverContexto(message)} | ` +
    `${ok}/${destinos.length} servidor(es) em ${ms}ms` +
    (filtrados > 0 ? ` (${filtrados} com filtro ativo não receberam)` : '') +
    (refId ? ` | reply a ${refId} (${grupoRespondido ? `${replies} reply(s) aplicado(s)` : 'mensagem não rastreada, enviado sem reply'})` : '') +
    (urlMidia ? ' | com mídia' : '')
  );
  if (falhas.length > 0) {
    log.warn('GLOBAL', `${falhas.length} falha(s) na retransmissão da msg ${message.id}`, falhas.join('\n'));
  }

  await contarMensagemParaAnuncio();
}

module.exports = { retransmitirMensagemGlobal, cancelarRetransmissao };
