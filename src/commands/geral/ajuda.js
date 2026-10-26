const { EmbedBuilder } = require('@fluxerjs/core');
const { DONO_ID } = require('../../config');
const { ehStaffOuDono } = require('../../services/permissoes');

module.exports = {
  name: 'ajuda',
  aliases: ['help', 'comandos'],
  description: 'Mostra todos os comandos do Global.',

  async execute(message) {
    const staff = await ehStaffOuDono(message.author.id);
    const dono = message.author.id === DONO_ID;

    const publico = (nome, valor) => ({ nome, valor, emoji: '<:togglefill:1562606683371339783>' });
    const restrito = (nome, valor) => ({ nome, valor, emoji: '<:toggleline:1562606683371339782>' });

    const comandos = [
      publico('g.ping/status', 'Mostra a latência do Global.'),
      publico('g.help/ajuda', 'Mostra todos os comandos do Global.'),
      publico('g.config', 'No canal que é executado, seta a conexão Global.'),
      publico('g.desconectar', 'Desconecta este servidor do chat global.'),
      publico('g.pausar/retomar', 'Pausa ou retoma o chat global neste servidor.'),
      publico('g.automod', 'Escolhe se este servidor filtra palavrões e links (padrão: liberados).'),
      publico('g.report', 'Responda a uma mensagem do global com g.report [motivo] para denunciá-la.'),
      publico('g.perfil/profile', 'Mostra o card de perfil seu ou de outro usuário.'),
      publico('g.destacar', 'Escolhe a badge em destaque no perfil e na cor das suas mensagens.'),
      publico('g.botinfo/global', 'Envia as informações principais do Global.')
    ];

    if (staff) {
      comandos.push(
        restrito('g.ban/unban', 'Bloqueia ou desbloqueia um usuário ou servidor do global.'),
        restrito('g.bloqueios', 'Lista usuários e servidores bloqueados.'),
        restrito('g.filtro', 'Gerencia o filtro (add/remove/liberar/testar/recarregar/list).'),
        restrito('g.badge', 'Concede, remove ou lista as badges de um usuário.'),
        restrito('g.servidores', 'Lista os servidores conectados ao global.')
      );
    }

    if (dono) {
      comandos.push(
        restrito('g.servercolor', 'Troca a cor da mensagem dos membros em um servidor específico.'),
        restrito('g.up/down', 'Promove um usuário para staff, e remove de um membro do staff.'),
        restrito('g.anuncio', 'Cria ou agenda um anúncio global.')
      );
    }

    try {
      const embedAjuda = new EmbedBuilder()
        .setTitle('<:information2fill:1562606683371339784> Confira meus Comandos')
        .setDescription('-# Bastantes comandos não é? Bom, o suficiente pra um bot que conecta mensagens.')
        .setColor(0x0330EF)
        .addFields(...comandos.map((c) => ({ name: `${c.emoji} ${c.nome}`, value: c.valor, inline: true })));

      await message.channel.send({ embeds: [embedAjuda] });
    } catch (e) {
      await message.channel.send(
        '<:information2fill:1562606683371339784> **Comandos do Global**\n\n' +
        comandos.map((c) => `• \`${c.nome}\` — ${c.valor}`).join('\n')
      );
    }
  }
};
