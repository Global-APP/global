function ehSnowflake(valor) {
  return typeof valor === 'string' && /^\d{15,25}$/.test(valor);
}

function extrairId(token) {
  if (!token) return null;
  const m = token.match(/^<@!?(\d{15,25})>$/);
  if (m) return m[1];
  return ehSnowflake(token) ? token : null;
}

function idDoServidor(message) {
  return message.guildId || (message.guild ? message.guild.id : null);
}

module.exports = { ehSnowflake, extrairId, idDoServidor };
