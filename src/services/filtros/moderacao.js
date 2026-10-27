const { emojis } = require('../../util/emojis');
const Guild = require('../../models/Guild');
const { log, descreverContexto } = require('../../util/logger');
const { reagir } = require('../../util/reacoes');
const { temLink } = require('./links');
const { acharPalavraProibida } = require('./palavras');

function analisarConteudo(texto) {
  if (!texto) return { palavra: null, link: false };
  return { palavra: acharPalavraProibida(texto), link: temLink(texto) };
}

async function configDaGuild(guildId) {
  const row = await Guild.findOne({ guildId: String(guildId) }).lean();
  return {
    filtrarPalavroes: !!(row && row.filtrarPalavroes),
    filtrarLinks: !!(row && row.filtrarLinks),
    modoMensagem: row && row.modoMensagem === 'cru' ? 'cru' : 'embed',
    mostrarIcone: !row || row.mostrarIcone !== false
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
  if (!apagou) await reagir(message, [emojis.error]);
  try {
    const aviso = await message.channel.send(`<:forbidline:1562606683371339778> ${message.author}, sua mensagem não foi enviada: **${motivo}**.`);
    setTimeout(() => aviso.delete().catch(() => {}), 6000);
  } catch (e) {
    log.error('FILTRO', 'Erro ao avisar usuário', e);
  }
}

module.exports = { analisarConteudo, configDaGuild, motivoFiltroGuild, bloquearPorFiltro };
