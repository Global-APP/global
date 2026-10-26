const { COR_BADGE, PRIORIDADE_BADGES, CONVERSADOR_MENSAGENS, CONVERSADOR_JANELA_MS } = require('../config');
const MensagemGlobal = require('../models/MensagemGlobal');
const User = require('../models/User');
const { log } = require('../util/logger');
const { SOMENTE_ORIGEM } = require('./perfilDados');

const conversadoresConhecidos = new Set();

const APELIDOS = {
  conversador: 'active',
  active: 'active',
  developer: 'developer',
  desenvolvedor: 'developer',
  dev: 'developer',
  parceiro: 'partner',
  partner: 'partner',
  staff: 'staff',
  verificado: 'verified',
  verified: 'verified'
};

function resolverBadge(texto) {
  return (texto && APELIDOS[texto.toLowerCase()]) || null;
}

function badgesDoUsuario(usuario) {
  const lista = new Set((usuario && usuario.badges) || []);
  if (usuario && usuario.staff) lista.add('staff');
  return [...lista];
}

function badgeAtiva(usuario) {
  const lista = badgesDoUsuario(usuario);
  if (usuario && lista.includes(usuario.selectedBadge)) return usuario.selectedBadge;
  return PRIORIDADE_BADGES.find((b) => lista.includes(b)) ?? null;
}

function corDaBadge(usuario) {
  const badge = badgeAtiva(usuario);
  return badge ? COR_BADGE[badge] ?? null : null;
}

async function concederBadge(userId, badge) {
  await User.updateOne({ userId: String(userId) }, { $addToSet: { badges: badge } }, { upsert: true });
}

async function removerBadge(userId, badge) {
  await User.updateOne({ userId: String(userId) }, { $pull: { badges: badge } });
  await User.updateOne({ userId: String(userId), selectedBadge: badge }, { selectedBadge: null });
}

async function selecionarBadge(userId, badge) {
  await User.updateOne({ userId: String(userId) }, { selectedBadge: badge }, { upsert: true });
}

async function verificarConversador(userId) {
  const id = String(userId);
  if (conversadoresConhecidos.has(id)) return;

  if (await User.exists({ userId: id, badges: 'active' })) {
    conversadoresConhecidos.add(id);
    return;
  }

  const total = await MensagemGlobal.countDocuments({
    autorId: id,
    criadoEm: { $gte: Date.now() - CONVERSADOR_JANELA_MS },
    ...SOMENTE_ORIGEM
  });
  if (total < CONVERSADOR_MENSAGENS) return;

  await concederBadge(id, 'active');
  conversadoresConhecidos.add(id);
  log.ok('BADGE', `Usuário ${id} recebeu Conversador (${total} mensagens na janela).`);
}

function esquecerConversador(userId) {
  conversadoresConhecidos.delete(String(userId));
}

module.exports = {
  resolverBadge,
  badgesDoUsuario,
  badgeAtiva,
  corDaBadge,
  concederBadge,
  removerBadge,
  selecionarBadge,
  verificarConversador,
  esquecerConversador
};
