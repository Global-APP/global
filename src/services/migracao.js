const fs = require('fs');
const { importarAnuncio } = require('./anuncio');
const { ARQUIVO_CONFIG, ARQUIVO_ANUNCIO, COR_PADRAO_ANUNCIO } = require('../config');
const { db, sql } = require('../lib/database');
const { ehSnowflake } = require('../util/ids');
const { log } = require('../util/logger');

function migrarJsonAntigo() {
  if (fs.existsSync(ARQUIVO_CONFIG)) {
    try {
      const json = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf-8'));
      const migrar = db.transaction(() => {
        for (const [g, c] of Object.entries(json.canais || {})) {
          if (ehSnowflake(String(g)) && ehSnowflake(String(c))) sql.upsertCanal.run(String(g), String(c));
        }
        for (const s of json.staffs || []) {
          if (ehSnowflake(String(s))) sql.addStaff.run(String(s));
        }
        for (const [g, cor] of Object.entries(json.cores_servidores || {})) {
          if (ehSnowflake(String(g)) && Number.isInteger(cor)) sql.upsertCor.run(String(g), cor);
        }
      });
      migrar();
      fs.renameSync(ARQUIVO_CONFIG, `${ARQUIVO_CONFIG}.migrado`);
      log.ok('MIGRACAO', `${ARQUIVO_CONFIG} importado para o SQLite (arquivo renomeado para .migrado).`);
    } catch (e) {
      log.error('MIGRACAO', `Falha ao migrar ${ARQUIVO_CONFIG}`, e);
    }
  }

  if (fs.existsSync(ARQUIVO_ANUNCIO)) {
    try {
      const a = JSON.parse(fs.readFileSync(ARQUIVO_ANUNCIO, 'utf-8'));
      importarAnuncio({
        ativo: !!a.ativo,
        titulo: a.titulo ?? null,
        descricao: a.descricao ?? null,
        cor: Number.isInteger(a.cor) ? a.cor : COR_PADRAO_ANUNCIO,
        autor: a.autor ?? null,
        footer: a.footer ?? null,
        intervalo: Number.isInteger(a.intervalo) ? a.intervalo : 0
      });
      fs.renameSync(ARQUIVO_ANUNCIO, `${ARQUIVO_ANUNCIO}.migrado`);
      log.ok('MIGRACAO', `${ARQUIVO_ANUNCIO} importado para o SQLite (arquivo renomeado para .migrado).`);
    } catch (e) {
      log.error('MIGRACAO', `Falha ao migrar ${ARQUIVO_ANUNCIO}`, e);
    }
  }
}

module.exports = { migrarJsonAntigo };
