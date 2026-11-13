process.env.ENTREGA_CONCORRENCIA = '3';
process.env.ENTREGA_REQS_POR_SEGUNDO = '1000';
process.env.ENTREGA_TIMEOUT_MS = '300';

const test = require('node:test');
const assert = require('node:assert/strict');
const { enfileirar, cancelarPendente, estatisticas, liberarBloqueio } = require('../src/services/entrega/fila');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function erro429(retryAfterSeg, global = false) {
  const e = new Error('Rate limited');
  e.name = 'RateLimitError';
  e.retryAfter = retryAfterSeg;
  e.global = global;
  return e;
}

test('mantém a ordem dentro do mesmo destino e nunca roda 2 jobs juntos nele', async () => {
  const ordem = [];
  let simultaneos = 0;
  let maxSimultaneos = 0;
  const job = (n) => async () => {
    simultaneos++;
    maxSimultaneos = Math.max(maxSimultaneos, simultaneos);
    await dormir(5);
    ordem.push(n);
    simultaneos--;
  };
  await Promise.all([1, 2, 3, 4, 5].map((n) => enfileirar('canal-ordem', job(n))));
  assert.deepEqual(ordem, [1, 2, 3, 4, 5]);
  assert.equal(maxSimultaneos, 1);
});

test('respeita o teto de concorrência global entre destinos diferentes', async () => {
  let ativos = 0;
  let pico = 0;
  const job = async () => {
    ativos++;
    pico = Math.max(pico, ativos);
    await dormir(20);
    ativos--;
  };
  await Promise.all(Array.from({ length: 12 }, (_, i) => enfileirar(`canal-conc-${i}`, job)));
  assert.equal(pico, 3);
});

test('429 reenfileira o job, espera retry_after e executa exatamente uma vez com sucesso', async () => {
  let chamadas = 0;
  const t0 = Date.now();
  const r = await enfileirar('canal-429', async () => {
    chamadas++;
    if (chamadas === 1) throw erro429(0.15);
    return 'ok';
  });
  assert.equal(r, 'ok');
  assert.equal(chamadas, 2);
  assert.ok(Date.now() - t0 >= 140, 'deveria ter esperado o retry_after');
});

test('429 em qualquer destino pausa todos os envios do bot pelo tempo informado', async () => {
  let n = 0;
  const primeiro = enfileirar('canal-bloqueado', async () => {
    if (++n === 1) throw erro429(0.3);
    return 'depois';
  });
  await dormir(30);
  const t0 = Date.now();
  await enfileirar('canal-outro', async () => 'outro');
  assert.ok(Date.now() - t0 >= 200, 'o outro canal deveria esperar a pausa geral');
  assert.equal(await primeiro, 'depois');
});

test('429 seguidos não diminuem a pausa e cada job espera a pausa geral antes de tentar de novo', async () => {
  const inicios = [];
  let n = 0;
  await enfileirar('canal-escala', async () => {
    inicios.push(Date.now());
    if (++n <= 3) throw erro429(0.05);
    return 'ok';
  });
  const intervalos = inicios.slice(1).map((t, i) => t - inicios[i]);
  assert.equal(inicios.length, 4);
  assert.ok(intervalos.every((v) => v >= 40));
});

test('429 global pausa todos os destinos', async () => {
  let n = 0;
  const a = enfileirar('canal-g1', async () => {
    if (++n === 1) throw erro429(0.2, true);
    return 'a';
  });
  await dormir(20);
  const t0 = Date.now();
  await enfileirar('canal-g2', async () => 'b');
  assert.ok(Date.now() - t0 >= 120, 'deveria ter esperado a pausa global');
  assert.equal(await a, 'a');
});

test('desiste depois de muitos 429 seguidos e rejeita com o erro original', async () => {
  await assert.rejects(
    enfileirar('canal-desiste', async () => { throw erro429(0); }),
    (e) => e.name === 'RateLimitError'
  );
});

test('erro comum não é repetido em send (evita duplicar mensagem)', async () => {
  let chamadas = 0;
  const e = new Error('boom');
  e.statusCode = 500;
  await assert.rejects(enfileirar('canal-send', async () => { chamadas++; throw e; }));
  assert.equal(chamadas, 1);
});

