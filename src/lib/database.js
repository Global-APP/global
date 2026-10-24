const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config');
const { log } = require('../util/logger');

async function conectarBanco() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const modelos = require('../models');
  await Promise.all(Object.values(modelos).map((modelo) => modelo.init()));

  log.ok('DB', `Conectado ao MongoDB (${mongoose.connection.name})`);
}

async function desconectarBanco() {
  await mongoose.disconnect();
}

module.exports = { conectarBanco, desconectarBanco, mongoose };
