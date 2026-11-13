const { discordClient } = require('../../lib/discordClient');
const { registrarPlataforma } = require('..');
const adaptador = require('./adaptador');
const { registrarEventosDiscord } = require('./eventos');

async function iniciarDiscord(token) {
  registrarPlataforma(adaptador);
  registrarEventosDiscord();
  await discordClient.login(token);
}

async function encerrarDiscord() {
  try {
    await discordClient.destroy();
  } catch (_) {
    return;
  }
}

module.exports = { iniciarDiscord, encerrarDiscord };
