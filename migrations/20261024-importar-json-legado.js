const fs = require('fs');
const { ARQUIVO_CONFIG, ARQUIVO_ANUNCIO, COR_PADRAO_ANUNCIO } = require('../src/config');
const Canal = require('../src/models/Canal');
const Staff = require('../src/models/Staff');
const CorServidor = require('../src/models/CorServidor');
const Anuncio = require('../src/models/Anuncio');
const { ehSnowflake } = require('../src/util/ids');
const { log } = require('../src/util/logger');

async function importarConfig() {
  if (!fs.existsSync(ARQUIVO_CONFIG)) return;

  const json = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf-8'));

  const canais = Object.entries(json.canais || {})
    .filter(([g, c]) => ehSnowflake(String(g)) && ehSnowflake(String(c)))
    .map(([guildId, canalId]) => ({ guildId: String(guildId), canalId: String(canalId) }));

  if (canais.length > 0) {
    await Canal.bulkWrite(canais.map((c) => ({
      updateOne: { filter: { guildId: c.guildId }, update: { $set: c }, upsert: true }
    })), { ordered: false });
  }

  const staffs = (json.staffs || [])
    .filter((s) => ehSnowflake(String(s)))
    .map((userId) => ({ userId: String(userId) }));

  if (staffs.length > 0) {
    await Staff.bulkWrite(staffs.map((s) => ({
      updateOne: { filter: { userId: s.userId }, update: { $set: s }, upsert: true }
    })), { ordered: false });
  }

  const cores = Object.entries(json.cores_servidores || {})
    .filter(([g, cor]) => ehSnowflake(String(g)) && Number.isInteger(cor))
    .map(([guildId, cor]) => ({ guildId: String(guildId), cor }));

  if (cores.length > 0) {
    await CorServidor.bulkWrite(cores.map((c) => ({
      updateOne: { filter: { guildId: c.guildId }, update: { $set: c }, upsert: true }
    })), { ordered: false });
  }

  fs.renameSync(ARQUIVO_CONFIG, `${ARQUIVO_CONFIG}.migrado`);
  log.ok('MIGRACAO', `${ARQUIVO_CONFIG} importado para o MongoDB (renomeado para .migrado).`);
}

async function importarAnuncio() {
  if (!fs.existsSync(ARQUIVO_ANUNCIO)) return;

  const a = JSON.parse(fs.readFileSync(ARQUIVO_ANUNCIO, 'utf-8'));
  const doc = {
    chave: 'global',
    ativo: !!a.ativo,
    titulo: a.titulo ?? null,
    descricao: a.descricao ?? null,
    cor: Number.isInteger(a.cor) ? a.cor : COR_PADRAO_ANUNCIO,
    autor: a.autor ?? null,
    footer: a.footer ?? null,
    intervalo: Number.isInteger(a.intervalo) ? a.intervalo : 0
  };

  await Anuncio.findOneAndUpdate({ chave: 'global' }, doc, { upsert: true });
  fs.renameSync(ARQUIVO_ANUNCIO, `${ARQUIVO_ANUNCIO}.migrado`);
  log.ok('MIGRACAO', `${ARQUIVO_ANUNCIO} importado para o MongoDB (renomeado para .migrado).`);
}

async function executar() {
  try {
    await importarConfig();
  } catch (e) {
    log.error('MIGRACAO', `Falha ao migrar ${ARQUIVO_CONFIG}`, e);
    throw e;
  }

  try {
    await importarAnuncio();
  } catch (e) {
    log.error('MIGRACAO', `Falha ao migrar ${ARQUIVO_ANUNCIO}`, e);
    throw e;
  }
}

module.exports = { executar };
