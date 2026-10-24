const { sql } = require('../../lib/database');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');

async function alternarPausa(message, pausar) {
  const guildId = idDoServidor(message);
  if (!guildId) return;

  if (!(await temPermissaoConfig(message))) {
    await message.channel.send('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
    return;
  }

  const r = sql.setPausado.run(pausar ? 1 : 0, String(guildId));
  if (r.changes === 0) {
    await message.channel.send('<:information2fill:1562606683371339784> Este servidor não está conectado ao chat global. Use `g.config` primeiro.');
    return;
  }

  log.ok(pausar ? 'PAUSAR' : 'RETOMAR', descreverContexto(message));
  await message.channel.send(pausar
    ? '<:checkboxcirclefill:1562606683371339777> Chat global **pausado** neste servidor (não envia nem recebe mensagens).\n-# Use g.retomar para voltar.'
    : '<:checkboxcirclefill:1562606683371339777> Chat global **retomado** neste servidor.');
}

module.exports = { alternarPausa };
