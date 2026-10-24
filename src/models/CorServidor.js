const { Schema, model } = require('mongoose');

const corServidorSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    cor: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = model('CorServidor', corServidorSchema);
