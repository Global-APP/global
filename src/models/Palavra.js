const { Schema, model } = require('mongoose');

const palavraSchema = new Schema({
  palavra: { type: String, required: true },
  tipo: { type: String, enum: ['proibida', 'liberada'], required: true }
});

palavraSchema.index({ palavra: 1, tipo: 1 }, { unique: true });

module.exports = model('Palavra', palavraSchema);
