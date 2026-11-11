const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./harness/falsos');

H.instalarApi(H.criarApi());

const { limparLogsAntigos } = require('../src/services/limpeza');
const { canalAdulto, servidorAdulto, origemAdulta } = require('../src/services/filtros/adulto');
const { checarMidia } = require('../src/services/filtros/nsfw');
const { configDaGuild } = require('../src/services/filtros/moderacao');

test('apaga só os logs com mais dias que o prazo e ignora outros arquivos', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-'));
  const dia = 24 * 60 * 60 * 1000;
  const criar = (nome, idadeDias) => {
    const caminho = path.join(pasta, nome);
    fs.writeFileSync(caminho, 'x');
    const quando = new Date(Date.now() - idadeDias * dia);
    fs.utimesSync(caminho, quando, quando);
  };
  criar('2026-01-01.log', 45);
  criar('2026-10-20.log', 31);
  criar('2026-11-05.log', 5);
  criar('notas.txt', 90);

  assert.equal(limparLogsAntigos(pasta, 30), 2);
  assert.deepEqual(fs.readdirSync(pasta).sort(), ['2026-11-05.log', 'notas.txt']);
});

test('reconhece canal 18+, override 18+ e servidor 18+', () => {
  assert.equal(canalAdulto({ nsfw: true }), true);
  assert.equal(canalAdulto({ nsfw: false, nsfwOverride: true }), true);
  assert.equal(canalAdulto({ nsfw: false, nsfwOverride: null }), false);
  assert.equal(servidorAdulto({ nsfw: true }), true);
  assert.equal(origemAdulta({ channel: { nsfw: false }, guild: { nsfw: true } }), true);
  assert.equal(origemAdulta({ channel: { nsfw: false }, guild: null }), false);
});

test('servidor sem configuração já nasce com o filtro de palavras ligado', async () => {
  const cfg = await configDaGuild('servidor-novo');
  assert.equal(cfg.filtrarPalavroes, true);
  assert.equal(cfg.filtrarLinks, false);
});

test('a verificação NSFW olha todos os anexos e figurinhas, não só o primeiro', async () => {
  const consultadas = [];
  global.fetch = async (url, opcoes) => {
    const alvo = JSON.parse(opcoes.body).url;
    consultadas.push(alvo);
    return { ok: true, json: async () => ({ nsfw: alvo.includes('ruim'), tipo: 'imagem', score: 0.1, ms: 1 }) };
  };

  const message = {
    attachments: [
      { url: 'https://cdn.exemplo/boa.png' },
      { url: 'https://cdn.exemplo/audio.mp3' },
      { url: 'https://cdn.exemplo/ruim.png' }
    ],
    stickers: [{ url: 'https://cdn.exemplo/figurinha.webp' }, { url: 'https://cdn.exemplo/anim.json' }],
    author: { id: 'u1', username: 'u1' },
    guildId: 'g1'
  };

  const motivo = await checarMidia(message);
  assert.match(motivo, /NSFW/);
  assert.deepEqual(consultadas, ['https://cdn.exemplo/boa.png', 'https://cdn.exemplo/ruim.png']);

  consultadas.length = 0;
  message.attachments = [{ url: 'https://cdn.exemplo/boa.png' }];
  assert.equal(await checarMidia(message), null);
  assert.deepEqual(consultadas, ['https://cdn.exemplo/boa.png', 'https://cdn.exemplo/figurinha.webp']);
});
