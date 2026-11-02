const http = require('http');
const { STATS_PORT, STATS_ORIGEM } = require('../config');
const { obterEstatisticas } = require('./estatisticas');
const { log } = require('../util/logger');

const CABECALHOS = {
  'Access-Control-Allow-Origin': STATS_ORIGEM,
  'Cache-Control': 'public, max-age=30',
  'Content-Type': 'application/json; charset=utf-8'
};

function responder(res, status, corpo) {
  res.writeHead(status, CABECALHOS);
  res.end(JSON.stringify(corpo));
}

async function tratarRequisicao(req, res) {
  const caminho = req.url.split('?')[0];

  if (req.method !== 'GET' || caminho !== '/stats') {
    responder(res, 404, { erro: 'Não encontrado' });
    return;
  }

  try {
    responder(res, 200, await obterEstatisticas());
  } catch (e) {
    log.error('API', 'Falha ao gerar as estatísticas', e);
    responder(res, 500, { erro: 'Estatísticas indisponíveis' });
  }
}

function iniciarApiPublica() {
  if (!STATS_PORT) return null;

  const servidor = http.createServer(tratarRequisicao);
  servidor.listen(STATS_PORT, () => log.ok('API', `Estatísticas em http://localhost:${STATS_PORT}/stats`));
  return servidor;
}

module.exports = { iniciarApiPublica };
