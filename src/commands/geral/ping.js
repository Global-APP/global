const { client: clientePadrao } = require('../../lib/client');

module.exports = {
  name: 'ping',
  aliases: [],
  description: 'Mostra que o Global está operando.',

  async execute(message, deps = {}) {
    const client = deps.client || clientePadrao;
    const now = deps.now || Date.now;
    const inicio = now();
    let latenciaApi = null;
    try {
      await client.rest.get('/users/@me');
      latenciaApi = Math.max(0, now() - inicio);
    } catch (_) {
      // Keep the gateway measurement useful when the API request fails.
    }

    let latenciaGateway = null;
    let heartbeatPendente = false;
    try {
      const ping = client.ws.ping;
      if (Number.isFinite(ping) && ping >= 0) latenciaGateway = ping;
      else if (ping === -1) heartbeatPendente = true;
    } catch (_) {
      // The gateway may not be connected yet.
    }

    const apiTexto = latenciaApi === null ? 'indisponível' : `${latenciaApi} ms`;
    const gatewayTexto = latenciaGateway !== null ? `${latenciaGateway} ms`
      : heartbeatPendente ? 'aguardando heartbeat' : 'indisponível';
    await message.reply(`🏓 Pong! · API: **${apiTexto}** · Gateway: **${gatewayTexto}**`);
  }
};
