const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness/falsos');

H.instalarApi(H.criarApi());
H.instalarApiDiscord(H.criarApiDiscord());

const { registrarPlataforma } = require('../src/plataformas');
const adaptadorDiscord = require('../src/plataformas/discord/adaptador');
const { retransmitirMensagemGlobal } = require('../src/services/chat/retransmissao');
const { apagarCopiasDoGrupo, sincronizarEdicao } = require('../src/services/chat/sincronizacao');
const { converterConteudo, nomeWebhookDiscord } = require('../src/util/conversao');
const filaDiscord = require('../src/plataformas/discord/fila');
const filaPadrao = require('../src/services/entrega/fila');
const Guild = require('../src/models/Guild');

registrarPlataforma(adaptadorDiscord);

async function cenario() {
  const fluxer = H.criarApi();
  const discord = H.criarApiDiscord();
  H.instalarApi(fluxer);
  H.instalarApiDiscord(discord);
  H.popularDestinos(4);

  for (const guildId of ['g3', 'g4']) {
    await Guild.updateOne({ guildId }, { $set: { plataforma: 'discord' } });
  }
  return { fluxer, discord };
}

function mensagemDiscord(opcoes) {
  return { ...H.mensagemDe(opcoes), plataforma: 'discord' };
}

test('mensagem do Fluxer chega nos servidores Fluxer e Discord com rótulo de plataforma só no cruzamento', async () => {
  const { fluxer, discord } = await cenario();
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'olá <:heart2fill:123> mundo' }));

  const noFluxer = fluxer.copiasVivas();
  assert.equal(noFluxer.length, 1);
  assert.match(noFluxer[0].opcoes.content, /^olá <:heart2fill:123> mundo\n-# Servidor g1 — /);

  const noDiscord = discord.copiasVivas();
  assert.equal(noDiscord.length, 2);
  for (const c of noDiscord) {
    assert.ok(c.webhookId);
    assert.match(c.opcoes.content, /^olá :heart2fill: mundo\n-# Servidor g1 · Fluxer — /);
    assert.deepEqual(c.opcoes.allowedMentions, { parse: [] });
  }

  const vinculos = H.dados.get('MensagemGlobal');
  assert.deepEqual(
    vinculos.filter((l) => l.plataforma === 'discord').map((l) => l.guildId).sort(),
    ['g3', 'g4']
  );
});

