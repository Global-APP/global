const { ehDev, PREFIXO } = require('../../config');
const User = require('../../models/User');
const { ehSnowflake } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');

module.exports = {
  name: 'down',
  aliases: [],
  description: 'Remove um usuário da staff.',

  async execute(message, args) {
    if (!ehDev(message.author.id)) {
      log.warn('DOWN', `Acesso negado para ${descreverContexto(message)}`);
      await message.reply('<:closecirclefill:1562606683371339786> **Somente o desenvolvedor do Global** pode realizar essa ação.');
      return;
    }

    let alvoId = null;
    if (message.mentions && message.mentions.users && message.mentions.users.size > 0) {
      alvoId = message.mentions.users.first().id;
    } else if (args[0] && ehSnowflake(args[0])) {
      alvoId = args[0];
    }

    if (!alvoId) {
      await message.reply(`<:information2fill:1562606683371339784> Uso correto: \`${PREFIXO}down @usuario\` ou \`${PREFIXO}down ID\``);
      return;
    }

    const r = await User.findOneAndUpdate({ userId: String(alvoId), staff: true }, { staff: false });
    if (r) {
      log.ok('DOWN', `Staff removido: ${alvoId}`);
      await message.reply(`<:checkboxcirclefill:1562606683371339777> Status de Staff removido de <@${alvoId}>.`);
    } else {
      await message.reply('<:information2fill:1562606683371339784> Este usuário não está na lista de Staffs.');
    }
  }
};
