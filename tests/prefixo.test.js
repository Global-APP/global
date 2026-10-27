const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');

function lerPrefixo(prefixo) {
  return execFileSync(process.execPath, ['-e', "process.stdout.write(require('./src/config').PREFIXO)"], {
    cwd: repo,
    env: { ...process.env, PREFIXO: prefixo },
    encoding: 'utf8'
  });
}

test('usa g. quando PREFIXO está ausente ou vazio', () => {
  assert.equal(lerPrefixo(''), 'g.');
});

test('usa o valor customizado de PREFIXO', () => {
  assert.equal(lerPrefixo('!'), '!');
});

test('carrega prefixo entre aspas usando --env-file do Node', () => {
  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'global-prefixo-'));
  const arquivoEnv = path.join(pastaTemp, '.env');
  fs.writeFileSync(arquivoEnv, 'PREFIXO="!!"\n');
  const env = { ...process.env };
  delete env.PREFIXO;

  try {
    const prefixo = execFileSync(process.execPath, [
      '--env-file', arquivoEnv,
      '-e', "process.stdout.write(require('./src/config').PREFIXO)"
    ], { cwd: repo, env, encoding: 'utf8' });
    assert.equal(prefixo, '!!');
  } finally {
    fs.rmSync(pastaTemp, { recursive: true, force: true });
  }
});
