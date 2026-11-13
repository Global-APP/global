const { PREFIXO } = require('../../config');
const Guild = require('../../models/Guild');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');

const LIGADO = '<:togglefill:1562606683371339783>';
const DESLIGADO = '<:toggleline:1562606683371339782>';
const INFO = '<:information2fill:1562606683371339784>';

function estadoDoWebhook(config) {
  const ativo = !!config.webhookId && config.webhookCanalId === config.canalId;
  return ativo
    ? `${LIGADO} **Webhook** · ativo neste canal`
    : `${DESLIGADO} **Webhook** · ainda não criado\n-# Ele é criado na primeira mensagem. O Global precisa da permissão **Gerenciar Webhooks** no canal.`;
}

function montarStatus(config) {
  const conexao = config.canalId
    ? `${INFO} Conexão global: <#${config.canalId}>${config.pausado ? ' (pausada)' : ''}`
    : `${INFO} Este servidor não está conectado, use \`${PREFIXO}conectar\`.`;

  return [
    '# Configurações do Global',
    '',
    conexao,
    '',
    config.canalId ? estadoDoWebhook(config) : null,
    config.canalId ? '' : null,
    `${config.filtrarPalavroes !== false ? LIGADO : DESLIGADO} **Filtro de palavrões**`,
    `${config.filtrarLinks ? LIGADO : DESLIGADO} **Filtro de links**`,
    `-# Altere os filtros com \`${PREFIXO}automod\` e pause com \`${PREFIXO}pausar\`.`
  ].filter((linha) => linha !== null).join('\n');
}

module.exports = {
  name: 'config',
  aliases: ['configurar', 'configurações'],
  description: 'Mostra o estado da conexão global e do webhook.',

  async execute(message) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (!(await temPermissaoConfig(message))) {
      log.warn('CONFIG', `Permissão negada para ${descreverContexto(message)}`);
      await message.reply('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
      return;
    }

    const config = await Guild.findOne({ guildId: String(guildId) }).lean();
    await message.reply(montarStatus(config || {}));
  }
};
