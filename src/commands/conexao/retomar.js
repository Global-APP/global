const { alternarPausa } = require('./_pausa');

module.exports = {
  name: 'retomar',
  aliases: [],
  description: 'Retoma o chat global neste servidor.',

  execute(message) {
    return alternarPausa(message, false);
  }
};
