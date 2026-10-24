module.exports = {
  name: 'ping',
  aliases: [],
  description: 'Mostra que o Global está operando.',

  async execute(message) {
    await message.channel.send('<:checkboxcirclefill:1562606683371339777> Estou operando `normalmente` com eficiência.');
  }
};
