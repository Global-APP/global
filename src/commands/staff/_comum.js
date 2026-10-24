const { ehStaffOuDono } = require('../../services/permissoes');
const { log, descreverContexto } = require('../../util/logger');

function tipoBloqueio(token) {
  const t = (token || '').toLowerCase();
  if (['usuario', 'usuário', 'user', 'u'].includes(t)) return 'usuario';
  if (['servidor', 'server', 'guild', 's'].includes(t)) return 'servidor';
  return null;
}

async function negarSeNaoStaff(message) {
  if (ehStaffOuDono(message.author.id)) return false;
  log.warn('ACESSO', `Acesso negado (staff) para ${descreverContexto(message)}`);
  await message.channel.send('<:closecirclefill:1562606683371339786> **Somente a equipe do Global** pode realizar essa ação.');
  return true;
}

module.exports = { tipoBloqueio, negarSeNaoStaff };
