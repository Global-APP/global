const User = require('../../models/User');
const { ROTULO_BADGE } = require('../../config');
const { badgesDoUsuario, resolverBadge, concederBadge, removerBadge, esquecerConversador } = require('../../services/badges');
const { badges: emojisBadges } = require('../../util/emojis');
const { extrairId } = require('../../util/ids');
const { log } = require('../../util/logger');
const { negarSeNaoStaff } = require('./_comum');

const USO = '<:information2fill:1562606683371339784> Uso correto: `g.badge add <@usuario|ID> <badge>`, `g.badge remove <@usuario|ID> <badge>` ou `g.badge list <@usuario|ID>`\n-# Badges: conversador, developer, parceiro, verificado';
const SEM_PERMISSAO_STAFF = '<:closecirclefill:1562606683371339786> A badge **Staff** é controlada por `g.up` e `g.down`.';

function formatar(badge) {
  return `${emojisBadges[badge] ?? ''} ${ROTULO_BADGE[badge] ?? badge}`.trim();
}

function acaoDe(token) {
  const t = (token || '').toLowerCase();
  if (['add', 'adicionar', 'dar'].includes(t)) return 'add';
  if (['remove', 'remover', 'rm'].includes(t)) return 'remove';
  if (['list', 'listar', 'ver'].includes(t)) return 'list';
  return null;
}

module.exports = {
  name: 'badge',
  aliases: ['badges'],
  description: 'Concede, remove ou lista as badges de um usuário.',

  async execute(message, args) {
    if (await negarSeNaoStaff(message)) return;

    const acao = acaoDe(args[0]);
    const alvoId = extrairId(args[1]);
    if (!acao || !alvoId) {
      await message.channel.send(USO);
      return;
    }

    if (acao === 'list') {
      const usuario = await User.findOne({ userId: alvoId }).lean();
      const lista = badgesDoUsuario(usuario);
      await message.channel.send(
        lista.length
          ? `<:information2fill:1562606683371339784> Badges de <@${alvoId}>:\n${lista.map((b) => `• ${formatar(b)}`).join('\n')}`
          : `<:information2fill:1562606683371339784> <@${alvoId}> não possui badges.`
      );
      return;
    }

    const badge = resolverBadge(args[2]);
    if (!badge) {
      await message.channel.send(USO);
      return;
    }
    if (badge === 'staff') {
      await message.channel.send(SEM_PERMISSAO_STAFF);
      return;
    }

    if (acao === 'add') {
      await concederBadge(alvoId, badge);
      log.ok('BADGE', `${badge} concedida a ${alvoId} por ${message.author.id}`);
      await message.channel.send(`<:checkboxcirclefill:1562606683371339777> <@${alvoId}> recebeu a badge **${formatar(badge)}**.`);
      return;
    }

    const usuario = await User.findOne({ userId: alvoId }).lean();
    if (!badgesDoUsuario(usuario).includes(badge)) {
      await message.channel.send(`<:closecirclefill:1562606683371339786> <@${alvoId}> não possui a badge **${formatar(badge)}**.`);
      return;
    }

    await removerBadge(alvoId, badge);
    if (badge === 'active') esquecerConversador(alvoId);
    log.ok('BADGE', `${badge} removida de ${alvoId} por ${message.author.id}`);
    await message.channel.send(`<:checkboxcirclefill:1562606683371339777> A badge **${formatar(badge)}** foi removida de <@${alvoId}>.`);
  }
};
