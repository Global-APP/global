const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('retransmissão verifica badge Conversador após persistir as mensagens', () => {
  const arquivo = path.join(__dirname, '../src/services/chat/retransmissao.js');
  const codigo = fs.readFileSync(arquivo, 'utf8');
  const persistencia = codigo.indexOf('await MensagemGlobal.bulkWrite(');
  const verificacao = codigo.indexOf('await verificarConversador(autor.id)');

  assert.notEqual(persistencia, -1, 'persistência das mensagens deve existir');
  assert.notEqual(verificacao, -1, 'retransmissão deve verificar a badge Conversador');
  assert.ok(verificacao > persistencia, 'a verificação deve ocorrer depois da persistência');
});
