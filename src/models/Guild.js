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
    mostrarIcone: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Qualquer escrita aqui pode mudar a lista de destinos ativos, então o cache é invalidado.
const OPERACOES_QUERY = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne'];
// Cast: os tipos do Mongoose esperam uma união de literais aqui, não string[].
const schemaComHooks = /** @type {any} */ (guildSchema);
schemaComHooks.post(OPERACOES_QUERY, () => invalidarDestinos());
schemaComHooks.post('save', () => invalidarDestinos());
schemaComHooks.post('insertMany', () => invalidarDestinos());

module.exports = model('Guild', guildSchema);
