const { Schema, model } = require('mongoose');

const configGuildSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    filtrarPalavroes: { type: Boolean, default: false },
    filtrarLinks: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = model('ConfigGuild', configGuildSchema);
