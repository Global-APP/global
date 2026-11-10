const { Schema, model } = require('mongoose');
const { invalidarDestinos } = require('../lib/cacheDestinos');

const bloqueioSchema = new Schema({
  tipo: { type: String, enum: ['usuario', 'servidor'], required: true },
  id: { type: String, required: true },
  motivo: { type: String, default: null },
  por: { type: String, default: null },
  criadoEm: { type: Number, default: () => Date.now() }
});

bloqueioSchema.index({ tipo: 1, id: 1 }, { unique: true });

const OPERACOES_QUERY = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne'];
const schemaComHooks = /** @type {any} */ (bloqueioSchema);
schemaComHooks.post(OPERACOES_QUERY, () => invalidarDestinos());
schemaComHooks.post('save', () => invalidarDestinos());
schemaComHooks.post('insertMany', () => invalidarDestinos());

module.exports = model('Bloqueio', bloqueioSchema);
