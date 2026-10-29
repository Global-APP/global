const { RETENCAO_MENSAGENS_MS } = require('../config');
const MensagemGlobal = require('../models/MensagemGlobal');
const { log } = require('../util/logger');

async function limparMensagensAntigas() {
  try {
    const r = await MensagemGlobal.deleteMany({ criadoEm: { $lt: Date.now() - RETENCAO_MENSAGENS_MS } });
    if (r.deletedCount > 0) log.info('DB', `Limpeza: ${r.deletedCount} vínculo(s) de mensagem antigo(s) removido(s).`);
  } catch (e) {
    log.error('DB', 'Erro ao limpar mensagens antigas', e);
  }
}

function iniciarLimpezaMensagens() {
  limparMensagensAntigas();
  setInterval(limparMensagensAntigas, 60 * 60 * 1000);
}

module.exports = { iniciarLimpezaMensagens };
