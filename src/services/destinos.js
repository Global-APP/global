const { MAX_FALHAS_CONSECUTIVAS } = require('../config');
const Canal = require('../models/Canal');
const ConfigGuild = require('../models/ConfigGuild');
const Bloqueio = require('../models/Bloqueio');
const { log, errMsg } = require('../util/logger');

const falhasConsecutivas = new Map();

function erroCanalInexistente(e) {
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  const code = Number(e?.code ?? e?.rawError?.code);
  if (status === 404) return true;
  // 10003/10004 = canal/servidor desconhecido; 50001 = sem acesso, que também impede o envio.
  if ([10003, 10004, 50001].includes(code)) return true;
  return /unknown (channel|guild)|canal não encontrado|not found|missing access/i.test(errMsg(e));
}

async function tratarFalhaDestino(guildId, e) {
  if (!erroCanalInexistente(e)) return;
  const gId = String(guildId);
  const n = (falhasConsecutivas.get(gId) || 0) + 1;
  falhasConsecutivas.set(gId, n);
  if (n >= MAX_FALHAS_CONSECUTIVAS) {
    try {
      await Canal.deleteOne({ guildId: gId });
      log.warn('LIMPEZA', `Servidor ${gId} removido da conexão global após ${n} falhas seguidas (canal/servidor inexistente).`);
    } catch (err) {
      log.error('LIMPEZA', `Erro ao remover o servidor ${gId}`, err);
    }
    falhasConsecutivas.delete(gId);
  }
}

function limparFalhasDestino(guildId) {
  falhasConsecutivas.delete(String(guildId));
}

function registrarSucessoDestino(guildId) {
  limparFalhasDestino(guildId);
}

async function listarDestinosAtivos() {
  const [canais, bloqueados, configs] = await Promise.all([
    Canal.find({ pausado: false }).lean(),
    Bloqueio.find({ tipo: 'servidor' }).distinct('id'),
    ConfigGuild.find().lean()
  ]);

  const bloqueadosSet = new Set(bloqueados);
  const configPorGuild = new Map(configs.map((c) => [c.guildId, c]));

  return canais
    .filter((c) => !bloqueadosSet.has(c.guildId))
    .map((c) => {
      const cfg = configPorGuild.get(c.guildId);
      return {
        guildId: c.guildId,
        canalId: c.canalId,
        filtrarPalavroes: !!(cfg && cfg.filtrarPalavroes),
        filtrarLinks: !!(cfg && cfg.filtrarLinks)
      };
    });
}

module.exports = {
  tratarFalhaDestino,
  registrarSucessoDestino,
  limparFalhasDestino,
  listarDestinosAtivos
};
