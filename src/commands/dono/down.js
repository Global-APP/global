const { DONO_ID } = require('../../config');
const { sql } = require('../../lib/database');
const { ehSnowflake } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');

module.exports = {
  name: 'down',
  aliases: [],
  description: 'Remove um usuário da staff.',

  async execute(message, args) {
    if (message.author.id !== DONO_ID) {
      log.warn('DOWN', `Acesso negado para ${descreverContexto(message)}`);
      await message.channel.send('<:closecirclefill:1562606683371339786> **Somente o desenvolvedor do Global** pode realizar essa ação.');
      return;
    }

    let alvoId = null;
    if (message.mentions && message.mentions.users && message.mentions.users.size > 0) {
      alvoId = message.mentions.users.first().id;
    } else if (args[0] && ehSnowflake(args[0])) {
      alvoId = args[0];
    }

    if (!alvoId) {
      await message.channel.send('<:information2fill:1562606683371339784> Uso correto: `g.down @usuario` ou `g.down ID`');
      return;
    }

    const r = sql.delStaff.run(String(alvoId));
    if (r.changes > 0) {
      log.ok('DOWN', `Staff removido: ${alvoId}`);
      await message.channel.send(`<:checkboxcirclefill:1562606683371339777> Status de Staff removido de <@${alvoId}>.`);
    } else {
      await message.channel.send('<:information2fill:1562606683371339784> Este usuário não está na lista de Staffs.');
    }
  }
};
