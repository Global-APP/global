function canalAdulto(canal) {
  return !!canal && (canal.nsfw === true || canal.nsfwOverride === true);
}

function servidorAdulto(guild) {
  return !!guild && guild.nsfw === true;
}

function origemAdulta(message) {
  const guild = message.guild || null;
  return canalAdulto(message.channel) || servidorAdulto(guild);
}

module.exports = { canalAdulto, servidorAdulto, origemAdulta };
