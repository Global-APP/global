const { Schema, model } = require('mongoose');

const bloqueioSchema = new Schema({
  tipo: { type: String, enum: ['usuario', 'servidor'], required: true },
  id: { type: String, required: true },
  motivo: { type: String, default: null },
  por: { type: String, default: null },
  criadoEm: { type: Number, default: () => Date.now() }
});

bloqueioSchema.index({ tipo: 1, id: 1 }, { unique: true });

module.exports = model('Bloqueio', bloqueioSchema);
