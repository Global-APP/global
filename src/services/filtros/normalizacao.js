function normalizarTexto(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const HOMOGLIFOS = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g'
};

const LEET_DIGITOS = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

function limparBase(texto) {
  // NFKD também converte fullwidth em ASCII.
  let t = String(texto || '').normalize('NFKD').toLowerCase();
  t = t.replace(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff\u00ad]/g, '');
  t = t.replace(/[^\u0000-\u007f]/g, (c) => HOMOGLIFOS[c] || c);
  return t;
}

// "1" é ambíguo (i ou l); quem chama escolhe com umComo.
function aplicarLeet(t, umComo) {
  return t
    .replace(/[0345789]/g, (d) => LEET_DIGITOS[d])
    .replace(/1/g, umComo)
    .replace(/€/g, 'e')
    // @ e $ valem se encostados em letra ("put@", "$ex")
    .replace(/(?<=[a-z])[@$]|[@$](?=[a-z])/g, (c) => (c === '@' ? 'a' : 's'))
    // ! | + só valem no MEIO da palavra, pra "puta!" não virar "putai"
    .replace(/(?<=[a-z])[!|+](?=[a-z])/g, (c) => (c === '!' ? 'i' : c === '|' ? umComo : 't'));
}

// Letras soltas viram uma palavra só: "f u c k", "f.u.c.k".
function extrairTokens(t) {
  const simples = t.split(/[^a-z0-9]+/).filter(Boolean);
  const todos = [...simples];
  let run = [];
  const fechar = () => { if (run.length >= 2) todos.push(run.join('')); run = []; };
  for (const tk of simples) {
    if (tk.length === 1) run.push(tk); else fechar();
  }
  fechar();
  return { simples, todos };
}

const colapsar1 = (s) => s.replace(/(.)\1+/g, '$1');

// Mantém duplas legítimas ("rr", "ss").
const colapsar2 = (s) => s.replace(/(.)\1{2,}/g, '$1$1');

module.exports = { normalizarTexto, limparBase, aplicarLeet, extrairTokens, colapsar1, colapsar2 };
