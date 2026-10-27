const { MAX_FALHAS_CONSECUTIVAS } = require('../config');
const Guild = require('../models/Guild');
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
      await Guild.updateOne({ guildId: gId }, { canalId: null, pausado: false });
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
  const [guilds, bloqueados] = await Promise.all([
    Guild.find({ canalId: { $ne: null }, pausado: false }).lean(),
    Bloqueio.find({ tipo: 'servidor' }).distinct('id')
  ]);

  const bloqueadosSet = new Set(bloqueados);

  return guilds
    .filter((g) => !bloqueadosSet.has(g.guildId))
    .map((g) => ({
      guildId: g.guildId,
      canalId: g.canalId,
      filtrarPalavroes: !!g.filtrarPalavroes,
      filtrarLinks: !!g.filtrarLinks,
      modoMensagem: g.modoMensagem === 'embed' ? 'embed' : 'cru',
      mostrarIcone: g.mostrarIcone === true
    }));
}

module.exports = {
  tratarFalhaDestino,
  registrarSucessoDestino,
  limparFalhasDestino,
  listarDestinosAtivos
};
