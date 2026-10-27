const test = require('node:test');
const assert = require('node:assert/strict');
const { montarPayloadEdicao, montarPayloadWebhook } = require('../src/services/chat/mensagem');

test('payload da webhook exibe cor da badge e ícone do servidor no embed', () => {
  const payload = montarPayloadWebhook({
    author: { id: 'user-1', username: 'member', displayName: 'Member' },
    content: 'Olá'
  }, {
    nomeServidor: 'Servidor A',
    corEmbed: 0x4ade5f,
    iconeServidor: 'https://example.com/server.png'
  });

  const embed = payload.embeds && payload.embeds[0] && payload.embeds[0].toJSON();
  assert.ok(embed, 'deve incluir o embed de apresentação da mensagem');
  assert.equal(embed.color, 0x4ade5f);
  assert.deepEqual(embed.footer, {
    text: 'Servidor A',
    icon_url: 'https://example.com/server.png'
  });
});

test('edição mantém a cor da badge e o ícone do servidor no embed', () => {
  const payload = montarPayloadEdicao({ content: 'Texto editado' }, {
    nomeServidor: 'Servidor A',
    corEmbed: 0x4ade5f,
    iconeServidor: 'https://example.com/server.png'
  });

  const embed = payload.embeds && payload.embeds[0] && payload.embeds[0].toJSON();
  assert.ok(embed, 'a edição deve manter o embed de apresentação');
  assert.equal(embed.color, 0x4ade5f);
  assert.equal(embed.footer.icon_url, 'https://example.com/server.png');
});
