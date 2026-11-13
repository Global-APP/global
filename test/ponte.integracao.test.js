const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness/falsos');

H.instalarApi(H.criarApi());
H.instalarApiDiscord(H.criarApiDiscord());

const { registrarPlataforma } = require('../src/plataformas');
registrarPlataforma(require('../src/plataformas/discord/adaptador'));

const pontes = require('../src/services/pontes');
const Ponte = require('../src/models/Ponte');
const Guild = require('../src/models/Guild');
const { retransmitirMensagemGlobal } = require('../src/services/chat/retransmissao');
const { apagarCopiasDoGrupo } = require('../src/services/chat/sincronizacao');
const { removerConexaoDeGuild } = require('../src/services/destinos');
const comando = require('../src/commands/conexao/ponte');

async function limpar() {
  await Ponte.deleteMany({});
  await pontes.recarregarPontes();
}

function ctx(guildId, canalId, plataforma = 'fluxer') {
  const respostas = [];
  return {
    respostas,
    plataforma,
    guildId,
    guild: { id: guildId, name: `Servidor ${guildId}` },
    channel: { id: canalId, guildId, send: async () => ({}) },
    author: { id: 'u-dono', bot: false },
    podeGerenciarCanais: async () => true,
    reply: async (t) => { respostas.push(typeof t === 'string' ? t : t.content); return { id: 'r' }; }
  };
}

test('criar, entrar, listar e sair de uma ponte', async () => {
  await limpar();
  H.popularDestinos(0);

  const a = ctx('g1', 'c1');
  await comando.execute(a, ['criar', 'Amigos']);
  const codigo = a.respostas[0].match(/`([A-Z0-9]{4}-[A-Z0-9]{4})`/)[1];

  const b = ctx('g3', 'c3', 'discord');
  await comando.execute(b, ['entrar', codigo.toLowerCase()]);
  assert.match(b.respostas[0], /2 servidor/);

  await comando.execute(b, ['listar']);
  assert.match(b.respostas[1], /Amigos/);
  assert.match(b.respostas[1], /Discord/);

  await comando.execute(b, ['sair']);
  assert.equal((await pontes.pontePorCodigo(codigo)).participantes.length, 1);
  assert.equal(await pontes.pontePorCanal('c3'), null);
});

test('regras: canal ocupado, código inválido, servidor repetido e permissão', async () => {
  await limpar();
  H.popularDestinos(2);
  await Guild.updateOne({ guildId: 'g2' }, { $set: { canalId: 'c2' } });

  const a = ctx('g1', 'c2');
  await comando.execute(a, ['criar']);
  assert.match(a.respostas[0], /já está conectado/);

  const b = ctx('g1', 'cx');
  await comando.execute(b, ['entrar', 'AAAA-BBBB']);
  assert.match(b.respostas[0], /inválido/);

  await comando.execute(b, ['criar']);
  const codigo = b.respostas[1].match(/`([A-Z0-9]{4}-[A-Z0-9]{4})`/)[1];
  const outroCanal = ctx('g1', 'cy');
  await comando.execute(outroCanal, ['entrar', codigo]);
  assert.match(outroCanal.respostas[0], /já participa/);

  const semPermissao = ctx('g1', 'cz');
  semPermissao.podeGerenciarCanais = async () => false;
  await comando.execute(semPermissao, ['criar']);
  assert.match(semPermissao.respostas[0], /Gerenciar Canais/);
});

test('mensagem na ponte vai só aos canais da ponte, entre plataformas, sem passar pelo global', async () => {
  await limpar();
  const fluxer = H.criarApi();
  const discord = H.criarApiDiscord();
  H.instalarApi(fluxer);
  H.instalarApiDiscord(discord);
  H.popularDestinos(4);

  const { ponte } = await pontes.criarPonte({ donoId: 'u', guildId: 'p1', plataforma: 'fluxer', canalId: 'pc1' });
  await pontes.entrarNaPonte(ponte.codigo, { guildId: 'p2', plataforma: 'discord', canalId: 'pc2' });
  await pontes.entrarNaPonte(ponte.codigo, { guildId: 'p3', plataforma: 'fluxer', canalId: 'pc3' });

  const original = H.mensagemDe({ guildIdx: 1, conteudo: 'segredo da ponte' });
  original.guildId = 'p1';
  original.channel = { ...original.channel, id: 'pc1' };
  await retransmitirMensagemGlobal(original, await pontes.pontePorCanal('pc1'));

  const noDiscord = discord.copiasVivas();
  assert.equal(noDiscord.length, 1);
  assert.equal(noDiscord[0].canalId, 'pc2');
  assert.ok(noDiscord[0].opcoes.content.startsWith('segredo da ponte\n-# Servidor'));

  const salva = await pontes.pontePorCodigo(ponte.codigo);
  const credenciais = salva.participantes.filter((p) => p.webhookId && p.webhookToken).map((p) => p.guildId).sort();
  assert.deepEqual(credenciais, ['p2', 'p3']);

  const noFluxer = fluxer.copiasVivas();
  assert.equal(noFluxer.length, 1);
  assert.equal(noFluxer[0].canalId, 'pc3');

  const linhas = H.dados.get('MensagemGlobal').filter((l) => l.grupoId === original.id);
  assert.equal(linhas.length, 3);
  assert.ok(linhas.every((l) => l.ponteId === ponte.codigo));

  await apagarCopiasDoGrupo(original.id);
  assert.equal(discord.copiasVivas().length, 0);
  assert.equal(fluxer.copiasVivas().length, 0);
});

test('dono pode remover e encerrar; sair do servidor limpa as pontes', async () => {
  await limpar();
  H.popularDestinos(0);

  const { ponte } = await pontes.criarPonte({ donoId: 'u', guildId: 'g1', plataforma: 'fluxer', canalId: 'c1' });
  await pontes.entrarNaPonte(ponte.codigo, { guildId: 'g2', plataforma: 'fluxer', canalId: 'c2' });
  await pontes.entrarNaPonte(ponte.codigo, { guildId: 'g3', plataforma: 'discord', canalId: 'c3' });

  const naoDono = ctx('g2', 'c2');
  await comando.execute(naoDono, ['remover', ponte.codigo, 'g3']);
  assert.match(naoDono.respostas[0], /dono/);

  const dono = ctx('g1', 'c1');
  await comando.execute(dono, ['remover', ponte.codigo, 'g3']);
  assert.equal((await pontes.pontePorCodigo(ponte.codigo)).participantes.length, 2);

  await removerConexaoDeGuild('g1');
  const restante = await pontes.pontePorCodigo(ponte.codigo);
  assert.equal(restante.participantes.length, 1);
  assert.equal(restante.donoGuildId, 'g2');

  const novoDono = ctx('g2', 'c2');
  await comando.execute(novoDono, ['encerrar', ponte.codigo]);
  assert.equal(await pontes.pontePorCodigo(ponte.codigo), null);
});
