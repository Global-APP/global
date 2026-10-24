const { client } = require('../../lib/client');
const Canal = require('../../models/Canal');
const Bloqueio = require('../../models/Bloqueio');
const { negarSeNaoStaff } = require('./_comum');

module.exports = {
  name: 'servidores',
  aliases: [],
  description: 'Lista os servidores conectados ao global.',

  async execute(message) {
    if (await negarSeNaoStaff(message)) return;

    const [lista, bloqueados] = await Promise.all([
      Canal.find().lean(),
      Bloqueio.find({ tipo: 'servidor' }).distinct('id')
    ]);

    if (lista.length === 0) {
      await message.channel.send('<:information2fill:1562606683371339784> Nenhum servidor conectado.');
      return;
    }

    const bloqueadosSet = new Set(bloqueados);
    let texto = lista.map((c) => {
      const g = client.guilds.get(c.guildId);
      const nome = g && g.name ? g.name : 'Desconhecido';
      return `• **${nome}** (\`${c.guildId}\`)` +
        (c.pausado ? ' ⏸️ pausado' : '') +
        (bloqueadosSet.has(c.guildId) ? ' 🚫 bloqueado' : '');
    }).join('\n');
    if (texto.length > 1900) texto = texto.slice(0, 1900) + '\n…';

    await message.channel.send(`<:earthline1:1562606683371339780> **Servidores conectados (${lista.length})**\n${texto}`);
  }
};
