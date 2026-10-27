const { Client } = require('@fluxerjs/core');
const { DEBUG_MODE } = require('../config');
const { log } = require('../util/logger');
const { instalarDebugRest } = require('../util/debugRest');

const client = new Client({
  presence: {
    status: 'online',
    customStatus: { text: 'Globalmente conversando' }
  }
});

instalarDebugRest(client.rest, log, DEBUG_MODE);

module.exports = { client };
