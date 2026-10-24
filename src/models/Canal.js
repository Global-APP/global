const { Schema, model } = require('mongoose');

const canalSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    canalId: { type: String, required: true },
    pausado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = model('Canal', canalSchema);
