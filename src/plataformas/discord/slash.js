const { ApplicationCommandOptionType } = require('discord.js');
const { PREFIXO } = require('../../config');
const { COMANDOS_SLASH } = require('../../util/conversao');
const { log, errMsg } = require('../../util/logger');
const { comandos, tratarComando } = require('../../handlers/commandHandler');
const { criarInteracaoCompat } = require('./compat');

const CATEGORIAS = ['conexao', 'geral'];

function definicoes() {
  return [...COMANDOS_SLASH]
    .filter((nome) => comandos.has(nome))
    .map((nome) => ({
      name: nome,
      description: String(comandos.get(nome).description || nome).slice(0, 100),
      options: [{
        type: ApplicationCommandOptionType.String,
        name: 'argumentos',
        description: 'Argumentos opcionais do comando'
      }]
    }));
}

async function registrarSlash(client) {
  const lista = definicoes();
  await client.application.commands.set(lista);
  log.ok('DISCORD', `${lista.length} comando(s) slash registrado(s).`);
}

async function tratarComandoSlash(interacao) {
  const argumentos = interacao.options.getString('argumentos') || '';
  const compat = criarInteracaoCompat(interacao, argumentos);
  const conteudo = `${PREFIXO}${interacao.commandName} ${argumentos}`.trim();

  await interacao.deferReply();
  const tratado = await tratarComando(compat, conteudo, CATEGORIAS);
  if (!compat.jaRespondeu()) {
    await interacao.deleteReply().catch(() => {});
    if (!tratado) log.warn('DISCORD', `Slash /${interacao.commandName} sem comando correspondente`);
  }
}

async function tratarInteracao(interacao) {
  try {
    if (interacao.isChatInputCommand()) return await tratarComandoSlash(interacao);
  } catch (e) {
    log.error('DISCORD', `Erro ao tratar interação: ${errMsg(e)}`, e);
  }
  return false;
}

module.exports = { registrarSlash, tratarInteracao, definicoes };
