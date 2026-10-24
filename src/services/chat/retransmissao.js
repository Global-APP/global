const { client } = require('../../lib/client');
const { EMOJI_BLOQUEIO, COOLDOWN_TEMPO } = require('../../config');
const { sql, registrarMensagens } = require('../../lib/database');
const { contarMensagemParaAnuncio } = require('../anuncio');
const { tratarFalhaDestino, registrarSucessoDestino } = require('../destinos');
const { checarMidia } = require('../filtros/nsfw');
const { analisarConteudo, configDaGuild, motivoFiltroGuild, bloquearPorFiltro } = require('../filtros/moderacao');
const { verificarSpam } = require('../filtros/spam');
const { log, errMsg, descreverContexto } = require('../../util/logger');
const { ehStaffOuDono, estaBloqueado } = require('../permissoes');
const { reagir } = require('../../util/reacoes');
const { infoMensagem, montarEmbedGlobal } = require('./mensagem');

const cooldownUsuarios = new Map();

async function retransmitirMensagemGlobal(message) {
  const autor = message.author;
  const agora = Date.now();
  const info = infoMensagem(message);
  const { guildId: guildIdOrigem, nomeServidor, authorText, urlMidia } = info;

  if (estaBloqueado('usuario', autor.id) || estaBloqueado('servidor', guildIdOrigem)) {
    log.warn('BAN', `Mensagem bloqueada de ${descreverContexto(message)}`);
    await reagir(message, EMOJI_BLOQUEIO);
    return;
  }

  const analise = analisarConteudo(message.content);

  if (!ehStaffOuDono(autor.id)) {
    const motivoFiltro = motivoFiltroGuild(analise, configDaGuild(guildIdOrigem)) || verificarSpam(autor.id, message.content);
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
        await reagir(message, EMOJI_BLOQUEIO);
        const msgAviso = await message.channel.send(`<:forbidline:1562606683371339778> ${autor}, calma. Aguarde **${tempoRestante}s** para enviar outra mensagem.`);
        setTimeout(() => msgAviso.delete().catch(() => {}), 4000);
      } catch (e) {
        log.error('COOLDOWN', 'Erro ao avisar usuário', e);
      }
      return;
    }
  }

  cooldownUsuarios.set(autor.id, agora);

  if (!ehStaffOuDono(autor.id)) {
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

  const refId = message.messageReference ? message.messageReference.messageId : null;
  let grupoRespondido = null;
  if (refId) {
    const r = sql.grupoPorMensagem.get(String(refId));
    if (r) grupoRespondido = r.grupo_id;
  }

  let origemReply = null;
  if (grupoRespondido) {
    origemReply = sql.origemDoGrupo.get(grupoRespondido, grupoRespondido) || null;
  }

  // Servidor com filtro ativo não recebe o que violar.
  const candidatos = sql.destinosAtivos.all().filter((c) => c.guild_id !== guildIdOrigem);
  const destinos = candidatos.filter((c) => !motivoFiltroGuild(analise, c));
  const filtrados = candidatos.length - destinos.length;

  const resultados = await Promise.allSettled(destinos.map(async (destino) => {
    const canal = await client.channels.fetch(destino.canal_id);
    if (!canal) throw new Error('canal não encontrado');

    // Só no servidor onde o autor respondido enviou a mensagem, e nunca em auto-resposta.
    const mencao = (origemReply
      && destino.guild_id === origemReply.guild_id
      && origemReply.autor_id !== String(autor.id))
      ? `<@${origemReply.autor_id}>`
      : null;

    // Libera explicitamente a menção (o ping:false do reply só suprime o ping do "respondido")
    const extraMencao = mencao
      ? { allowedMentions: { users: [origemReply.autor_id], repliedUser: false } }
      : {};

    const payload = embed
      ? { embeds: [embed], ...(mencao ? { content: mencao } : {}) }
      : { content: `${mencao ? mencao + '\n' : ''}👤 **${authorText}**\n${message.content || ''}\n${urlMidia || ''}\n\n_Enviado desde: ${nomeServidor}_` };

    let alvoReply = null;
    if (grupoRespondido) {
      alvoReply = sql.mensagemDoGrupoNoServidor.get(grupoRespondido, destino.guild_id) || null;
    }

    let enviada;
    let comReply = false;
    if (alvoReply) {
      try {
        enviada = await canal.send({
          ...payload,
          ...extraMencao,
          replyTo: { channelId: alvoReply.canal_id, messageId: alvoReply.msg_id, guildId: destino.guild_id },
          ping: false
        });
        comReply = true;
      } catch (e) {
        // A cópia alvo pode ter sido apagada neste servidor; reenvia sem reply.
        log.warn('GLOBAL', `Reply falhou no servidor ${destino.guild_id}, enviando sem reply: ${errMsg(e)}`);
      }
    }
    if (!enviada) enviada = await canal.send({ ...payload, ...extraMencao });

    return { guildId: destino.guild_id, canalId: destino.canal_id, msgId: enviada.id, comReply };
  }));

  const grupoId = String(message.id);
  const criadoEm = Date.now();
  const linhas = [];

  if (message.id && message.channel) {
    linhas.push({ grupoId, guildId: guildIdOrigem, canalId: String(message.channel.id), msgId: String(message.id), autorId: String(autor.id), criadoEm });
  }

  let ok = 0;
  let replies = 0;
  const falhas = [];
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.msgId) {
      ok++;
      registrarSucessoDestino(r.value.guildId);
      if (r.value.comReply) replies++;
      linhas.push({ grupoId, guildId: r.value.guildId, canalId: r.value.canalId, msgId: String(r.value.msgId), autorId: String(autor.id), criadoEm });
    } else {
      const motivo = r.status === 'rejected' ? errMsg(r.reason) : 'sem id de mensagem';
      falhas.push(`${destinos[i].guild_id}: ${motivo}`);
      if (r.status === 'rejected') tratarFalhaDestino(destinos[i].guild_id, r.reason);
    }
  });

  try {
    registrarMensagens(linhas);
  } catch (e) {
    log.error('DB', 'Erro ao registrar vínculos de mensagens', e);
  }

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

module.exports = { retransmitirMensagemGlobal };
