const fs = require('fs');
const path = require('path');
const { RETENCAO_MENSAGENS_MS, RETENCAO_LOGS_DIAS, PASTA_LOGS } = require('../config');
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

function limparLogsAntigos(pasta = PASTA_LOGS, dias = RETENCAO_LOGS_DIAS, agora = Date.now()) {
  let removidos = 0;
  try {
    const limite = agora - dias * 24 * 60 * 60 * 1000;
    for (const arquivo of fs.readdirSync(pasta)) {
      if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(arquivo)) continue;
      const caminho = path.join(pasta, arquivo);
      if (fs.statSync(caminho).mtimeMs < limite) {
        fs.unlinkSync(caminho);
        removidos++;
      }
    }
    if (removidos > 0) log.info('DB', `Limpeza: ${removidos} arquivo(s) de log com mais de ${dias} dia(s) removido(s).`);
  } catch (e) {
    log.error('DB', 'Erro ao limpar logs antigos', e);
  }
  return removidos;
}

function iniciarLimpezaMensagens() {
  const limpar = () => {
    limparMensagensAntigas();
    limparLogsAntigos();
  };
  limpar();
  setInterval(limpar, 60 * 60 * 1000);
}

module.exports = { iniciarLimpezaMensagens, limparLogsAntigos };
