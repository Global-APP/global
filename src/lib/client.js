const { Client } = require('@fluxerjs/core');

const client = new Client({
  presence: {
    status: 'online',
    custom_status: { text: 'Globalmente conversando' }
  }
});

module.exports = { client };
