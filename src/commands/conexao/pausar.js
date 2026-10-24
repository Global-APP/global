const { alternarPausa } = require('./_pausa');

module.exports = {
  name: 'pausar',
  aliases: [],
  description: 'Pausa o chat global neste servidor.',

  execute(message) {
    return alternarPausa(message, true);
  }
};
