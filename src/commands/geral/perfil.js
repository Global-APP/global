const { client } = require('../../lib/client');
const { COOLDOWN_PERFIL } = require('../../config');
const User = require('../../models/User');
const { badgesDoUsuario, badgeAtiva } = require('../../services/badges');
const { totalMensagens, servidorMaisAtivo } = require('../../services/perfilDados');
const { gerarCardPerfil } = require('../../util/render/cardPerfil');
const { emojis } = require('../../util/emojis');
const { extrairId } = require('../../util/ids');
const { log } = require('../../util/logger');

const cooldownPerfil = new Map();

async function resolverAlvo(message, args) {
  const mencionado = message.mentions && message.mentions.users && message.mentions.users.first();
  if (mencionado) return mencionado;

  const id = extrairId(args[0]);
  if (!id) return message.author;

  try {
    return await client.users.fetch(id);
  } catch {
    return null;
  }
}

module.exports = {
  name: 'perfil',
  aliases: ['profile'],
  description: 'Mostra o card de perfil seu ou de outro usuário.',

  async execute(message, args) {
    const ultimo = cooldownPerfil.get(message.author.id);
    if (ultimo && Date.now() - ultimo < COOLDOWN_PERFIL) {
      await message.channel.send('<:forbidline:1562606683371339778> Aguarde um pouco antes de pedir outro perfil.');
      return;
    }
    cooldownPerfil.set(message.author.id, Date.now());

    const alvo = await resolverAlvo(message, args);
    if (!alvo) {
      await message.channel.send(`${emojis.error} Não encontrei esse usuário.`);
      return;
    }

    try {
      const [usuario, mensagens, topo] = await Promise.all([
        User.findOne({ userId: String(alvo.id) }).lean(),
        totalMensagens(alvo.id),
        servidorMaisAtivo(alvo.id)
      ]);

      const servidor = topo
        ? client.guilds.get(topo.guildId)?.name ?? 'Servidor desconhecido'
        : 'Sem atividade recente';

      const card = await gerarCardPerfil({
        username: alvo.username,
        displayName: alvo.globalName || alvo.username,
        avatar: alvo.displayAvatarURL({ size: 256, extension: 'png' }),
        badges: badgesDoUsuario(usuario),
        selectedBadge: badgeAtiva(usuario),
        mensagens,
        contaCriada: alvo.createdTimestamp,
        servidor,
        servidorMensagens: topo ? topo.total : null
      });

      await message.channel.send({ files: [{ name: `perfil-${alvo.id}.png`, data: card }] });
    } catch (e) {
      log.error('PERFIL', `Falha ao gerar o perfil de ${alvo.id}`, e);
      await message.channel.send(`${emojis.error} Não consegui gerar o perfil agora.`);
    }
  }
};
