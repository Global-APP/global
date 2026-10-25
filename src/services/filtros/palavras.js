const fs = require('fs');
const path = require('path');
const { PASTA_LISTAS } = require('../../config');
const Palavra = require('../../models/Palavra');
const { log } = require('../../util/logger');
const { limparBase, aplicarLeet, extrairTokens, colapsar1, colapsar2 } = require('./normalizacao');

let palavrasUnicas = new Set();
let palavrasColapsadas = new Set();
let frasesProibidas = [];
let palavrasLiberadas = new Set();

function adicionarEntrada(bruta) {
  const base = aplicarLeet(limparBase(bruta), 'i');
  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0 || !/[a-z]{2}/.test(tokens.join(' '))) return false;

  if (tokens.length === 1) {
    const w = tokens[0];
    palavrasUnicas.add(colapsar2(w));
    const c1 = colapsar1(w);
    if (c1.length >= 3) palavrasColapsadas.add(c1);
  } else {
    frasesProibidas.push(tokens.join(' '));
  }
  return true;
}

function carregarArquivosDeListas() {
  let total = 0;
  try {
    if (!fs.existsSync(PASTA_LISTAS)) return 0;
    for (const arq of fs.readdirSync(PASTA_LISTAS)) {
      if (!arq.endsWith('.txt')) continue;
      const linhas = fs.readFileSync(path.join(PASTA_LISTAS, arq), 'utf-8').split(/\r?\n/);
      for (const l of linhas) if (l.trim() && adicionarEntrada(l)) total++;
    }
  } catch (e) {
    log.error('FILTRO', 'Erro ao ler as listas de palavras', e);
  }
  return total;
}

async function recarregarPalavras() {
  palavrasUnicas = new Set();
  palavrasColapsadas = new Set();
  frasesProibidas = [];

  const dosArquivos = carregarArquivosDeListas();

  const palavras = await Palavra.find().lean();
  const proibidas = palavras.filter((p) => p.tipo === 'proibida');
  const liberadas = palavras.filter((p) => p.tipo === 'liberada');

  let doBanco = 0;
  for (const { palavra } of proibidas) if (adicionarEntrada(palavra)) doBanco++;

  palavrasLiberadas = new Set(liberadas.map(({ palavra }) => colapsar2(limparBase(palavra))));

  log.info('FILTRO', `Filtro carregado: ${dosArquivos} palavra(s) de listas + ${doBanco} personalizada(s) | ${palavrasLiberadas.size} liberada(s).`);
}

function totalEntradas() {
  return palavrasUnicas.size + frasesProibidas.length;
}

function formasDe(tk) {
  const formas = [tk];
  if (tk.length > 3 && tk.endsWith('s')) formas.push(tk.slice(0, -1));
  if (tk.length > 4 && tk.endsWith('es')) formas.push(tk.slice(0, -2));
  return formas;
}

function tokenProibido(tk) {
  const c2 = colapsar2(tk);
  const f2 = formasDe(c2);
  if (f2.some((f) => palavrasLiberadas.has(f))) return null;
  for (const f of f2) if (palavrasUnicas.has(f)) return f;

  const c1 = colapsar1(tk);
  if (c1.length >= 3) {
    for (const f of formasDe(c1)) if (f.length >= 3 && palavrasColapsadas.has(f)) return f;
  }
  return null;
}

function acharPalavraProibida(texto) {
  const base = limparBase(texto);
  const variantes = /[1|]/.test(base) ? ['i', 'l'] : ['i'];

  for (const umComo of variantes) {
    const { simples, todos } = extrairTokens(aplicarLeet(base, umComo));

    for (const tk of todos) {
      const hit = tokenProibido(tk);
      if (hit) return hit;
    }

    if (frasesProibidas.length > 0) {
      const corpo = ` ${simples.join(' ')} `;
      for (const fr of frasesProibidas) if (corpo.includes(` ${fr} `)) return fr;
    }
  }
  return null;
}

module.exports = { recarregarPalavras, acharPalavraProibida, totalEntradas };
