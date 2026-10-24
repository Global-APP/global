const { client } = require('./src/lib/client');
const { db } = require('./src/lib/database');
const { registrarEventos } = require('./src/events');
const { carregarComandos } = require('./src/handlers/commandHandler');
const { recarregarPalavras } = require('./src/services/filtros/palavras');
const { iniciarLimpezaMensagens } = require('./src/services/limpeza');
const { log } = require('./src/util/logger');
const { migrarJsonAntigo } = require('./src/services/migracao');

migrarJsonAntigo();
iniciarLimpezaMensagens();
recarregarPalavras();
carregarComandos();
registrarEventos();

process.on('unhandledRejection', (e) => log.error('PROCESSO', 'Promise rejeitada sem tratamento', e));
process.on('uncaughtException', (e) => log.error('PROCESSO', 'Exceção não capturada', e));

function encerrar(sinal) {
  log.info('BOT', `Recebido ${sinal}, encerrando...`);
  try { db.close(); } catch (_) {
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

client.login(TOKEN);
