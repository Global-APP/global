const { Schema, model } = require('mongoose');

const anuncioSchema = new Schema(
  {
    chave: { type: String, default: 'global', unique: true },
    ativo: { type: Boolean, default: false },
    titulo: { type: String, default: null },
    descricao: { type: String, default: null },
    cor: { type: Number, required: true },
    autor: { type: String, default: null },
    footer: { type: String, default: null },
    intervalo: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = model('Anuncio', anuncioSchema);
