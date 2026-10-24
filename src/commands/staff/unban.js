const Bloqueio = require('../../models/Bloqueio');
const { extrairId } = require('../../util/ids');
const { log } = require('../../util/logger');
const { tipoBloqueio, negarSeNaoStaff } = require('./_comum');

module.exports = {
  name: 'unban',
  aliases: ['desbanir'],
  description: 'Desbloqueia um usuário ou servidor do global.',

  async execute(message, args) {
    if (await negarSeNaoStaff(message)) return;

    const tipo = tipoBloqueio(args[0]);
    const alvoId = extrairId(args[1]);
    if (!tipo || !alvoId) {
      await message.channel.send('<:information2fill:1562606683371339784> Uso correto: `g.unban usuario <@usuario|ID>` ou `g.unban servidor <ID>`');
      return;
    }

    const r = await Bloqueio.deleteOne({ tipo, id: alvoId });
    if (r.deletedCount > 0) {
      log.ok('UNBAN', `${tipo} ${alvoId} desbloqueado por ${message.author.id}`);
      await message.channel.send(`<:checkboxcirclefill:1562606683371339777> ${tipo === 'usuario' ? `Usuário <@${alvoId}>` : `Servidor \`${alvoId}\``} foi **desbloqueado**.`);
    } else {
      await message.channel.send('<:information2fill:1562606683371339784> Esse alvo não está bloqueado.');
    }
  }
};
