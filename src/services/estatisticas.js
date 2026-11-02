const { client } = require('../lib/client');
const Guild = require('../models/Guild');
const Bloqueio = require('../models/Bloqueio');
const MensagemGlobal = require('../models/MensagemGlobal');
const { SOMENTE_ORIGEM } = require('./perfilDados');
const { obterIconeServidor } = require('./chat/mensagem');

const FUSO_HORARIO = 'America/Sao_Paulo';
const DESLOCAMENTO_FUSO = '-03:00';
const TAMANHO_RANKING = 3;
const VALIDADE_CACHE_MS = 60_000;

let cache = { dados: null, geradoEm: 0 };

function inicioDoDia() {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_HORARIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  return new Date(`${hoje}T00:00:00${DESLOCAMENTO_FUSO}`).getTime();
}

async function rankingPor(campo, excluidos) {
  return MensagemGlobal.aggregate([
    { $match: { ...SOMENTE_ORIGEM, [campo]: { $nin: excluidos } } },
    { $group: { _id: `$${campo}`, mensagens: { $sum: 1 } } },
    { $sort: { mensagens: -1, _id: 1 } },
    { $limit: TAMANHO_RANKING }
  ]);
}

async function descreverUsuario({ _id, mensagens }) {
  try {
    const usuario = await client.users.fetch(_id);
    return {
      nome: usuario.globalName || usuario.username,
      avatar: usuario.displayAvatarURL({ size: 128, extension: 'png' }),
      mensagens
    };
  } catch {
    return { nome: 'Usuário desconhecido', avatar: null, mensagens };
  }
}

function descreverServidor({ _id, mensagens }) {
  const servidor = client.guilds.get(_id);

  return {
    nome: servidor?.name ?? 'Servidor desconhecido',
    icone: obterIconeServidor(servidor),
    mensagens
  };
}

async function contarUsuariosAtivos() {
  const [resultado] = await MensagemGlobal.aggregate([
    { $match: SOMENTE_ORIGEM },
    { $group: { _id: '$autorId' } },
    { $count: 'total' }
  ]);

  return resultado?.total ?? 0;
}

async function gerarEstatisticas() {
  const [usuariosBloqueados, servidoresBloqueados] = await Promise.all([
    Bloqueio.find({ tipo: 'usuario' }).distinct('id'),
    Bloqueio.find({ tipo: 'servidor' }).distinct('id')
  ]);

  const [mensagensHoje, servidores, usuariosAtivos, topUsuarios, topServidores] = await Promise.all([
    MensagemGlobal.countDocuments({ ...SOMENTE_ORIGEM, criadoEm: { $gte: inicioDoDia() } }),
    Guild.countDocuments({ canalId: { $ne: null } }),
    contarUsuariosAtivos(),
    rankingPor('autorId', usuariosBloqueados),
    rankingPor('guildId', servidoresBloqueados)
  ]);

  return {
    atualizadoEm: Date.now(),
    mensagensHoje,
    servidores,
    usuariosAtivos,
    topUsuarios: await Promise.all(topUsuarios.map(descreverUsuario)),
    topServidores: topServidores.map(descreverServidor)
  };
}

async function obterEstatisticas() {
  if (cache.dados && Date.now() - cache.geradoEm < VALIDADE_CACHE_MS) return cache.dados;

  const dados = await gerarEstatisticas();
  cache = { dados, geradoEm: Date.now() };
  return dados;
}

module.exports = { obterEstatisticas };
