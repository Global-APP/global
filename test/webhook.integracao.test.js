process.env.ENTREGA_REQS_POR_SEGUNDO = '35';
process.env.ENTREGA_CONCORRENCIA = '10';
process.env.MODO_ENVIO = 'webhook';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness/falsos');

H.instalarApi(H.criarApi());

const { retransmitirMensagemGlobal } = require('../src/services/chat/retransmissao');
const { apagarCopiasDoGrupo, sincronizarEdicao } = require('../src/services/chat/sincronizacao');
const Guild = require('../src/models/Guild');

async function novoCenario(destinos, opcoes = {}) {
  const api = H.criarApi(opcoes);
  H.instalarApi(api);
  H.popularDestinos(destinos);
  await Guild.updateOne({ guildId: 'g1' }, { pausado: false });
  return api;
}

function anexosDe(lista) {
  return { size: lista.length, first: () => lista[0], values: () => lista };
}

function falsoFetch(tamanhos = {}) {
  global.fetch = async (url) => {
    if (String(url).endsWith('/check')) {
      return { ok: true, json: async () => ({ nsfw: false, tipo: 'imagem', score: 0, ms: 1 }) };
    }
    const tamanho = tamanhos[url] ?? 12;
    const dados = Buffer.alloc(tamanho, 1);
    return {
      ok: true,
      headers: { get: () => String(tamanho) },
      arrayBuffer: async () => dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength)
    };
  };
}

const copiasDe = (api) => api.copiasVivas().filter((m) => m.webhookId);

test('envia pelo webhook com nome, rodapé e uma cópia por servidor', async () => {
  const api = await novoCenario(5);
  const msg = H.mensagemDe({ guildIdx: 1, conteudo: 'olá pessoal' });
  await retransmitirMensagemGlobal(msg);

  const copias = copiasDe(api);
  assert.equal(copias.length, 4);
  assert.equal(api.webhooksCriados, 4);
  for (const c of copias) {
    assert.match(c.opcoes.username, /^User \d+ \(@user\d+#0001\)$/);
    assert.match(c.opcoes.content, /^olá pessoal\n-# Servidor g1 — \[Ver perfil\]\(https:\/\/web\.fluxer\.app\/users\/u\d+\)$/);
    assert.deepEqual(c.opcoes.allowedMentions, { parse: [] });
  }
  const vinculos = H.dados.get('MensagemGlobal').filter((l) => l.msgId !== msg.id);
  assert.ok(vinculos.every((l) => l.webhookId));
});

test('reutiliza o webhook já criado nas mensagens seguintes', async () => {
  const api = await novoCenario(4);
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'primeira' }));
  const criados = api.webhooksCriados;
  await Guild.updateOne({ guildId: 'g1' }, { pausado: false });
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, autor: `outro-${Math.random()}`, conteudo: 'segunda' }));
  assert.equal(api.webhooksCriados, criados);
  assert.equal(copiasDe(api).length, 6);
});

test('arquivos, imagens e figurinhas seguem como anexo; o que não cabe vira link', async () => {
  const api = await novoCenario(3);
  falsoFetch({ 'https://cdn.exemplo/grande.zip': 50 * 1024 * 1024 });
  const msg = H.mensagemDe({
    guildIdx: 1,
    conteudo: 'olha isso',
    anexos: anexosDe([
      { url: 'https://cdn.exemplo/foto.png', filename: 'foto.png', size: 12 },
      { url: 'https://cdn.exemplo/animado.gif', filename: 'animado.gif', size: 12 },
      { url: 'https://cdn.exemplo/grande.zip', filename: 'grande.zip', size: 50 * 1024 * 1024 }
    ]),
    figurinhas: [{ url: 'https://cdn.exemplo/figurinha.webp', name: 'fig' }]
  });
  await retransmitirMensagemGlobal(msg);

  const copias = copiasDe(api);
  assert.equal(copias.length, 2);
  for (const c of copias) {
    assert.deepEqual(c.opcoes.files.map((f) => f.filename), ['foto.png', 'animado.gif', 'figurinha.webp']);
    assert.ok(Buffer.isBuffer(c.opcoes.files[0].data));
    assert.ok(c.opcoes.content.includes('https://cdn.exemplo/grande.zip'));
  }
});

