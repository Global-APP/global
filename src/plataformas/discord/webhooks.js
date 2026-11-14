const { WebhookClient } = require('discord.js');
const { discordClient } = require('../../lib/discordClient');
const { criarGerenciadorWebhooks } = require('../../services/webhooks');

const clientes = new Map();

function clienteDoWebhook({ webhookId, token }) {
  const chave = `${webhookId}:${token}`;
  if (!clientes.has(chave)) clientes.set(chave, new WebhookClient({ id: webhookId, token }));
  return clientes.get(chave);
}

module.exports = criarGerenciadorWebhooks({
  montar: clienteDoWebhook,
  buscarCanal: (canalId) => discordClient.channels.fetch(String(canalId))
});
