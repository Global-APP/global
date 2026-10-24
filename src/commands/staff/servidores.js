const { client } = require('../../lib/client');
const { sql } = require('../../lib/database');
const { estaBloqueado } = require('../../services/permissoes');
const { negarSeNaoStaff } = require('./_comum');

module.exports = {
  name: 'servidores',
  aliases: [],
  description: 'Lista os servidores conectados ao global.',

  async execute(message) {
    if (await negarSeNaoStaff(message)) return;

    const lista = sql.listarCanais.all();
    if (lista.length === 0) {
      await message.channel.send('<:information2fill:1562606683371339784> Nenhum servidor conectado.');
      return;
    }

    let texto = lista.map((c) => {
      const g = client.guilds.get(c.guild_id);
      const nome = g && g.name ? g.name : 'Desconhecido';
      return `• **${nome}** (\`${c.guild_id}\`)` +
        (c.pausado ? ' ⏸️ pausado' : '') +
        (estaBloqueado('servidor', c.guild_id) ? ' 🚫 bloqueado' : '');
    }).join('\n');
    if (texto.length > 1900) texto = texto.slice(0, 1900) + '\n…';

    await message.channel.send(`<:earthline1:1562606683371339780> **Servidores conectados (${lista.length})**\n${texto}`);
  }
};