test('reply: a cópia vai como resposta à cópia do servidor e menciona o autor original', async () => {
  const api = await novoCenario(4);
  const original = H.mensagemDe({ guildIdx: 1, autor: 'autor-a', conteudo: 'pergunta' });
  await retransmitirMensagemGlobal(original);
  const copiaNoG2 = H.dados.get('MensagemGlobal').find((l) => l.guildId === 'g2' && l.msgId !== original.id);

  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 2, autor: 'autor-b', conteudo: 'resposta', respondendo: copiaNoG2.msgId }));

  const idsDasCopias = new Set(H.dados.get('MensagemGlobal').filter((l) => l.grupoId === original.id).map((l) => l.msgId));
  const respostas = copiasDe(api).filter((m) => m.opcoes.replyTo);
  assert.equal(respostas.length, 3);
  for (const r of respostas) {
    assert.ok(idsDasCopias.has(r.opcoes.replyTo.messageId));
    assert.equal(r.opcoes.ping, false);
  }
});

test('edição do original atualiza as cópias do webhook', async () => {
  const api = await novoCenario(4);
  const original = H.mensagemDe({ guildIdx: 1, conteudo: 'texto antigo' });
  await retransmitirMensagemGlobal(original);

  const editada = { ...original, content: 'texto novo' };
  const canal = { messages: { fetch: async () => editada } };
  const clienteReal = require('../src/lib/client').client;
  const buscar = clienteReal.channels.fetch;
  clienteReal.channels.fetch = async () => canal;
  try {
    await sincronizarEdicao({ content: 'texto antigo' }, editada);
  } finally {
    clienteReal.channels.fetch = buscar;
  }

  const copias = copiasDe(api);
  assert.equal(copias.length, 3);
  for (const c of copias) {
    assert.equal(c.editadaVezes, 1);
    assert.ok(c.opcoes.content.startsWith('texto novo\n-# '));
    assert.match(c.opcoes.username, /^User \d+ \(@/);
  }
});

test('exclusão do original remove as cópias feitas por webhook', async () => {
  const api = await novoCenario(4);
  const original = H.mensagemDe({ guildIdx: 1, conteudo: 'vai sumir' });
  await retransmitirMensagemGlobal(original);
  assert.equal(copiasDe(api).length, 3);

  const apagadas = await apagarCopiasDoGrupo(original.id);
  assert.equal(apagadas, 3);
  assert.equal(api.copiasVivas().length, 0);
  assert.equal(H.dados.get('MensagemGlobal').length, 0);
});

test('webhook apagado no servidor é recriado e a mensagem ainda chega', async () => {
  const api = await novoCenario(3);
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'primeira' }));
  api.webhooks.clear();
  await Guild.updateOne({ guildId: 'g1' }, { pausado: false });

  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, autor: `outro-${Math.random()}`, conteudo: 'depois de apagarem' }));

  const depois = copiasDe(api).filter((m) => m.opcoes.content.startsWith('depois'));
  assert.equal(depois.length, 2);
});

test('429 durante envio por webhook é reenviado sem perder nem duplicar', async () => {
  const api = await novoCenario(60, { globalPorSegundo: 8 });
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'sob pressão' }));
  assert.ok(api.rate429 > 0);
  assert.equal(copiasDe(api).length, 59);
  for (const [, n] of api.envios) assert.equal(n, 1);
});

test('sem permissão para criar webhook, o servidor recebe o embed normal', async () => {
  const api = await novoCenario(3);
  api.webhooks.clear();
  api.criacaoWebhookFalha = true;
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'sem webhook' }));

  const copias = api.copiasVivas();
  assert.equal(copias.length, 2);
  assert.ok(copias.every((m) => !m.webhookId && m.opcoes.embeds));
});

test('cada servidor escolhe o próprio modo: g5 em embed, g6 em webhook', async () => {
  const api = await novoCenario(6);
  await Guild.updateOne({ guildId: 'g5' }, { modoEnvio: 'embed' });
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'modo por servidor' }));

  const noG5 = api.copiasVivas().filter((m) => m.canalId === 'c5');
  const noG6 = api.copiasVivas().filter((m) => m.canalId === 'c6');
  assert.equal(noG5.length, 1);
  assert.ok(noG5[0].opcoes.embeds && !noG5[0].webhookId);
  assert.equal(noG6.length, 1);
  assert.ok(noG6[0].webhookId);
});
