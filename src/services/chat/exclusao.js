const { log } = require('../../util/logger');
const { cancelarRetransmissao } = require('./retransmissao');
const { ehMensagemOriginal, apagarCopiasDoGrupo } = require('./sincronizacao');

async function aoApagarOriginal(id) {
  const chave = String(id);
  if (cancelarRetransmissao(chave)) {
    log.info('SYNC', `Mensagem ${chave} apagada durante a retransmissão; envios pendentes cancelados.`);
    return;
  }
  if (!(await ehMensagemOriginal(chave))) return;
  const apagadas = await apagarCopiasDoGrupo(chave);
  log.info('SYNC', `Mensagem ${chave} apagada na origem; ${apagadas} cópia(s) removida(s).`);
}

module.exports = { aoApagarOriginal };
