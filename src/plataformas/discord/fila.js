const { criarFila } = require('../../services/entrega/fila');

module.exports = criarFila({
  nome: 'discord',
  concorrencia: Number(process.env.DISCORD_CONCORRENCIA) || 10,
  taxaMaxima: Number(process.env.DISCORD_REQS_POR_SEGUNDO) || 30
});
