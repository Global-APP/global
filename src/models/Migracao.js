const { Schema, model } = require('mongoose');

const migracaoSchema = new Schema({
  nome: { type: String, required: true, unique: true },
  aplicadaEm: { type: Date, default: Date.now }
});

module.exports = model('Migracao', migracaoSchema);
