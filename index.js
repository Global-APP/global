const { client } = require('./src/lib/client');
const { conectarBanco, desconectarBanco } = require('./src/lib/database');
const { executarMigracoes } = require('./migrations');
const { registrarEventos } = require('./src/events');
const { carregarComandos } = require('./src/handlers/commandHandler');
const { recarregarPalavras } = require('./src/services/filtros/palavras');
const { iniciarLimpezaMensagens } = require('./src/services/limpeza');
const { iniciarAnuncio } = require('./src/services/anuncio');
const { registrarSugestoes } = require('./src/services/sugestoes');
const { log } = require('./src/util/logger');

let pararDiscord = null;

async function iniciarDiscord() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    log.info('DISCORD', 'DISCORD_TOKEN não definido, a ponte com o Discord está desativada.');
    return;
  }

  try {
    const discord = require('./src/plataformas/discord');
    pararDiscord = discord.encerrarDiscord;
    await discord.iniciarDiscord(token);
  } catch (e) {
    log.error('DISCORD', 'Falha ao iniciar o bot do Discord, o Fluxer continua funcionando', e);
  }
}

async function main(token) {
  await conectarBanco();
  await executarMigracoes();
  await iniciarAnuncio();
  await recarregarPalavras();

  iniciarLimpezaMensagens();
  carregarComandos();
  registrarEventos();
  registrarSugestoes();

  await client.login(token);
  await iniciarDiscord();
}

process.on('unhandledRejection', (e) => log.error('PROCESSO', 'Promise rejeitada sem tratamento', e));
process.on('uncaughtException', (e) => log.error('PROCESSO', 'Exceção não capturada', e));

async function encerrar(sinal) {
  log.info('BOT', `Recebido ${sinal}, encerrando...`);
  if (pararDiscord) await pararDiscord();
  try {
    await desconectarBanco();
  } catch (_) {
    // Já estamos saindo.
  }
  process.exit(0);
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  log.error('BOT', 'Variável de ambiente TOKEN não definida. Defina TOKEN antes de iniciar o bot.');
  process.exit(1);
}

main(TOKEN).catch((e) => {
  log.error('BOT', 'Falha ao iniciar o bot', e);
  process.exit(1);
});
