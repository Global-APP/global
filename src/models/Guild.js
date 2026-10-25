const { Schema, model } = require('mongoose');

const guildSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    canalId: { type: String, default: null },
    pausado: { type: Boolean, default: false },
    filtrarPalavroes: { type: Boolean, default: false },
    filtrarLinks: { type: Boolean, default: false },
    cor: { type: Number, default: null },
    webhookId: { type: String, default: null },
    webhookToken: { type: String, default: null, select: false },
    webhooksAntigas: {
      type: [{
        canalId: { type: String, required: true },
        webhookId: { type: String, required: true },
        webhookToken: { type: String, required: true, select: false },
        expiraEm: { type: Number, required: true }
      }],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = model('Guild', guildSchema);
