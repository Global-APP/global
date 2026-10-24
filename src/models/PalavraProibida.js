const { Schema, model } = require('mongoose');

const palavraProibidaSchema = new Schema({
  palavra: { type: String, required: true, unique: true }
});

module.exports = model('PalavraProibida', palavraProibidaSchema);
