const Guild = require('../../models/Guild');
const { PREFIXO } = require('../../config');
const { limparFalhasDestino } = require('../../services/destinos');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');
const { origemAdulta } = require('../../services/filtros/adulto');
const { pontePorCanal } = require('../../services/pontes');

module.exports = {
  name: 'conectar',
  aliases: ['connect'],
  description: 'Define o canal atual como a conexão do chat global.',

  async execute(message) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (!(await temPermissaoConfig(message))) {
      log.warn('CONECTAR', `Permissão negada para ${descreverContexto(message)}`);
      await message.reply('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
      return;
    }

    if (origemAdulta(message)) {
      log.warn('CONECTAR', `Canal 18+ recusado | ${descreverContexto(message)}`);
      await message.reply(
        '<:closecirclefill:1562606683371339786> Canais e servidores marcados como **18+** não podem ser conectados ao chat global, porque ele é compartilhado com comunidades que têm menores de idade.\n' +
        `-# Use ${PREFIXO}conectar em um canal que não seja 18+.`
      );
      return;
    }

    if (await pontePorCanal(message.channel.id)) {
      await message.reply('<:closecirclefill:1562606683371339786> Este canal já faz parte de uma ponte privada. Use outro canal ou saia da ponte com `' + PREFIXO + 'ponte sair`.');
      return;
    }

    const gId = String(guildId);
    const anterior = await Guild.findOne({ guildId: gId, canalId: { $ne: null } }).lean();
    await Guild.findOneAndUpdate(
      { guildId: gId },
      { canalId: String(message.channel.id), plataforma: message.plataforma || 'fluxer' },
      { upsert: true }
    );
    limparFalhasDestino(gId);
    log.ok('CONECTAR', `Canal global ${anterior ? `alterado (${anterior.canalId} -> ${message.channel.id})` : `definido (${message.channel.id})`} | ${descreverContexto(message)}`);

    await message.reply(
      `<:checkboxcirclefill:1562606683371339777> O canal <#${message.channel.id}> foi definido com sucesso como a \`Conexão Global\`.\n` +
      `-# O Global precisa da permissão **Gerenciar Webhooks** neste canal. Use ${PREFIXO}config para ver o estado.`
    );
  }
};
