const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness/falsos');

H.instalarApi(H.criarApi());

const Guild = require('../src/models/Guild');
const { textoPainel, acaoDaReacao, tratarReacaoPainel, emojiParaAPI, REACAO_WEBHOOK, REACAO_ICONE } = require('../src/services/configPainel');

const silencioso = { debug() {}, info() {}, warn() {}, ok() {}, error() {} };

function emojiRecebido(emoji) {
  const m = emoji.match(/^<a?:([^:]+):(\d+)>$/);
  return m ? { name: m[1], id: m[2] } : { name: emoji };
}

function reacao(emoji, userId = 'dono-painel') {
  const painel = {
    id: 'painel-1',
    guildId: 'g1',
    removidas: [],
    edicoes: [],
    removeReaction: async (e, u) => { painel.removidas.push([e, u]); },
    edit: async (corpo) => { painel.edicoes.push(corpo); }
  };
  return { painel, payload: { userId, guildId: 'g1', messageId: 'painel-1', message: painel, emoji: emojiRecebido(emoji) } };
}

const deps = (extra = {}) => ({
  client: { user: { id: 'bot-id' } },
  ehDev: () => false,
  podeGerenciar: async () => true,
  log: silencioso,
  ...extra
});

async function prepararPainel(config = {}) {
  H.popularDestinos(1);
  Object.assign(H.dados.get('Guild')[0], { configPainelMessageId: 'painel-1', configPainelUserId: 'dono-painel', ...config });
}

test('texto do painel mostra habilitado/desabilitado com os toggles', () => {
  const ligado = textoPainel({ modoEnvio: 'webhook', mostrarIcone: true, canalId: 'c9' });
  assert.match(ligado, /<:togglefill:\d+> \*\*Modo webhook\*\* · habilitado/);
  assert.match(ligado, /<:togglefill:\d+> \*\*Ícone do servidor\*\* · habilitado/);
  assert.match(ligado, /<#c9>/);

  const desligado = textoPainel({ modoEnvio: 'embed', mostrarIcone: false });
  assert.match(desligado, /<:toggleline:\d+> \*\*Modo webhook\*\* · desabilitado/);
  assert.match(desligado, /<:toggleline:\d+> \*\*Ícone do servidor\*\* · desabilitado/);
  assert.match(desligado, /g\.conectar/);
});

test('reconhece as reações personalizadas do painel pelo id', () => {
  assert.equal(acaoDaReacao(emojiRecebido(REACAO_WEBHOOK)), 'webhook');
  assert.equal(acaoDaReacao(emojiRecebido(REACAO_ICONE)), 'icone');
  assert.equal(acaoDaReacao({ name: 'imagefill', id: '1' }), null);
  assert.equal(acaoDaReacao({ name: '👍' }), null);
});

test('reagir alterna o modo webhook, remove a reação e atualiza o painel', async () => {
  await prepararPainel({ modoEnvio: 'embed' });
  const { painel, payload } = reacao(REACAO_WEBHOOK);

  assert.equal(await tratarReacaoPainel(payload, deps()), true);
  assert.equal(H.dados.get('Guild')[0].modoEnvio, 'webhook');
  assert.deepEqual(painel.removidas, [[emojiParaAPI(REACAO_WEBHOOK), 'dono-painel']]);
  assert.equal(painel.edicoes.length, 1);
  assert.match(painel.edicoes[0].embeds[0].toJSON().description, /Modo webhook\*\* · habilitado/);

  const outra = reacao(REACAO_WEBHOOK);
  await tratarReacaoPainel(outra.payload, deps());
  assert.equal(H.dados.get('Guild')[0].modoEnvio, 'embed');
});

test('reagir alterna o ícone do servidor', async () => {
  await prepararPainel({ mostrarIcone: true });
  await tratarReacaoPainel(reacao(REACAO_ICONE).payload, deps());
  assert.equal(H.dados.get('Guild')[0].mostrarIcone, false);
  await tratarReacaoPainel(reacao(REACAO_ICONE).payload, deps());
  assert.equal(H.dados.get('Guild')[0].mostrarIcone, true);
});

test('ignora quem não abriu o painel, bots, painel antigo e quem perdeu a permissão', async () => {
  await prepararPainel({ modoEnvio: 'embed' });

  assert.equal(await tratarReacaoPainel(reacao(REACAO_WEBHOOK, 'intruso').payload, deps()), false);
  assert.equal(await tratarReacaoPainel(reacao(REACAO_WEBHOOK, 'bot-id').payload, deps()), false);

  const antigo = reacao(REACAO_WEBHOOK);
  antigo.payload.messageId = 'painel-antigo';
  antigo.payload.message = { ...antigo.painel, id: 'painel-antigo' };
  assert.equal(await tratarReacaoPainel(antigo.payload, deps()), false);

  assert.equal(await tratarReacaoPainel(reacao(REACAO_WEBHOOK).payload, deps({ podeGerenciar: async () => false })), false);
  assert.equal(H.dados.get('Guild')[0].modoEnvio, 'embed');
});
