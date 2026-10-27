const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');

test('ajuda mostra os comandos de perfil e badge com o prefixo configurado', () => {
  const script = `
    const permissoes = require('./src/services/permissoes');
    permissoes.ehStaffOuDono = async () => true;
    const ajuda = require('./src/commands/geral/ajuda');
    let resposta;
    const message = { author: { id: 'test-user' }, channel: { send: async (value) => { resposta = value; } } };
    ajuda.execute(message).then(() => {
      const embed = resposta.embeds[0].toJSON();
      process.stdout.write(JSON.stringify(embed.fields.map((field) => field.name)));
    });
  `;
  const fields = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd: repo,
    env: { ...process.env, PREFIXO: '!' },
    encoding: 'utf8'
  }));

  assert(fields.some((field) => field.includes('!perfil/profile')));
  assert(fields.some((field) => field.includes('!destacar')));
  assert(fields.some((field) => field.includes('!badge')));
});

test('comandos novos não instruem o usuário a usar g. fixo', () => {
  const arquivos = [
    'src/commands/conexao/config.js',
    'src/commands/geral/destacar.js',
    'src/commands/staff/badge.js'
  ];
  const exemploFixo = /g\.(?:config|destacar|badge|up|down|servericon)\b/;

  for (const arquivo of arquivos) {
    assert.equal(exemploFixo.test(fs.readFileSync(path.join(repo, arquivo), 'utf8')), false, arquivo);
  }
});
