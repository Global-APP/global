const { client } = require('../../lib/client');
const { DONO_ID, SUPORTE_GUILD_ID } = require('../../config');
const User = require('../../models/User');
const Bloqueio = require('../../models/Bloqueio');
const { extrairId } = require('../../util/ids');
const { log } = require('../../util/logger');
const { tipoBloqueio, negarSeNaoStaff } = require('./_comum');

module.exports = {
  name: 'ban',
  aliases: ['bloquear'],
  description: 'Bloqueia um usuário ou servidor do global.',

  async execute(message, args) {
    if (await negarSeNaoStaff(message)) return;

    const tipo = tipoBloqueio(args[0]);
    const alvoId = extrairId(args[1]);
    if (!tipo || !alvoId) {
      await message.reply('<:information2fill:1562606683371339784> Uso correto: `g.ban usuario <@usuario|ID> [motivo]` ou `g.ban servidor <ID> [motivo]`');
      return;
    }

    if (tipo === 'usuario') {
      if (alvoId === DONO_ID || alvoId === client.user.id || alvoId === String(message.author.id)) {
        await message.reply('<:closecirclefill:1562606683371339786> Você não pode bloquear esse usuário.');
        return;
      }
      if (message.author.id !== DONO_ID && await User.exists({ userId: alvoId, staff: true })) {
        await message.reply('<:closecirclefill:1562606683371339786> Somente o desenvolvedor pode bloquear um staff.');
        return;
      }
    } else if (alvoId === SUPORTE_GUILD_ID) {
      await message.reply('<:closecirclefill:1562606683371339786> Você não pode bloquear o servidor de suporte.');
      return;
    }

    const motivo = args.slice(2).join(' ').slice(0, 200) || null;
    await Bloqueio.findOneAndUpdate(
      { tipo, id: alvoId },
      { motivo, por: String(message.author.id), criadoEm: Date.now() },
      { upsert: true }
    );
    log.ok('BAN', `${tipo} ${alvoId} bloqueado por ${message.author.id}${motivo ? ` | ${motivo}` : ''}`);

    await message.reply(
      `<:checkboxcirclefill:1562606683371339777> ${tipo === 'usuario' ? `Usuário <@${alvoId}>` : `Servidor \`${alvoId}\``} foi **bloqueado** do chat global.` +
      (motivo ? `\n-# Motivo: ${motivo}` : '')
    );
  }
};
