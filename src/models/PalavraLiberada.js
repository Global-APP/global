const { Schema, model } = require('mongoose');

const palavraLiberadaSchema = new Schema({
  palavra: { type: String, required: true, unique: true }
});

module.exports = model('PalavraLiberada', palavraLiberadaSchema);
