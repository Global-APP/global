const test = require('node:test');
const assert = require('node:assert/strict');
const MensagemGlobal = require('../src/models/MensagemGlobal');
const User = require('../src/models/User');
const { verificarConversador } = require('../src/services/badges');

test('concede Conversador ao atingir o limite e não duplica a badge', async (t) => {
  const originals = {
    exists: User.exists,
    updateOne: User.updateOne,
    countDocuments: MensagemGlobal.countDocuments
  };
  t.after(() => {
    User.exists = originals.exists;
    User.updateOne = originals.updateOne;
    MensagemGlobal.countDocuments = originals.countDocuments;
  });

  const userId = `badge-test-${Date.now()}-${Math.random()}`;
  let updates = 0;
  User.exists = async () => false;
  User.updateOne = async () => { updates++; };
  MensagemGlobal.countDocuments = async (query) => {
    assert.equal(query.autorId, userId);
    assert.ok(query.criadoEm.$gte < Date.now());
    return 100;
  };

  await verificarConversador(userId);
  await verificarConversador(userId);

  assert.equal(updates, 1);
});
