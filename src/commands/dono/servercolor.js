const { DONO_ID } = require('../../config');
const { sql } = require('../../lib/database');
const { ehSnowflake } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');

module.exports = {
  name: 'servercolor',
  aliases: [],
  description: 'Troca a cor das mensagens dos membros de um servidor.',

  async execute(message, args) {
    if (message.author.id !== DONO_ID) {
      log.warn('SERVERCOLOR', `Acesso negado para ${descreverContexto(message)}`);
      await message.channel.send('<:closecirclefill:1562606683371339786> **Somente o desenvolvedor do Global** pode realizar essa ação.');
      return;
    }

    if (args.length < 2) {
      await message.channel.send('<:information2fill:1562606683371339784> Uso correto: `g.servercolor <ID_DO_SERVIDOR> <#HEX>`');
      return;
    }

    const targetGuildId = args[0];
    const hexStr = args[1].replace('#', '');

    if (!ehSnowflake(targetGuildId)) {
      await message.channel.send('<:closecirclefill:1562606683371339786> ID de servidor inválido. Use apenas números.');
      return;
    }

    if (!/^[0-9a-fA-F]{6}$/.test(hexStr)) {
      await message.channel.send('<:closecirclefill:1562606683371339786> Código HEX inválido. Use 6 dígitos hexadecimais (ex: `#2d8f31` ou `c0b29d`).');
      return;
    }

    const corInt = parseInt(hexStr, 16);
    sql.upsertCor.run(targetGuildId, corInt);
    log.ok('SERVERCOLOR', `Cor do servidor ${targetGuildId} -> #${hexStr}`);

    await message.channel.send(`<:brushaifill:1562606683371339785> Cor padrão do servidor \`${targetGuildId}\` atualizada para \`#${hexStr}\` com sucesso.`);
  }
};
