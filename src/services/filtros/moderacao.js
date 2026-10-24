const { EMOJI_BLOQUEIO } = require('../../config');
const ConfigGuild = require('../../models/ConfigGuild');
const { log, descreverContexto } = require('../../util/logger');
const { reagir } = require('../../util/reacoes');
const { temLink } = require('./links');
const { acharPalavraProibida } = require('./palavras');

// O texto é analisado uma vez; cada servidor decide depois se bloqueia.
function analisarConteudo(texto) {
  if (!texto) return { palavra: null, link: false };
  return { palavra: acharPalavraProibida(texto), link: temLink(texto) };
}

async function configDaGuild(guildId) {
  const row = await ConfigGuild.findOne({ guildId: String(guildId) }).lean();
  return {
    filtrarPalavroes: !!(row && row.filtrarPalavroes),
    filtrarLinks: !!(row && row.filtrarLinks)
  };
}

// cfg tanto pode vir de configDaGuild quanto de um destino de listarDestinosAtivos.
function motivoFiltroGuild(analise, cfg) {
  if (cfg.filtrarLinks && analise.link) return 'links não são permitidos neste servidor';
  if (cfg.filtrarPalavroes && analise.palavra) return 'sua mensagem contém uma palavra proibida';
  return null;
}

async function bloquearPorFiltro(message, motivo) {
  log.warn('FILTRO', `${descreverContexto(message)} | ${motivo}`);
  const apagou = await message.delete().then(() => true).catch(() => false);
  if (!apagou) await reagir(message, EMOJI_BLOQUEIO);
  try {
    const aviso = await message.channel.send(`<:forbidline:1562606683371339778> ${message.author}, sua mensagem não foi enviada: **${motivo}**.`);
    setTimeout(() => aviso.delete().catch(() => {}), 6000);
  } catch (e) {
    log.error('FILTRO', 'Erro ao avisar usuário', e);
  }
}

module.exports = { analisarConteudo, configDaGuild, motivoFiltroGuild, bloquearPorFiltro };
