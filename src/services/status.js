const { client } = require('../lib/client');
const { sql } = require('../lib/database');
const { log } = require('../util/logger');

const STATUS_ROTATIVOS = [
  () => 'Globalmente conversando',
  () => `Estou em ${sql.contarCanais.get().n} comunidades`,
  () => 'Alguma dúvida? Me mencione :D',
  () => 'Alguém realmente lê isso?'
];

let intervaloStatus = null;

function iniciarStatusRotativo() {
  if (typeof client.user.setPresence !== 'function') {
    log.error('STATUS', 'Sua versão do @fluxerjs/core não tem client.user.setPresence. Rode: npm install @fluxerjs/core@latest');
    return;
  }

  let i = 0;
  const atualizar = () => {
    try {
      client.user.setPresence({
        status: 'online',
        customStatus: { text: STATUS_ROTATIVOS[i % STATUS_ROTATIVOS.length]() }
      });
      i++;
    } catch (e) {
      log.error('STATUS', 'Erro ao atualizar presença', e);
    }
  };

  atualizar();
  if (intervaloStatus) clearInterval(intervaloStatus);
  intervaloStatus = setInterval(atualizar, 30_000);
}

module.exports = { iniciarStatusRotativo };
