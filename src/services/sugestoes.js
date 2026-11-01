const { Events } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const Contador = require('../models/Contador');
const { reagir } = require('../util/reacoes');
const { log } = require('../util/logger');

const SUGESTOES_GUILD_ID = '1561937517035388928';
const SUGESTOES_CANAL_ID = '1563361108788523008';

const EMOJI_SUGESTAO = [
  'checkboxfill:1566260771569020928',
  '<:checkboxfill:1566260771569020928>'
];

const TIPOS_ACEITOS = [0, 19];
const CHAVE_CONTADOR = `sugestoes:${SUGESTOES_CANAL_ID}`;

async function reservarNumero() {
  const contador = await Contador.findOneAndUpdate(
    { chave: CHAVE_CONTADOR },
    { $inc: { valor: 1 } },
    { upsert: true, new: true }
  );
  return contador.valor;
}

async function devolverNumero(numero) {
  await Contador.findOneAndUpdate(
    { chave: CHAVE_CONTADOR, valor: numero },
    { $inc: { valor: -1 } }
  );
}

function ehMensagemDeSugestao(message) {
  if (!message.author || message.author.bot) return false;

  const canalId = String(message.channelId || (message.channel && message.channel.id) || '');
  const guildId = String(message.guildId || (message.guild && message.guild.id) || '');
  if (canalId !== SUGESTOES_CANAL_ID || guildId !== SUGESTOES_GUILD_ID) return false;

  if (message.type != null && !TIPOS_ACEITOS.includes(Number(message.type))) {
    log.debug('SUGESTOES', `Mensagem ${message.id} ignorada (tipo ${message.type})`);
    return false;
  }
  return true;
}

async function processarSugestao(message) {
  const reagiu = await reagir(message, EMOJI_SUGESTAO);
  if (!reagiu) log.warn('SUGESTOES', `Não consegui reagir à mensagem ${message.id}`);

  const numero = await reservarNumero();
  try {
    await message.startThread({ name: `Discussão da Sugestão #${numero}` });
    log.ok('SUGESTOES', `Tópico #${numero} criado para a mensagem ${message.id}`);
  } catch (e) {
    await devolverNumero(numero).catch(() => {});
    log.error('SUGESTOES', `Falha ao criar o tópico #${numero} (mensagem ${message.id})`, e);
  }
}

function registrarSugestoes() {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!ehMensagemDeSugestao(message)) return;
      await processarSugestao(message);
    } catch (e) {
      log.error('SUGESTOES', `Erro ao processar a mensagem ${message && message.id}`, e);
    }
  });
}

module.exports = { registrarSugestoes };