test('operação idempotente repete falha transitória e para em erro permanente', async () => {
  let a = 0;
  const r = await enfileirar('canal-idem', async () => {
    if (++a < 2) { const e = new Error('x'); e.statusCode = 502; throw e; }
    return 'ok';
  }, { idempotente: true });
  assert.equal(r, 'ok');
  assert.equal(a, 2);

  let b = 0;
  await assert.rejects(enfileirar('canal-idem2', async () => {
    b++;
    const e = new Error('forbidden'); e.statusCode = 403; throw e;
  }, { idempotente: true }));
  assert.equal(b, 1);
});

test('dedupe: edições repetidas na fila viram uma só, com a última versão', async () => {
  const usados = [];
  const bloqueio = enfileirar('canal-dedupe', () => dormir(40));
  const p1 = enfileirar('canal-dedupe', async () => { usados.push('v1'); return 'v1'; }, { dedupe: 'edit:1' });
  const p2 = enfileirar('canal-dedupe', async () => { usados.push('v2'); return 'v2'; }, { dedupe: 'edit:1' });
  const p3 = enfileirar('canal-dedupe', async () => { usados.push('v3'); return 'v3'; }, { dedupe: 'edit:1' });
  await bloqueio;
  assert.deepEqual(await Promise.all([p1, p2, p3]), ['v3', 'v3', 'v3']);
  assert.deepEqual(usados, ['v3']);
});

test('cancelarPendente remove job que ainda não começou', async () => {
  let rodou = false;
  const bloqueio = enfileirar('canal-cancel', () => dormir(40));
  const p = enfileirar('canal-cancel', async () => { rodou = true; }, { dedupe: 'edit:9' });
  assert.equal(cancelarPendente('canal-cancel', 'edit:9'), true);
  assert.equal(await p, 'cancelado');
  await bloqueio;
  assert.equal(rodou, false);
});

test('prioridade alta passa na frente, sem starvation do normal', async () => {
  const ordem = [];
  const altas = Array.from({ length: 8 }, (_, i) =>
    enfileirar('canal-prio', async () => { ordem.push(`a${i}`); }, { prioridade: 'alta' }));
  const normal = enfileirar('canal-prio', async () => { ordem.push('n'); });
  await Promise.all([...altas, normal]);
  assert.equal(ordem.length, 9);
  assert.equal(ordem[0], 'a0', 'alta passa na frente');
  assert.equal(ordem.indexOf('n'), 5, `ordem: ${ordem.join(',')}`);
});

test('backlog zera quando tudo termina', async () => {
  await dormir(50);
  const s = estatisticas();
  assert.equal(s.pendentes, 0);
  assert.equal(s.emVoo, 0);
});

test('429 com espera de horas pausa todos os envios, descarta a fila e recusa novos até liberar', async () => {
  let chamadas = 0;
  const falha = erro429(3597);
  const primeiro = enfileirar('canal-a', async () => { chamadas++; throw falha; });
  const segundo = enfileirar('canal-a', async () => { chamadas++; return 'x'; });
  const terceiro = enfileirar('canal-b', async () => { chamadas++; return 'y'; });

  const resultados = await Promise.allSettled([primeiro, segundo, terceiro]);
  assert.ok(resultados.filter((r) => r.status === 'rejected').length >= 2);
  assert.equal(resultados[0].status, 'rejected');
  assert.equal(resultados[1].status, 'rejected');

  const antes = chamadas;
  await assert.rejects(enfileirar('canal-c', async () => { chamadas++; }), (e) => e === falha);
  assert.equal(chamadas, antes);
  assert.equal(estatisticas().pendentes, 0);

  liberarBloqueio();
  assert.equal(await enfileirar('canal-c', async () => 'ok'), 'ok');
});

test('envio que nunca responde estoura o tempo e libera a vaga', async () => {
  const travado = enfileirar('canal-travado', () => new Promise(() => {}));
  await assert.rejects(travado, /sem resposta/);
  assert.equal(estatisticas().emVoo, 0);
  assert.equal(await enfileirar('canal-travado', async () => 'ok'), 'ok');
});
