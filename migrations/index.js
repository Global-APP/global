const fs = require('fs');
const path = require('path');
const Migracao = require('../src/models/Migracao');
const { log } = require('../src/util/logger');

async function executarMigracoes() {
  const arquivos = fs.readdirSync(__dirname)
    .filter((arquivo) => arquivo.endsWith('.js') && arquivo !== 'index.js')
    .sort();

  for (const arquivo of arquivos) {
    if (await Migracao.exists({ nome: arquivo })) continue;

    const migracao = require(path.join(__dirname, arquivo));
    await migracao.executar();
    await Migracao.create({ nome: arquivo });
    log.ok('MIGRACAO', `${arquivo} aplicada.`);
  }
}

module.exports = { executarMigracoes };
