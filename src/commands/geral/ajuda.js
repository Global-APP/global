const { EmbedBuilder } = require('@fluxerjs/core');
const { DONO_ID, PREFIXO } = require('../../config');
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
      publico(`${PREFIXO}ping/status`, 'Mostra a latência do Global.'),
      publico(`${PREFIXO}help/ajuda`, 'Mostra todos os comandos do Global.'),
      publico(`${PREFIXO}config`, 'No canal que é executado, seta a conexão Global.'),
      publico(`${PREFIXO}desconectar`, 'Desconecta este servidor do chat global.'),
      publico(`${PREFIXO}pausar/retomar`, 'Pausa ou retoma o chat global neste servidor.'),
      publico(`${PREFIXO}automod`, 'Escolhe se este servidor filtra palavrões e links (padrão: liberados).'),
      publico(`${PREFIXO}report`, `Responda a uma mensagem do global com ${PREFIXO}report [motivo] para denunciá-la.`),
      publico(`${PREFIXO}botinfo/global`, 'Envia as informações principais do Global.')
    ];

    if (staff) {
      comandos.push(
        restrito(`${PREFIXO}ban/unban`, 'Bloqueia ou desbloqueia um usuário ou servidor do global.'),
        restrito(`${PREFIXO}bloqueios`, 'Lista usuários e servidores bloqueados.'),
        restrito(`${PREFIXO}filtro`, 'Gerencia o filtro (add/remove/liberar/testar/recarregar/list).'),
        restrito(`${PREFIXO}servidores`, 'Lista os servidores conectados ao global.')
      );
    }

    if (dono) {
      comandos.push(
        restrito(`${PREFIXO}servercolor`, 'Troca a cor da mensagem dos membros em um servidor específico.'),
        restrito(`${PREFIXO}up/down`, 'Promove um usuário para staff, e remove de um membro do staff.'),
        restrito(`${PREFIXO}anuncio`, 'Cria ou agenda um anúncio global.')
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
