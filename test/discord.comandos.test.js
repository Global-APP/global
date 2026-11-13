const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness/falsos');

H.instalarApi(H.criarApi());
H.instalarApiDiscord(H.criarApiDiscord());

const Guild = require('../src/models/Guild');
const { criarInteracaoCompat, criarMensagemCompat } = require('../src/plataformas/discord/compat');
const { definicoes } = require('../src/plataformas/discord/slash');
const { carregarComandos, tratarComando } = require('../src/handlers/commandHandler');

function interacaoFalsa({ permissoes = true, usuario = 'u-adm' } = {}) {
  const respostas = [];
  return {
    respostas,
    id: 'i1',
    channelId: 'c3',
    guildId: 'g3',
    guild: { id: 'g3', name: 'Discord g3' },
    user: { id: usuario, username: 'adm', discriminator: '0', bot: false, displayAvatarURL: () => null },
    member: null,
    memberPermissions: { has: () => permissoes },
    channel: { id: 'c3', nsfw: false, send: async () => ({ id: 'x' }) },
    deferred: true,
    replied: false,
    editReply: async (o) => { respostas.push(o); return { id: 'painel-1' }; },
    followUp: async (o) => { respostas.push(o); return { id: 'extra' }; },
    reply: async (o) => { respostas.push(o); return { id: 'painel-1' }; }
  };
}

test('/conectar no Discord grava a plataforma e converte emojis do Fluxer', async () => {
  H.popularDestinos(0);
  carregarComandos();
  const interacao = interacaoFalsa();
  const compat = criarInteracaoCompat(interacao, '');

  assert.equal(await tratarComando(compat, 'g.conectar', ['conexao', 'geral']), true);

  const row = H.dados.get('Guild').find((g) => g.guildId === 'g3');
  assert.equal(row.plataforma, 'discord');
  assert.equal(row.canalId, 'c3');
  assert.match(interacao.respostas[0].content, /^✅ O canal/);
  assert.match(interacao.respostas[0].content, /\/config/);
});

test('sem Gerenciar Canais o comando é negado', async () => {
  H.popularDestinos(0);
  carregarComandos();
  const interacao = interacaoFalsa({ permissoes: false });
  await tratarComando(criarInteracaoCompat(interacao, ''), 'g.conectar', ['conexao', 'geral']);

  assert.equal(H.dados.get('Guild').length, 0);
  assert.match(interacao.respostas[0].content, /Gerenciar Canais/);
});

test('comandos de staff e dono não passam pelo Discord', async () => {
  carregarComandos();
  const interacao = interacaoFalsa();
  assert.equal(await tratarComando(criarInteracaoCompat(interacao, ''), 'g.ban 1', ['conexao', 'geral']), false);
});

test('/config no Discord mostra conexão e estado do webhook sem opções de modo', async () => {
  H.popularDestinos(0);
  carregarComandos();
  await Guild.findOneAndUpdate({ guildId: 'g3' }, { canalId: 'c3', plataforma: 'discord' }, { upsert: true });

  const antes = interacaoFalsa();
  await tratarComando(criarInteracaoCompat(antes, ''), 'g.config', ['conexao', 'geral']);
  assert.match(antes.respostas[0].content, /Conexão global: <#c3>/);
  assert.match(antes.respostas[0].content, /ainda não criado/);
  assert.doesNotMatch(antes.respostas[0].content, /embed/i);

  await Guild.updateOne({ guildId: 'g3' }, { $set: { webhookId: 'w1', webhookToken: 't', webhookCanalId: 'c3' } });
  const depois = interacaoFalsa();
  await tratarComando(criarInteracaoCompat(depois, ''), 'g.config', ['conexao', 'geral']);
  assert.match(depois.respostas[0].content, /ativo neste canal/);
});

test('slash registra só comandos permitidos e a mensagem compat mantém permissão e conteúdo limpo', async () => {
  carregarComandos();
  const nomes = definicoes().map((d) => d.name).sort();
  assert.deepEqual(nomes, ['ajuda', 'automod', 'botinfo', 'conectar', 'config', 'desconectar', 'pausar', 'ping', 'ponte', 'retomar']);

  const bruta = {
    id: 'm1', content: 'oi <@1>', cleanContent: 'oi @fulano', channelId: 'c3', guildId: 'g3',
    guild: { id: 'g3', name: 'G' }, webhookId: null, type: 0, attachments: new Map(), stickers: new Map(),
    reference: { messageId: 'm0' }, mentions: { users: new Map() },
    member: { displayName: 'Fulano', permissions: { has: () => true }, displayAvatarURL: () => 'av' },
    author: { id: 'u1', username: 'fulano', discriminator: '0', bot: false, globalName: 'F', displayAvatarURL: () => 'av' },
    channel: { nsfw: false, send: async () => ({}) }
  };
  const compat = criarMensagemCompat(bruta);
  assert.equal(compat.content, 'oi @fulano');
  assert.equal(compat.messageReference.messageId, 'm0');
  assert.equal(compat.author.displayName, 'Fulano');
  assert.equal(`${compat.author}`, '<@u1>');
  assert.equal(await compat.podeGerenciarCanais(), true);
});
