const { DONO_ID } = require('../../config');
const Guild = require('../../models/Guild');
const { limparFalhasDestino } = require('../../services/destinos');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { membroPodeGerenciarCanais } = require('../../services/permissoes');
const { obterWebhook } = require('../../services/webhooks');

module.exports = {
  name: 'config',
  aliases: ['configurar', 'configurações'],
  description: 'Define o canal atual como a conexão global.',

  async execute(message) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (message.author.id !== DONO_ID) {
      const temPermissao = await membroPodeGerenciarCanais(message);
      if (!temPermissao) {
        log.warn('CONFIG', `Permissão negada para ${descreverContexto(message)}`);
        await message.channel.send('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
        return;
      }
    }

    const gId = String(guildId);
    const anterior = await Guild.findOne({ guildId: gId, canalId: { $ne: null } }).lean();
    try {
      await obterWebhook(gId, String(message.channel.id), message.channel);
    } catch (e) {
      log.error('CONFIG', `Falha ao criar webhook em ${descreverContexto(message)}`, e);
      await message.channel.send(
        '<:closecirclefill:1562606683371339786> Não consegui criar a webhook neste canal. Confira se o bot tem a permissão **Gerenciar Webhooks** e tente novamente.'
      );
      return;
    }

    limparFalhasDestino(gId);
    log.ok('CONFIG', `Canal global ${anterior ? `alterado (${anterior.canalId} -> ${message.channel.id})` : `definido (${message.channel.id})`} | ${descreverContexto(message)}`);

    await message.channel.send(
      `<:checkboxcirclefill:1562606683371339777> O canal <#${message.channel.id}> foi definido com sucesso como a \`Conexão Global\`.\n` +
      '-# Execute g.config no canal que **você quer definir** a conexão global.'
    );
  }
};
