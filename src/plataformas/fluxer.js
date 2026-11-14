const { client } = require('../lib/client');
const { enfileirar } = require('../services/entrega/fila');
const {
  enviarMensagem,
  enviarPorWebhook,
  editarMensagemWebhook,
  apagarCopia: apagarCopiaNoTransporte
} = require('../services/entrega/transporte');
const { montarPayloadWebhook, montarCorpoEdicaoWebhook } = require('../services/chat/mensagem');
const { ErroSemWebhook } = require('../services/entrega/semWebhook');

function payloadWebhookDoDestino(base, mencao, origemReply) {
  if (!mencao) return base;
  return {
    ...base,
    content: `${mencao}\n${base.content}`,
    allowedMentions: { parse: [], users: [origemReply.autorId], repliedUser: false }
  };
}

function criarPreparo({ message, info, obterAnexos, conteudo, rotulo }) {
  const opcoes = { conteudo, rotulo };

  let payloadPronto = null;
  const payloadWebhook = () => {
    if (!payloadPronto) {
      payloadPronto = obterAnexos().then((anexos) => montarPayloadWebhook(message, info, anexos, opcoes));
    }
    return payloadPronto;
  };

  return { payloadWebhook };
}

async function entregar(destino, entrega) {
  const { preparo, mencao, origemReply, alvoReply } = entrega;

  const base = await preparo.payloadWebhook();
  const enviada = await enviarPorWebhook(destino, payloadWebhookDoDestino(base, mencao, origemReply), alvoReply);
  if (!enviada) throw new ErroSemWebhook(destino);
  if (!enviada.mensagem || !enviada.mensagem.id) throw new Error('Webhook não retornou a mensagem criada');

  return {
    guildId: destino.guildId,
    canalId: destino.canalId,
    msgId: enviada.mensagem.id,
    comReply: enviada.comReply,
    webhookId: enviada.webhookId
  };
}

function montarEdicao(message, info, opcoes) {
  return { corpoWebhook: montarCorpoEdicaoWebhook(message, info, opcoes) };
}

async function editarCopia(copia, edicao, credenciais) {
  if (!copia.webhookId) return 'sem-webhook';
  return editarMensagemWebhook(copia, credenciais, edicao.corpoWebhook);
}

function apagarCopia(copia, credenciais) {
  return apagarCopiaNoTransporte(copia, credenciais);
}

async function buscarMensagem(canalId, msgId) {
  const canal = await client.channels.fetch(String(canalId));
  return canal.messages.fetch(String(msgId));
}

function buscarUsuario(userId) {
  return client.users.fetch(String(userId));
}

function nomeServidor(guildId) {
  const guild = client.guilds.get(String(guildId));
  return guild && guild.name ? guild.name : null;
}

function enviarAnuncio(canalId, _anuncio, embed) {
  return enviarMensagem(canalId, { embeds: [embed] });
}

function enviarAviso(canalId, texto) {
  return enviarMensagem(canalId, { content: texto });
}

module.exports = {
  nome: 'fluxer',
  enfileirar,
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
