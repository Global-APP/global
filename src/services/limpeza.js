const { RETENCAO_MENSAGENS_MS } = require('../config');
const { sql } = require('../lib/database');
const { log } = require('../util/logger');

function limparMensagensAntigas() {
  try {
    const r = sql.limparMensagensAntigas.run(Date.now() - RETENCAO_MENSAGENS_MS);
    if (r.changes > 0) log.info('DB', `Limpeza: ${r.changes} vínculo(s) de mensagem antigo(s) removido(s).`);
  } catch (e) {
    log.error('DB', 'Erro ao limpar mensagens antigas', e);
  }
}

function iniciarLimpezaMensagens() {
  limparMensagensAntigas();
  setInterval(limparMensagensAntigas, 60 * 60 * 1000);
}

module.exports = { iniciarLimpezaMensagens };
