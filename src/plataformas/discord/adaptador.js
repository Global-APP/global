const { Routes } = require('discord.js');
const { discordClient } = require('../../lib/discordClient');
const { COR_PADRAO_ANUNCIO } = require('../../config');
const { errMsg } = require('../../util/logger');
const { marcarEnvio } = require('../../util/ratelimit');
const { nomeWebhookDiscord, limitar, textoDoBotParaDiscord } = require('../../util/conversao');
const { montarPayloadWebhook, montarCorpoEdicaoWebhook } = require('../../services/chat/mensagem');
const { ErroSemWebhook } = require('../../services/entrega/semWebhook');
const { statusDe } = require('../../services/entrega/fila');
const fila = require('./fila');
const webhooks = require('./webhooks');
const { criarMensagemCompat } = require('./compat');

const LIMITE_CONTEUDO = 2000;
const CODIGO_WEBHOOK_INEXISTENTE = 10015;

function linkDaMensagem(guildId, canalId, msgId) {
  return `https://discord.com/channels/${guildId}/${canalId}/${msgId}`;
}

function criarPreparo({ message, info, obterAnexos, conteudo, rotulo }) {
  const opcoes = { conteudo, rotulo };
  let payloadPronto = null;
  const payloadWebhook = () => {
    if (!payloadPronto) {
      payloadPronto = obterAnexos().then((anexos) => {
        const base = montarPayloadWebhook(message, info, anexos, opcoes);
        return {
          username: nomeWebhookDiscord(base.username),
          content: base.content,
          avatarURL: base.avatarUrl,
          files: anexos.arquivos.map((a) => ({ name: a.name, attachment: a.data })),
          allowedMentions: { parse: [] }
        };
      });
    }
    return payloadPronto;
  };

  return { payloadWebhook };
}

function webhookInvalido(e) {
  const codigo = Number(e && (e.code ?? (e.rawError && e.rawError.code)));
  const status = statusDe(e);
  return status === 404 || status === 401 || codigo === CODIGO_WEBHOOK_INEXISTENTE;
}

function usernameRejeitado(e) {
  return Number(e && e.code) === 50035 && /username/i.test(errMsg(e));
}

async function enviarComWebhook(webhook, payload) {
  try {
    return await webhook.send(payload);
  } catch (e) {
    if (!usernameRejeitado(e)) throw e;
    return webhook.send({ ...payload, username: 'Global' });
  }
}

async function executarWebhook(destino, payload) {
  const webhook = await webhooks.obterWebhook(destino);
  if (!webhook) return null;

  marcarEnvio(destino.canalId);
  try {
    const mensagem = await enviarComWebhook(webhook, payload);
    return { mensagem, webhookId: String(webhook.id) };
  } catch (e) {
    if (!webhookInvalido(e)) throw e;
  }

  await webhooks.esquecerWebhook(destino);
  const novo = await webhooks.obterWebhook({ ...destino, webhookId: null, webhookToken: null, webhookCanalId: null });
  if (!novo) return null;

  marcarEnvio(destino.canalId);
  const mensagem = await enviarComWebhook(novo, payload);
  return { mensagem, webhookId: String(novo.id) };
}

function conteudoWebhookDoDestino(base, mencao, alvoReply, destino) {
  const prefixoReply = alvoReply
    ? `↩️ [em resposta](${linkDaMensagem(destino.guildId, alvoReply.canalId, alvoReply.msgId)})\n`
    : '';
  const prefixoMencao = mencao ? `${mencao}\n` : '';
  return limitar(`${prefixoReply}${prefixoMencao}${base.content}`, LIMITE_CONTEUDO);
}

async function entregarPorWebhook(destino, entrega) {
  const { preparo, mencao, origemReply, alvoReply } = entrega;
  const base = await preparo.payloadWebhook();
  const payload = {
    ...base,
    content: conteudoWebhookDoDestino(base, mencao, alvoReply, destino),
    allowedMentions: mencao ? { parse: [], users: [origemReply.autorId] } : { parse: [] }
  };

  const enviada = await executarWebhook(destino, payload);
  if (!enviada) return null;
  if (!enviada.mensagem || !enviada.mensagem.id) throw new Error('Webhook não retornou a mensagem criada');
  return {
    guildId: destino.guildId,
    canalId: destino.canalId,
    msgId: enviada.mensagem.id,
    comReply: false,
    webhookId: enviada.webhookId
  };
}

