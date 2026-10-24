const { Client } = require('@fluxerjs/core');

const client = new Client({
  presence: {
    status: 'online',
    customStatus: { text: 'Globalmente conversando' }
  }
});

module.exports = { client };
