const { Schema, model } = require('mongoose');
const { invalidarDestinos } = require('../lib/cacheDestinos');

const guildSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true },
    canalId: { type: String, default: null },
    pausado: { type: Boolean, default: false },
    filtrarPalavroes: { type: Boolean, default: false },
    filtrarLinks: { type: Boolean, default: false },
    cor: { type: Number, default: null },
    mostrarIcone: { type: Boolean, default: false },
    webhookId: { type: String, default: null },
    webhookToken: { type: String, default: null, select: false },
    webhookCanalId: { type: String, default: null }
  },
  { timestamps: true }
);

const OPERACOES_QUERY = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne'];
const schemaComHooks = /** @type {any} */ (guildSchema);
schemaComHooks.post(OPERACOES_QUERY, () => invalidarDestinos());
schemaComHooks.post('save', () => invalidarDestinos());
schemaComHooks.post('insertMany', () => invalidarDestinos());

module.exports = model('Guild', guildSchema);
