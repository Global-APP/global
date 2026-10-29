const { EMOJI_BLOQUEIO } = require('../../config');

async function reagirPorFalhaEnvio(message, falhas, reagir) {
  if (!falhas || falhas.length === 0) return false;
  return reagir(message, EMOJI_BLOQUEIO);
}

module.exports = { reagirPorFalhaEnvio };
