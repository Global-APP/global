const MensagemGlobal = require('../models/MensagemGlobal');

const SOMENTE_ORIGEM = { $expr: { $eq: ['$msgId', '$grupoId'] } };

async function totalMensagens(userId) {
  return MensagemGlobal.countDocuments({ autorId: String(userId), ...SOMENTE_ORIGEM });
}

async function servidorMaisAtivo(userId) {
  const [topo] = await MensagemGlobal.aggregate([
    { $match: { autorId: String(userId), ...SOMENTE_ORIGEM } },
    { $group: { _id: '$guildId', total: { $sum: 1 } } },
    { $sort: { total: -1, _id: 1 } },
    { $limit: 1 }
  ]);
  return topo ? { guildId: topo._id, total: topo.total } : null;
}

module.exports = { SOMENTE_ORIGEM, totalMensagens, servidorMaisAtivo };
