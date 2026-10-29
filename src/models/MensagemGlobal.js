const { Schema, model } = require('mongoose');

const mensagemGlobalSchema = new Schema({
  grupoId: { type: String, required: true },
  guildId: { type: String, required: true },
  canalId: { type: String, required: true },
  msgId: { type: String, required: true, unique: true },
  autorId: { type: String, required: true },
  criadoEm: { type: Number, required: true, default: () => Date.now() }
});

mensagemGlobalSchema.index({ grupoId: 1, guildId: 1 });
mensagemGlobalSchema.index({ criadoEm: 1 });
mensagemGlobalSchema.index({ autorId: 1, criadoEm: 1 });

module.exports = model('MensagemGlobal', mensagemGlobalSchema);
