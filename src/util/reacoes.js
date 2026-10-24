const { log, errMsg } = require('./logger');
const { logRateLimit } = require('./ratelimit');

async function reagir(message, candidatos) {
  for (const emoji of candidatos) {
    try {
      await message.react(emoji);
      return true;
    } catch (e) {
      logRateLimit(e, `react "${emoji}" msg ${message.id}`);
      log.warn('REACT', `Falhou com "${emoji}": ${errMsg(e)}`);
    }
  }
  return false;
}

module.exports = { reagir };
