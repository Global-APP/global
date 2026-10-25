const { Schema, model } = require('mongoose');

const guildSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    canalId: { type: String, default: null },
    pausado: { type: Boolean, default: false },
    filtrarPalavroes: { type: Boolean, default: false },
    filtrarLinks: { type: Boolean, default: false },
    cor: { type: Number, default: null }
  },
  { timestamps: true }
);

module.exports = model('Guild', guildSchema);
