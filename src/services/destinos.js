const { MAX_FALHAS_CONSECUTIVAS } = require('../config');
const Guild = require('../models/Guild');
const Bloqueio = require('../models/Bloqueio');
const { log, errMsg } = require('../util/logger');
const { obterDestinos } = require('../lib/cacheDestinos');

const falhasConsecutivas = new Map();
const suspensoes = new Map();

const ESPERAS_SEM_PERMISSAO_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000];

function erroSemPermissao(e) {
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  const code = Number(e?.code ?? e?.rawError?.code);
  if (status === 403 || code === 50013) return true;
  return /missing permissions|don't have the permissions/i.test(errMsg(e));
}

function suspenderPorPermissao(guildId) {
  const gId = String(guildId);
  const nivel = Math.min((suspensoes.get(gId)?.nivel ?? -1) + 1, ESPERAS_SEM_PERMISSAO_MS.length - 1);
  const espera = ESPERAS_SEM_PERMISSAO_MS[nivel];
  suspensoes.set(gId, { ate: Date.now() + espera, nivel });
  log.warn('DESTINO', `Servidor ${gId} sem permissão no canal conectado; envios suspensos por ${Math.round(espera / 60_000)} min.`);
}

function destinoSuspenso(guildId) {
  const s = suspensoes.get(String(guildId));
  return !!s && s.ate > Date.now();
}

function erroCanalInexistente(e) {
  const status = e?.status ?? e?.statusCode ?? e?.response?.status;
  const code = Number(e?.code ?? e?.rawError?.code);
  if (status === 404) return true;
  // 10003/10004 = canal/servidor desconhecido; 50001 = sem acesso, que também impede o envio.
  if ([10003, 10004, 50001].includes(code)) return true;
  return /unknown (channel|guild)|canal não encontrado|not found|missing access/i.test(errMsg(e));
}

async function tratarFalhaDestino(guildId, e) {
  if (!erroCanalInexistente(e) && erroSemPermissao(e)) {
    if (!destinoSuspenso(guildId)) suspenderPorPermissao(guildId);
    return;
  }
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
  suspensoes.delete(String(guildId));
  limparFalhasDestino(guildId);
}

async function carregarDestinosAtivos() {
  const [guilds, bloqueados] = await Promise.all([
    Guild.find({ canalId: { $ne: null }, pausado: false }).select('+webhookToken').lean(),
    Bloqueio.find({ tipo: 'servidor' }).distinct('id')
  ]);

  const bloqueadosSet = new Set(bloqueados);

  return guilds
    .filter((g) => !bloqueadosSet.has(g.guildId))
    .map((g) => ({
      guildId: g.guildId,
      canalId: g.canalId,
      filtrarPalavroes: g.filtrarPalavroes !== false,
      filtrarLinks: !!g.filtrarLinks,
      webhookId: g.webhookId || null,
      webhookToken: g.webhookToken || null,
      webhookCanalId: g.webhookCanalId || null,
      modoEnvio: g.modoEnvio || null
    }));
}

async function listarDestinosAtivos() {
  const todos = await obterDestinos(carregarDestinosAtivos);
  return todos.filter((d) => !destinoSuspenso(d.guildId));
}

module.exports = {
  tratarFalhaDestino,
  registrarSucessoDestino,
  limparFalhasDestino,
  listarDestinosAtivos,
  destinoSuspenso
};