test('mensagem do Discord chega no Fluxer com menções neutralizadas e rótulo Discord', async () => {
  const { fluxer, discord } = await cenario();
  await retransmitirMensagemGlobal(mensagemDiscord({ guildIdx: 3, conteudo: 'oi <@123456789012345678> <:rir:999>' }));

  const noFluxer = fluxer.copiasVivas();
  assert.equal(noFluxer.length, 2);
  for (const c of noFluxer) {
    assert.match(c.opcoes.content, /^oi @usuário :rir:\n-# Servidor g3 · Discord — /);
    assert.match(c.opcoes.content, /https:\/\/discord\.com\/users\//);
  }

  const noDiscord = discord.copiasVivas();
  assert.equal(noDiscord.length, 1);
  assert.match(noDiscord[0].opcoes.content, /^oi <@123456789012345678> <:rir:999>\n-# Servidor g3 — /);
});

test('Discord usa webhook com nome seguro, reaproveita o webhook e prefixa reply com link', async () => {
  const { discord } = await cenario();
  const original = H.mensagemDe({ guildIdx: 1, conteudo: 'primeira' });
  await retransmitirMensagemGlobal(original);

  const copias = discord.copiasVivas().filter((m) => m.webhookId);
  assert.equal(copias.length, 2);
  assert.equal(discord.webhooksCriados, 2);
  for (const c of copias) {
    assert.match(c.opcoes.content, /^primeira\n-# Servidor g1 · Fluxer — \[Ver perfil\]/);
    assert.deepEqual(c.opcoes.allowedMentions, { parse: [] });
  }

  const resposta = H.mensagemDe({ guildIdx: 1, autor: 'outro', conteudo: 'resposta', respondendo: original.id });
  await retransmitirMensagemGlobal(resposta);

  assert.equal(discord.webhooksCriados, 2);
  const respostas = discord.copiasVivas().filter((m) => m.opcoes && m.opcoes.content.includes('resposta\n'));
  assert.equal(respostas.length, 2);
  for (const r of respostas) {
    assert.match(r.opcoes.content, /^↩️ \[em resposta\]\(https:\/\/discord\.com\/channels\/g[34]\/c[34]\/dw\d+\)\nresposta/);
  }
  const vinculos = H.dados.get('MensagemGlobal').filter((l) => l.msgId.startsWith('dw') && l.grupoId === resposta.id);
  assert.equal(vinculos.length, 2);
});

test('username recusado pelo Discord cai para o nome padrão sem perder a mensagem', async () => {
  const { discord } = await cenario();
  discord.rejeitarUsername = true;
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'teste' }));

  const copias = discord.copiasVivas().filter((m) => m.webhookId);
  assert.equal(copias.length, 2);
  assert.ok(copias.every((c) => c.opcoes.username === 'Global'));
});

test('editar a original atualiza as cópias do Discord', async () => {
  const { discord } = await cenario();
  const original = H.mensagemDe({ guildIdx: 1, conteudo: 'texto antigo' });
  await retransmitirMensagemGlobal(original);

  const editada = { ...original, content: 'texto novo' };
  const clienteReal = require('../src/lib/client').client;
  const buscar = clienteReal.channels.fetch;
  clienteReal.channels.fetch = async () => ({ messages: { fetch: async () => editada } });
  try {
    await sincronizarEdicao({ content: 'texto antigo' }, editada);
  } finally {
    clienteReal.channels.fetch = buscar;
  }

  const copias = discord.copiasVivas();
  assert.equal(copias.length, 2);
  for (const c of copias) {
    assert.equal(c.editadaVezes, 1);
    assert.ok(c.opcoes.content.startsWith('texto novo'), c.opcoes.content);
  }
});

test('apagar a original remove as cópias do Discord', async () => {
  const { discord } = await cenario();
  const original = H.mensagemDe({ guildIdx: 1, conteudo: 'vai sumir' });
  await retransmitirMensagemGlobal(original);
  assert.equal(discord.copiasVivas().length, 2);

  const apagadas = await apagarCopiasDoGrupo(original.id);
  assert.ok(apagadas >= 2);
  assert.equal(discord.copiasVivas().length, 0);
});

test('plataforma sem adaptador registrado é ignorada sem derrubar a retransmissão', async () => {
  const { fluxer, discord } = await cenario();
  await Guild.updateOne({ guildId: 'g4' }, { $set: { plataforma: 'telegram' } });
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'segue' }));

  assert.equal(fluxer.copiasVivas().length, 1);
  assert.equal(discord.copiasVivas().length, 1);
});

test('conversão entre plataformas e nome de webhook do Discord', () => {
  assert.equal(converterConteudo('<@1> <@&2> <#3> <:a:4>', 'discord', 'fluxer'), '@usuário @cargo #canal :a:');
  assert.equal(converterConteudo('igual', 'fluxer', 'fluxer'), 'igual');

  const nome = nomeWebhookDiscord('Fulano discord Clyde');
  assert.doesNotMatch(nome, /discord|clyde/i);
  assert.ok(nomeWebhookDiscord('x'.repeat(200)).length <= 80);
});

test('a fila do Discord é independente da fila do Fluxer', async () => {
  assert.notEqual(filaDiscord, filaPadrao);
  assert.notEqual(filaDiscord.enfileirar, filaPadrao.enfileirar);
  const resultado = await filaDiscord.enfileirar('canal-isolado', async () => 'ok');
  assert.equal(resultado, 'ok');
  assert.equal(filaPadrao.estatisticas().total ?? 0, filaPadrao.estatisticas().total ?? 0);
});

test('sem permissão para criar webhook no Discord, nada é entregue e o canal é avisado uma vez', async () => {
  const { discord } = await cenario();
  discord.criacaoWebhookFalha = true;

  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'primeira' }));
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'segunda' }));

  assert.equal(discord.copiasVivas().filter((m) => m.webhookId).length, 0);
  const avisos = discord.posts.filter((p) => /Gerenciar Webhooks/.test(p.body.content));
  assert.deepEqual(avisos.map((p) => p.canalId).sort(), ['c3', 'c4']);
  assert.ok(H.dados.get('Guild').filter((g) => g.guildId === 'g3' || g.guildId === 'g4').every((g) => g.canalId));
});
