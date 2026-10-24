const { SPAM_LIMITE, SPAM_JANELA_MS } = require('../../config');
const { normalizarTexto } = require('./normalizacao');

const historicoSpam = new Map();

function verificarSpam(userId, texto) {
  const norm = normalizarTexto(texto).trim();
  if (norm.length < 3) return null;
  const agora = Date.now();
  const h = historicoSpam.get(userId);
  if (h && h.texto === norm && agora - h.inicio <= SPAM_JANELA_MS) {
    h.count++;
    if (h.count >= SPAM_LIMITE) return 'evite repetir a mesma mensagem (spam)';
  } else {
    historicoSpam.set(userId, { texto: norm, count: 1, inicio: agora });
  }
  return null;
}

setInterval(() => {
  const limite = Date.now() - SPAM_JANELA_MS;
  for (const [id, h] of historicoSpam) if (h.inicio < limite) historicoSpam.delete(id);
}, 5 * 60 * 1000);

module.exports = { verificarSpam };
