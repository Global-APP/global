process.env.ENTREGA_REQS_POR_SEGUNDO = '35';
process.env.ENTREGA_CONCORRENCIA = '10';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness/falsos');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const api0 = H.criarApi();
H.instalarApi(api0);

const { retransmitirMensagemGlobal, cancelarRetransmissao } = require('../src/services/chat/retransmissao');
const { apagarCopiasDoGrupo } = require('../src/services/chat/sincronizacao');
const Guild = require('../src/models/Guild');

async function novoCenario(opcoes, destinos) {
  const api = H.criarApi(opcoes);
  H.instalarApi(api);
  H.popularDestinos(destinos);
  await Guild.updateOne({ guildId: 'g1' }, { pausado: false });
  H.consultas.clear();
  apiDoCenario = api;
  return api;
}

let apiDoCenario = null;

const consultasDe = (...chaves) => chaves.reduce((s, k) => s + (H.consultas.get(k) || 0), 0);

test('rajada: 100 servidores x 2 mensagens, limite global de 50/s, nada se perde nem duplica', async (t) => {
  const api = await novoCenario({ globalPorSegundo: 50 }, 100);
  const t0 = Date.now();
  await Promise.all([
    retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'primeira mensagem' })),
    retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 2, conteudo: 'segunda mensagem' }))
  ]);
  t.diagnostic(`envios aceitos=${api.aceitos} 429=${api.rate429} tempo=${Date.now() - t0}ms`);

  const esperado = 98 * 2 + 2 * 1;
  assert.equal(api.copiasVivas().length, esperado, 'todas as cópias devem existir');
  for (const [canal, n] of api.envios) {
    assert.equal(n, canal === 'c1' || canal === 'c2' ? 1 : 2, `canal ${canal} recebeu ${n} envio(s)`);
  }
  assert.equal(api.rate429, 0, 'dentro do orçamento não deveria haver 429');
});

test('429 de verdade (bucket global menor que o nosso orçamento): reenvia sem perder nem duplicar', async (t) => {
  const api = await novoCenario({ globalPorSegundo: 8 }, 80);
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'sob pressão' }));
  t.diagnostic(`envios aceitos=${api.aceitos} 429=${api.rate429}`);

  assert.ok(api.rate429 > 0, 'o cenário precisa provocar 429 para valer como teste');
  assert.equal(api.copiasVivas().length, 79);
  for (const [canal, n] of api.envios) assert.equal(n, 1, `canal ${canal} recebeu ${n} envio(s)`);
});

test('replies: resolve as cópias do grupo em lote (poucas queries, não uma por servidor)', async (t) => {
  const api = await novoCenario({ globalPorSegundo: 1000 }, 100);
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: 'mensagem original' }));
  const copiaNoG2 = H.dados.get('MensagemGlobal').find((l) => l.guildId === 'g2');
  assert.ok(copiaNoG2);

  H.consultas.clear();
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 2, conteudo: 'respondendo', respondendo: copiaNoG2.msgId }));
  const consultasMongo = consultasDe('MensagemGlobal.find', 'MensagemGlobal.findOne');
  t.diagnostic(`consultas em MensagemGlobal para 1 reply com 99 destinos: ${consultasMongo}`);

  assert.ok(consultasMongo <= 3, `esperava <= 3 consultas, houve ${consultasMongo}`);
  const comReply = api.copiasVivas().filter((m) => m.opcoes && m.opcoes.replyTo);
  assert.ok(comReply.length >= 1, 'servidores que têm a cópia devem receber como reply');
});

test('cache de destinos: 1 consulta para várias mensagens e invalida quando a config muda', async (t) => {
  const api = await novoCenario({ globalPorSegundo: 1000 }, 20);
  await Guild.updateOne({ guildId: 'g1' }, { pausado: false });
  H.consultas.clear();

  for (let i = 0; i < 5; i++) {
    await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: `msg cache ${i} ${Math.random()}` }));
  }
  const antes = consultasDe('Guild.find');
  t.diagnostic(`Guild.find em 5 mensagens: ${antes}`);
  assert.equal(antes, 1);

  await Guild.updateOne({ guildId: 'g5' }, { pausado: true });
  await retransmitirMensagemGlobal(H.mensagemDe({ guildIdx: 1, conteudo: `apos pausar ${Math.random()}` }));
  assert.equal(consultasDe('Guild.find'), 2, 'depois de alterar a config deve recarregar');
  assert.equal(H.dados.get('Guild').find((g) => g.guildId === 'g5').pausado, true);
  const noC5 = [...api.mensagens.values()].filter((m) => m.canalId === 'c5').length;
  assert.equal(noC5, 5, 'g5 recebeu as 5 primeiras e não a que veio depois da pausa');
});

test('apagar grupo: só remove o vínculo de quem foi resolvido; falha transitória mantém referência', async (t) => {
  const api = await novoCenario({ globalPorSegundo: 1000 }, 0);
  const grupoId = 'orig-1';
  const linhas = [{ grupoId, guildId: 'g0', canalId: 'c0', msgId: grupoId, autorId: 'a', criadoEm: Date.now() }];
  const criarCopia = (i) => {
    const msgId = `copia-${i}`;
    linhas.push({ grupoId, guildId: `g${i}`, canalId: `c${i}`, msgId, autorId: 'a', criadoEm: Date.now() });
    api.mensagens.set(`c${i}:${msgId}`, { canalId: `c${i}`, id: msgId });
    return msgId;
  };
  const normais = [1, 2, 3, 4, 5, 6, 7, 8].map(criarCopia);
  const proibidas = [11, 12, 13].map(criarCopia);
  const instaveis = [21, 22, 23].map(criarCopia);
  const sumidas = [31, 32].map((i) => { const id = criarCopia(i); api.mensagens.delete(`c${i}:${id}`); return id; });
  proibidas.forEach((id) => api.falhasDelete.set(id, 403));
  instaveis.forEach((id) => api.falhasDelete.set(id, 500));
  H.dados.set('MensagemGlobal', linhas);

  const apagadas = await apagarCopiasDoGrupo(grupoId);
  const restantes = H.dados.get('MensagemGlobal').map((l) => l.msgId).sort();
  t.diagnostic(`apagadas=${apagadas} vínculos restantes=${restantes.join(',')}`);

  assert.equal(apagadas, normais.length);
  for (const id of [...normais, ...proibidas, ...sumidas]) assert.ok(!restantes.includes(id), `${id} deveria ter sido resolvido`);
  for (const id of instaveis) assert.ok(restantes.includes(id), `${id} (falha transitória) deveria manter o vínculo`);
  assert.ok(restantes.includes(grupoId), 'a original continua referenciada enquanto houver cópia pendente');
});

test('original apagada no meio da retransmissão: envios pendentes cancelados e nenhuma cópia fica órfã', async (t) => {
  if (typeof cancelarRetransmissao !== 'function') return t.skip('versão sem cancelamento');
  const api = await novoCenario({ globalPorSegundo: 1000 }, 100);
  const msg = H.mensagemDe({ guildIdx: 1, conteudo: 'vai ser apagada' });
  const execucao = retransmitirMensagemGlobal(msg);
  await dormir(150);
  assert.equal(cancelarRetransmissao(msg.id), true, 'a retransmissão deveria estar em andamento');
  await execucao;

  t.diagnostic(`cópias vivas depois do cancelamento: ${api.copiasVivas().length} | vínculos gravados: ${H.dados.get('MensagemGlobal').length}`);
  assert.equal(api.copiasVivas().length, 0);
  assert.equal(H.dados.get('MensagemGlobal').length, 0);
});
