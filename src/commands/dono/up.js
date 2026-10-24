const { DONO_ID } = require('../../config');
const { sql } = require('../../lib/database');
const { ehSnowflake } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');

module.exports = {
  name: 'up',
  aliases: [],
  description: 'Promove um usuário a staff.',

  async execute(message, args) {
    if (message.author.id !== DONO_ID) {
      log.warn('UP', `Acesso negado para ${descreverContexto(message)}`);
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
      await message.channel.send('<:information2fill:1562606683371339784> Uso correto: `g.up @usuario` ou `g.up ID`');
      return;
    }

    sql.addStaff.run(String(alvoId));
    log.ok('UP', `Usuário ${alvoId} promovido a Staff`);

    await message.channel.send(`<:checkboxcirclefill:1562606683371339777> Usuário <@${alvoId}> foi promovido a **Staff**.`);
  }
};
