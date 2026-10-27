const test = require('node:test');
const assert = require('node:assert/strict');
const Guild = require('../src/models/Guild');
const User = require('../src/models/User');
const { COR_BADGE } = require('../src/config');
const { infoMensagem } = require('../src/services/chat/mensagem');

test('info da mensagem usa a badge selecionada e respeita a opção do ícone', async (t) => {
  const originalGuildFindOne = Guild.findOne;
  const originalUserFindOne = User.findOne;
  t.after(() => {
    Guild.findOne = originalGuildFindOne;
    User.findOne = originalUserFindOne;
  });

  let mostrarIcone = true;
  Guild.findOne = () => ({ lean: async () => ({ cor: 0x123456, mostrarIcone }) });
  User.findOne = () => ({
    select: () => ({ lean: async () => ({ badges: ['developer', 'partner'], selectedBadge: 'partner' }) })
  });
  const message = {
    guildId: 'guild-1',
    guild: {
      id: 'guild-1',
      name: 'Servidor A',
      iconURL: () => 'https://example.com/server.png'
    },
    author: { id: 'user-1' }
  };

  const comIcone = await infoMensagem(message);
  assert.equal(comIcone.corEmbed, COR_BADGE.partner);
  assert.equal(comIcone.iconeServidor, 'https://example.com/server.png');

  mostrarIcone = false;
  const semIcone = await infoMensagem(message);
  assert.equal(semIcone.iconeServidor, null);
});
