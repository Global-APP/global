const { Schema, model } = require('mongoose');

const participanteSchema = new Schema(
  {
    guildId: { type: String, required: true },
    plataforma: { type: String, enum: ['fluxer', 'discord'], default: 'fluxer' },
    canalId: { type: String, required: true },
    nomeServidor: { type: String, default: null },
    webhookId: { type: String, default: null },
    webhookToken: { type: String, default: null },
    webhookCanalId: { type: String, default: null },
    entrouEm: { type: Number, default: () => Date.now() }
  },
  { _id: false }
);

const ponteSchema = new Schema({
  codigo: { type: String, required: true, unique: true },
  nome: { type: String, default: null },
  donoId: { type: String, required: true },
  donoGuildId: { type: String, required: true },
  participantes: { type: [participanteSchema], default: [] },
  criadoEm: { type: Number, default: () => Date.now() }
});

module.exports = model('Ponte', ponteSchema);
