const { PREFIXO } = require('../../config');
const Guild = require('../../models/Guild');
const { limparFalhasDestino } = require('../../services/destinos');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');

module.exports = {
  name: 'desconectar',
  aliases: [],
  description: 'Desconecta este servidor do chat global.',

  async execute(message) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (!(await temPermissaoConfig(message))) {
      await message.channel.send('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
      return;
    }

    const gId = String(guildId);
    const r = await Guild.updateOne(
      { guildId: gId, canalId: { $ne: null } },
      { canalId: null, pausado: false, filtrarPalavroes: false, filtrarLinks: false }
    );
    limparFalhasDestino(gId);
    if (r.matchedCount > 0) {
      log.ok('DESCONECTAR', `Servidor desconectado | ${descreverContexto(message)}`);
      await message.channel.send(`<:checkboxcirclefill:1562606683371339777> Este servidor foi desconectado do chat global.\n-# Use ${PREFIXO}config no canal desejado para reconectar.`);
    } else {
      await message.channel.send('<:information2fill:1562606683371339784> Este servidor não está conectado ao chat global.');
    }
  }
};
