const { client: clientePadrao } = require('../../lib/client');
const { EmbedBuilder } = require('@fluxerjs/core');

const AVATAR_GLOBAL = 'https://fluxerusercontent.com/avatars/1562253521942745089/152b6f43.webp';

function embedPing(latenciaApi, latenciaGateway) {
  const embed = new EmbedBuilder();
  embed.setTitle('🏓 Pong!');
  embed.setThumbnail(AVATAR_GLOBAL);
  embed.addFields(
    { name: 'API Ping', value: latenciaApi === null ? 'Indisponível' : `${latenciaApi} ms`, inline: true },
    { name: 'Gateway Ping', value: latenciaGateway === null ? 'Indisponível' : typeof latenciaGateway === 'number' ? `${latenciaGateway} ms` : latenciaGateway, inline: true }
  );
  return embed;
}

async function aguardarPingGateway(client, timeoutMs = 60_000, intervaloMs = 500) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, intervaloMs));
    try {
      const ping = client.ws.ping;
      if (Number.isFinite(ping) && ping >= 0) return ping;
    } catch (_) {
      return null;
    }
  }
  return null;
}

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

    let gateway = latenciaGateway !== null ? latenciaGateway
      : heartbeatPendente ? 'Aguardando heartbeat' : null;
    const resposta = await message.reply({ embeds: [embedPing(latenciaApi, gateway)] });
    if (heartbeatPendente) {
      const aguardar = deps.waitForGatewayPing || aguardarPingGateway;
      const pingAtualizado = await aguardar(client);
      gateway = Number.isFinite(pingAtualizado) && pingAtualizado >= 0
        ? pingAtualizado
        : 'Sem resposta após aguardar';
      if (resposta && typeof resposta.edit === 'function') {
        await resposta.edit({ embeds: [embedPing(latenciaApi, gateway)] });
      }
    }
  }
};
