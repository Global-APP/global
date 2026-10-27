const User = require('../../models/User');
const { ROTULO_BADGE, CONVERSADOR_MENSAGENS, PREFIXO } = require('../../config');
const { badgesDoUsuario, badgeAtiva, resolverBadge, selecionarBadge } = require('../../services/badges');
const { emojis, badges: emojisBadges } = require('../../util/emojis');

const LIMPAR = ['nenhuma', 'nenhum', 'limpar', 'remover'];

function formatar(badge) {
  return `${emojisBadges[badge] ?? ''} ${ROTULO_BADGE[badge] ?? badge}`.trim();
}

module.exports = {
  name: 'destacar',
  aliases: ['selecionar'],
  description: 'Escolhe a badge em destaque no seu perfil e na cor das suas mensagens.',

  async execute(message, args) {
    const userId = String(message.author.id);
    const usuario = await User.findOne({ userId }).lean();
    const possui = badgesDoUsuario(usuario);

    if (possui.length === 0) {
      await message.reply(
        '<:information2fill:1562606683371339784> Você ainda não tem badges.\n' +
        `-# Envie ${CONVERSADOR_MENSAGENS} mensagens no chat global em 3 dias para ganhar a badge Conversador.`
      );
      return;
    }

    const escolha = (args[0] || '').toLowerCase();

    if (!escolha) {
      const atual = badgeAtiva(usuario);
      await message.reply(
        '<:information2fill:1562606683371339784> Suas badges:\n' +
        `${possui.map((b) => `• ${formatar(b)}${b === atual ? ' (em destaque)' : ''}`).join('\n')}\n` +
        `-# Use \`${PREFIXO}destacar <badge>\` para escolher ou \`${PREFIXO}destacar nenhuma\` para voltar ao automático.`
      );
      return;
    }

    if (LIMPAR.includes(escolha)) {
      await selecionarBadge(userId, null);
      await message.reply(`${emojis.success} Destaque removido. A badge de maior prioridade volta a ser usada.`);
      return;
    }

    const badge = resolverBadge(escolha);
    if (!badge || !possui.includes(badge)) {
      await message.reply(`${emojis.error} Você não possui essa badge. Use \`${PREFIXO}destacar\` para ver as suas.`);
      return;
    }

    await selecionarBadge(userId, badge);
    await message.reply(`${emojis.success} **${formatar(badge)}** agora está em destaque no seu perfil e na cor das suas mensagens.`);
  }
};
