const fs = require('fs');
const path = require('path');
const { PREFIXO } = require('../config');
const { log, descreverContexto } = require('../util/logger');

const PASTA_COMANDOS = path.join(__dirname, '..', 'commands');

const comandos = new Map();
const rotas = new Map();

function listarArquivos(pasta) {
  const arquivos = [];
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    if (entrada.name.startsWith('_') || entrada.name.startsWith('.')) continue;
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) arquivos.push(...listarArquivos(caminho));
    else if (entrada.isFile() && entrada.name.endsWith('.js')) arquivos.push(caminho);
  }
  return arquivos.sort();
}

function validar(cmd) {
  if (!cmd || typeof cmd !== 'object') return 'não exporta um objeto';
  if (typeof cmd.name !== 'string' || !cmd.name.trim()) return 'falta "name" (string)';
  if (typeof cmd.execute !== 'function') return 'falta "execute" (função)';
  if (cmd.aliases !== undefined && !Array.isArray(cmd.aliases)) return '"aliases" precisa ser um array';
  return null;
}

function carregarComandos() {
  comandos.clear();
  rotas.clear();

  for (const arquivo of listarArquivos(PASTA_COMANDOS)) {
    const rel = path.relative(PASTA_COMANDOS, arquivo);

    let cmd;
    try {
      cmd = require(arquivo);
    } catch (e) {
      log.error('CMD', `Falha ao carregar ${rel}`, e);
      continue;
    }

    const problema = validar(cmd);
    if (problema) {
      log.warn('CMD', `${rel} ignorado: ${problema}.`);
      continue;
    }

    const nomes = [...new Set([cmd.name, ...(cmd.aliases || [])].map((n) => String(n).toLowerCase()))];
    const conflito = nomes.find((n) => rotas.has(n));
    if (conflito) {
      log.error('CMD', `${rel} ignorado: "${conflito}" já pertence ao comando "${rotas.get(conflito).name}".`);
      continue;
    }

    const pasta = path.dirname(rel);
    const registrado = {
      ...cmd,
      name: nomes[0],
      aliases: nomes.slice(1),
      categoria: pasta === '.' ? 'geral' : pasta.split(path.sep)[0],
      arquivo: rel
    };

    comandos.set(registrado.name, registrado);
    for (const n of nomes) rotas.set(n, registrado);
  }

  log.ok('CMD', `${comandos.size} comando(s) carregado(s) (${rotas.size} nomes/aliases).`);
  return comandos;
}

function logComando(message, nome) {
  log.info('CMD', `${PREFIXO}${nome} | ${descreverContexto(message)} | canal ${message.channel ? message.channel.id : '?'}`);
}

async function tratarComando(message, conteudo) {
  if (!conteudo.startsWith(PREFIXO)) return false;

  const partes = conteudo.slice(PREFIXO.length).trim().split(/\s+/);
  const nome = partes[0] ? partes[0].toLowerCase() : '';
  const cmd = rotas.get(nome);
  if (!cmd) return false;

  logComando(message, nome);
  try {
    await cmd.execute(message, partes.slice(1));
  } catch (e) {
    log.error('CMD', `Erro ao executar ${PREFIXO}${cmd.name} (${cmd.arquivo})`, e);
  }
  return true;
}

module.exports = { carregarComandos, tratarComando, comandos };
