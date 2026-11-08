// Operações de entrega sobre a fila. Tudo opera direto por ID: já temos canalId e msgId no
// MongoDB, então não há fetch de canal/mensagem antes de enviar, editar ou apagar.
const { Routes } = require('@fluxerjs/core');
const { client } = require('../../lib/client');
const { marcarEnvio } = require('../../util/ratelimit');
const { enfileirar, cancelarPendente, statusDe } = require('./fila');

function enviarMensagem(canalId, opcoes) {
  return enfileirar(canalId, () => {
    marcarEnvio(canalId);
    return client.channels.send(String(canalId), opcoes);
  });
}

// Editar a mesma cópia várias vezes enquanto ela espera na fila vira um único PATCH, com a
// última versão.
function editarMensagem(canalId, msgId, body) {
  return enfileirar(
    canalId,
    () => client.rest.patch(Routes.channelMessage(String(canalId), String(msgId)), { body }),
    { prioridade: 'alta', idempotente: true, dedupe: `edit:${msgId}` }
  );
}

// Retorna 'apagada' ou 'ausente' (a cópia já não existia, o que também é o resultado desejado).
function apagarMensagem(canalId, msgId) {
  // Não adianta editar algo que vai ser apagado.
  cancelarPendente(canalId, `edit:${msgId}`);
  return enfileirar(
    canalId,
    async () => {
      try {
        await client.rest.delete(Routes.channelMessage(String(canalId), String(msgId)));
        return 'apagada';
      } catch (e) {
        if (statusDe(e) === 404) return 'ausente';
        throw e;
      }
    },
    { prioridade: 'alta', idempotente: true, dedupe: `del:${msgId}` }
  );
}

// Erro que repetir não resolve (permissão revogada, canal removido...). Diferente de 429/5xx/rede.
function erroPermanente(e) {
  const s = statusDe(e);
  return typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429;
}

module.exports = { enviarMensagem, editarMensagem, apagarMensagem, erroPermanente };
