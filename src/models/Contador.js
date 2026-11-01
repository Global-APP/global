const { Schema, model } = require('mongoose');

const contadorSchema = new Schema({
  chave: { type: String, required: true, unique: true },
  valor: { type: Number, default: 0 }
});

module.exports = model('Contador', contadorSchema);
