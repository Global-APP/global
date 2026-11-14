const crypto = require('node:crypto');
const Ponte = require('../models/Ponte');
const Guild = require('../models/Guild');
const { log } = require('../util/logger');

const MAX_PARTICIPANTES = 10;
const MAX_PONTES_POR_SERVIDOR = 5;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let pontes = null;
let carregando = null;

async function carregar() {
  if (pontes) return pontes;
  if (!carregando) {
    carregando = Ponte.find({}).lean()
      .then((lista) => {
        pontes = new Map(lista.map((p) => [p.codigo, p]));
        return pontes;
      })
      .finally(() => { carregando = null; });
  }
  return carregando;
}

function recarregar() {
  pontes = null;
  return carregar();
}

function normalizarCodigo(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatarCodigo(bruto) {
  return `${bruto.slice(0, 4)}-${bruto.slice(4)}`;
}

function gerarCodigo() {
  let bruto = '';
  for (const byte of crypto.randomBytes(8)) bruto += ALFABETO[byte % ALFABETO.length];
  return formatarCodigo(bruto);
}

async function pontePorCodigo(texto) {
  const lista = await carregar();
  const bruto = normalizarCodigo(texto);
  if (bruto.length !== 8) return null;
  return lista.get(formatarCodigo(bruto)) || null;
}

async function pontePorCanal(canalId) {
  const id = String(canalId);
  for (const ponte of (await carregar()).values()) {
    if (ponte.participantes.some((p) => p.canalId === id)) return ponte;
  }
  return null;
}

async function pontesDoServidor(guildId) {
  const id = String(guildId);
  return [...(await carregar()).values()].filter((p) => p.participantes.some((x) => x.guildId === id));
}

async function canalEstaLivre(canalId) {
  const id = String(canalId);
  if (await pontePorCanal(id)) return false;
  return !(await Guild.exists({ canalId: id }));
}

async function salvar(ponte) {
  await Ponte.findOneAndUpdate({ codigo: ponte.codigo }, { $set: ponte }, { upsert: true });
  await recarregar();
}

async function apagar(codigo) {
  await Ponte.deleteMany({ codigo });
  await recarregar();
}

function participanteDe({ guildId, plataforma, canalId, nomeServidor }) {
  return {
    guildId: String(guildId),
    plataforma: plataforma || 'fluxer',
    canalId: String(canalId),
    nomeServidor: nomeServidor || null,
    entrouEm: Date.now()
  };
}

async function criarPonte({ nome, donoId, guildId, plataforma, canalId, nomeServidor }) {
  if (!(await canalEstaLivre(canalId))) return { erro: 'canal-ocupado' };
  if ((await pontesDoServidor(guildId)).length >= MAX_PONTES_POR_SERVIDOR) return { erro: 'limite-servidor' };

  const ponte = {
    codigo: gerarCodigo(),
    nome: nome ? String(nome).slice(0, 40) : null,
    donoId: String(donoId),
    donoGuildId: String(guildId),
    participantes: [participanteDe({ guildId, plataforma, canalId, nomeServidor })],
    criadoEm: Date.now()
  };
  await salvar(ponte);
  log.ok('PONTE', `Ponte ${ponte.codigo} criada por ${donoId} em ${guildId}`);
  return { ponte };
}

async function entrarNaPonte(codigo, dados) {
  const ponte = await pontePorCodigo(codigo);
  if (!ponte) return { erro: 'codigo-invalido' };
  if (!(await canalEstaLivre(dados.canalId))) return { erro: 'canal-ocupado' };
  if (ponte.participantes.some((p) => p.guildId === String(dados.guildId))) return { erro: 'servidor-ja-esta' };
  if (ponte.participantes.length >= MAX_PARTICIPANTES) return { erro: 'ponte-cheia' };
  if ((await pontesDoServidor(dados.guildId)).length >= MAX_PONTES_POR_SERVIDOR) return { erro: 'limite-servidor' };

  const atualizada = { ...ponte, participantes: [...ponte.participantes, participanteDe(dados)] };
  await salvar(atualizada);
  log.ok('PONTE', `Servidor ${dados.guildId} entrou na ponte ${ponte.codigo}`);
  return { ponte: atualizada };
}

async function removerParticipante(ponte, guildId) {
  const id = String(guildId);
  const restantes = ponte.participantes.filter((p) => p.guildId !== id);
  if (restantes.length === ponte.participantes.length) return { erro: 'nao-participa' };

  if (restantes.length === 0) {
    await apagar(ponte.codigo);
    log.info('PONTE', `Ponte ${ponte.codigo} encerrada: sem participantes`);
    return { encerrada: true };
  }

  const donoSaiu = ponte.donoGuildId === id;
  await salvar({
    ...ponte,
    donoGuildId: donoSaiu ? restantes[0].guildId : ponte.donoGuildId,
    participantes: restantes
  });
  return { encerrada: false };
}

async function encerrarPonte(ponte) {
  await apagar(ponte.codigo);
  log.info('PONTE', `Ponte ${ponte.codigo} encerrada pelo dono`);
}

async function removerGuildDasPontes(guildId) {
  const lista = await pontesDoServidor(guildId);
  for (const ponte of lista) await removerParticipante(ponte, guildId);
  return lista.length;
}

async function definirWebhookDoParticipante(codigo, guildId, credencial) {
  const ponte = (await carregar()).get(codigo);
  if (!ponte) return false;

  const participantes = ponte.participantes.map((p) => (
    p.guildId === String(guildId)
      ? {
        ...p,
        webhookId: credencial.webhookId || null,
        webhookToken: credencial.webhookToken || null,
        webhookCanalId: credencial.webhookCanalId || null
      }
      : p
  ));
  await salvar({ ...ponte, participantes });
  return true;
}

function credenciaisDasPontes(copias) {
  const mapa = new Map();
  for (const c of copias) {
    if (!c.ponteId) continue;
    const ponte = pontes && pontes.get(c.ponteId);
    const p = ponte && ponte.participantes.find((x) => x.guildId === String(c.guildId));
    if (p && p.webhookId && p.webhookToken) mapa.set(`${c.ponteId}:${c.guildId}`, { webhookId: p.webhookId, webhookToken: p.webhookToken });
  }
  return mapa;
}

function destinosDaPonte(ponte, guildIdOrigem) {
  return ponte.participantes
    .filter((p) => p.guildId !== String(guildIdOrigem))
    .map((p) => ({
      guildId: p.guildId,
      plataforma: p.plataforma || 'fluxer',
      canalId: p.canalId,
      webhookId: p.webhookId || null,
      webhookToken: p.webhookToken || null,
      webhookCanalId: p.webhookCanalId || null,
      ponteId: ponte.codigo
    }));
}

module.exports = {
  MAX_PARTICIPANTES,
  MAX_PONTES_POR_SERVIDOR,
  normalizarCodigo,
  pontePorCodigo,
  pontePorCanal,
  pontesDoServidor,
  canalEstaLivre,
  criarPonte,
  entrarNaPonte,
  removerParticipante,
  encerrarPonte,
  removerGuildDasPontes,
  destinosDaPonte,
  definirWebhookDoParticipante,
  credenciaisDasPontes,
  carregarPontes: carregar,
  recarregarPontes: recarregar
};
