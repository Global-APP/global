const { sql } = require('../../lib/database');
const { negarSeNaoStaff } = require('./_comum');

module.exports = {
  name: 'bloqueios',
  aliases: [],
  description: 'Lista usuários e servidores bloqueados.',

  async execute(message) {
    if (await negarSeNaoStaff(message)) return;

    const lista = sql.listarBloqueios.all();
    if (lista.length === 0) {
      await message.channel.send('<:information2fill:1562606683371339784> Nenhum usuário ou servidor bloqueado.');
      return;
    }

    let texto = lista
      .map((b) => `• ${b.tipo === 'usuario' ? 'Usuário' : 'Servidor'} \`${b.id}\`${b.motivo ? ` — ${b.motivo}` : ''}`)
      .join('\n');
    if (texto.length > 1900) texto = texto.slice(0, 1900) + '\n…';

    await message.channel.send(`<:information2fill:1562606683371339784> **Bloqueados (${lista.length})**\n${texto}`);
  }
};
