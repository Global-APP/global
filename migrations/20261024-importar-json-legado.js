const fs = require('fs');
const { ARQUIVO_CONFIG, ARQUIVO_ANUNCIO, COR_PADRAO_ANUNCIO } = require('../src/config');
const Guild = require('../src/models/Guild');
const User = require('../src/models/User');
const Anuncio = require('../src/models/Anuncio');
const { ehSnowflake } = require('../src/util/ids');
const { log } = require('../src/util/logger');

async function importarConfig() {
  if (!fs.existsSync(ARQUIVO_CONFIG)) return;

  const json = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf-8'));

  /** @type {Map<string, any>} */
  const guilds = new Map();

  for (const [guildId, canalId] of Object.entries(json.canais || {})) {
    if (!ehSnowflake(String(guildId)) || !ehSnowflake(String(canalId))) continue;
    guilds.set(String(guildId), { guildId: String(guildId), canalId: String(canalId) });
  }

  for (const [guildId, cor] of Object.entries(json.cores_servidores || {})) {
    if (!ehSnowflake(String(guildId)) || !Number.isInteger(cor)) continue;
    const atual = guilds.get(String(guildId)) || { guildId: String(guildId) };
    guilds.set(String(guildId), { ...atual, cor });
  }

  if (guilds.size > 0) {
    await Guild.bulkWrite([...guilds.values()].map((g) => ({
      updateOne: { filter: { guildId: g.guildId }, update: { $set: g }, upsert: true }
    })), { ordered: false });
  }

  const users = (json.staffs || [])
    .filter((userId) => ehSnowflake(String(userId)))
    .map((userId) => ({ userId: String(userId), staff: true }));

  if (users.length > 0) {
    await User.bulkWrite(users.map((u) => ({
      updateOne: { filter: { userId: u.userId }, update: { $set: u }, upsert: true }
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
