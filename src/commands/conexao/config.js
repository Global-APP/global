const { DONO_ID } = require('../../config');
const { sql } = require('../../lib/database');
const { limparFalhasDestino } = require('../../services/destinos');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { membroPodeGerenciarCanais } = require('../../services/permissoes');

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

    const anterior = sql.canalDoServidor.get(String(guildId));
    sql.upsertCanal.run(String(guildId), String(message.channel.id));
    limparFalhasDestino(guildId);
    log.ok('CONFIG', `Canal global ${anterior ? `alterado (${anterior.canal_id} -> ${message.channel.id})` : `definido (${message.channel.id})`} | ${descreverContexto(message)}`);

    await message.channel.send(
      `<:checkboxcirclefill:1562606683371339777> O canal <#${message.channel.id}> foi definido com sucesso como a \`Conexão Global\`.\n` +
      '-# Execute g.config no canal que **você quer definir** a conexão global.'
    );
  }
};