function enviarPelaApi(canalId, corpo) {
  marcarEnvio(canalId);
  return discordClient.rest.post(Routes.channelMessages(String(canalId)), { body: corpo });
}

async function entregar(destino, entrega) {
  const porWebhook = await entregarPorWebhook(destino, entrega);
  if (!porWebhook) throw new ErroSemWebhook(destino);
  return porWebhook;
}

function montarEdicao(message, info, opcoes) {
  return { corpoWebhook: montarCorpoEdicaoWebhook(message, info, opcoes) };
}

function editarCopia(copia, edicao, credenciais) {
  if (!copia.webhookId) return Promise.resolve('sem-webhook');

  const webhook = webhooks.webhookDaCopia(copia, credenciais);
  if (!webhook) return Promise.resolve('sem-webhook');

  return fila.enfileirar(copia.canalId, async () => {
    await webhook.editMessage(String(copia.msgId), edicao.corpoWebhook);
    return 'editada';
  }, { prioridade: 'alta', idempotente: true, dedupe: `edit:${copia.msgId}` });
}

function apagarCopia(copia, credenciais) {
  fila.cancelarPendente(copia.canalId, `edit:${copia.msgId}`);
  const webhook = copia.webhookId ? webhooks.webhookDaCopia(copia, credenciais) : null;

  return fila.enfileirar(copia.canalId, async () => {
    try {
      if (webhook) await webhook.deleteMessage(String(copia.msgId));
      else await discordClient.rest.delete(Routes.channelMessage(String(copia.canalId), String(copia.msgId)));
      return 'apagada';
    } catch (e) {
      if (statusDe(e) === 404) return 'ausente';
      throw e;
    }
  }, { prioridade: 'alta', idempotente: true, dedupe: `del:${copia.msgId}` });
}

async function buscarMensagem(canalId, msgId) {
  const canal = await discordClient.channels.fetch(String(canalId));
  const mensagem = await canal.messages.fetch(String(msgId));
  return criarMensagemCompat(mensagem);
}

function buscarUsuario(userId) {
  return discordClient.users.fetch(String(userId));
}

function nomeServidor(guildId) {
  const guild = discordClient.guilds.cache.get(String(guildId));
  return guild && guild.name ? guild.name : null;
}

function corNumerica(cor) {
  if (typeof cor === 'number') return cor;
  const texto = String(cor || '').replace('#', '');
  const valor = parseInt(texto, 16);
  return Number.isFinite(valor) ? valor : COR_PADRAO_ANUNCIO;
}

function enviarAviso(canalId, texto) {
  return fila.enfileirar(canalId, () => enviarPelaApi(canalId, { content: textoDoBotParaDiscord(texto), allowed_mentions: { parse: [] } }));
}

function enviarAnuncio(canalId, anuncio) {
  const embed = { color: corNumerica(anuncio.cor) };
  if (anuncio.titulo) embed.title = limitar(anuncio.titulo, 256);
  if (anuncio.descricao) embed.description = limitar(anuncio.descricao, 4096);
  if (anuncio.autor) embed.author = { name: limitar(anuncio.autor, 256) };
  if (anuncio.footer) embed.footer = { text: limitar(anuncio.footer, 2048) };

  return fila.enfileirar(canalId, () => enviarPelaApi(canalId, { embeds: [embed], allowed_mentions: { parse: [] } }));
}

module.exports = {
  nome: 'discord',
  enfileirar: fila.enfileirar,
  criarPreparo,
  entregar,
  montarEdicao,
  editarCopia,
  apagarCopia,
  buscarMensagem,
  buscarUsuario,
  nomeServidor,
  enviarAnuncio,
  enviarAviso
};
