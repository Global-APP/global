const { log, errMsg } = require('../util/logger');

const INTERVALO_AVISO_MS = 6 * 60 * 60 * 1000;
const TEXTO_AVISO =
  '<:errorwarningfill:1563362758655746048> Não consegui criar o webhook neste canal, então as mensagens não estão sendo entregues aqui.\n' +
  '-# Dê a permissão **Gerenciar Webhooks** ao Global neste canal e as mensagens voltam sozinhas.';

const ultimosAvisos = new Map();

async function avisarSemWebhook(adaptador, destino) {
  const chave = `${adaptador.nome}:${destino.canalId}`;
  if (Date.now() - (ultimosAvisos.get(chave) || 0) < INTERVALO_AVISO_MS) return false;
  ultimosAvisos.set(chave, Date.now());

  try {
    await adaptador.enviarAviso(destino.canalId, TEXTO_AVISO);
    log.warn('WEBHOOK', `Servidor ${destino.guildId}: avisei no canal ${destino.canalId} que falta permissão de webhook`);
    return true;
  } catch (e) {
    log.warn('WEBHOOK', `Servidor ${destino.guildId}: não consegui avisar sobre o webhook (${errMsg(e)})`);
    return false;
  }
}

module.exports = { avisarSemWebhook, INTERVALO_AVISO_MS };
