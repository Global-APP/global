const { EmbedBuilder } = require('@fluxerjs/core');
const { DONO_ID, MUBI_ID } = require('../../config');
const { sql } = require('../../lib/database');

module.exports = {
  name: 'botinfo',
  aliases: ['global'],
  description: 'Envia as informações principais do Global.',

  async execute(message) {
    const totalServidores = sql.contarCanais.get().n;
    const ativos = sql.contarUsuariosAtivos.get().n;
    const totalUsuarios = ativos > 0 ? ativos : 1;

    try {
      const embedInfo = new EmbedBuilder()
        .setTitle('<:earthline1:1562606683371339780> Bot-info do Global')
        .setDescription('-# Conectando fronteiras, unindo comunidades e aproximando pessoas através de um ecossistema global fluido.')
        .setColor(0x0330EF)
        .addFields(
          { name: '<:information2fill:1562606683371339784> Desenvolvedor', value: `<@${DONO_ID}> (\`xMqR\`)\n<@${MUBI_ID}> (\`Mubi\`)`, inline: true },
          { name: '<:brushaifill:1562606683371339785> Estatísticas:', value: `**${totalServidores}** Servidores\n**${totalUsuarios}+** Usuários ativos`, inline: true },
          { name: '<:checkboxcirclefill:1562606683371339777> Dados Técnicos', value: '• **Linguagem:** JavaScript (Node.js)\n• **Biblioteca:** `@fluxerjs/core`\n• **Banco de dados:** SQLite3\n• **Prefixo:** `g.`\n• **Status:** Operacional', inline: false }
        );

      await message.channel.send({ embeds: [embedInfo] });
    } catch (e) {
      await message.channel.send(
        '🌐 **Informações do Global**\n\n' +
        `• **Desenvolvedor:** xMqR, Mubi\n` +
        `• **Servidores Conectados:** ${totalServidores}\n` +
        `• **Usuários Ativos:** ${totalUsuarios}+\n` +
        `• **Linguagem/Biblioteca:** Node.js / @fluxerjs/core\n` +
        `• **Prefixo:** \`g.\``
      );
    }
  }
};
