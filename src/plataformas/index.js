const adaptadores = new Map();

function registrarPlataforma(adaptador) {
  adaptadores.set(adaptador.nome, adaptador);
  return adaptador;
}

function obterPlataforma(nome) {
  return adaptadores.get(nome || 'fluxer') || null;
}

function plataformaDaMensagem(mensagem) {
  return (mensagem && mensagem.plataforma) || 'fluxer';
}

function listarPlataformas() {
  return [...adaptadores.values()];
}

function nomeDoServidor(guildId, preferida) {
  const ordem = [obterPlataforma(preferida), ...listarPlataformas()].filter(Boolean);
  for (const adaptador of ordem) {
    const nome = adaptador.nomeServidor(guildId);
    if (nome) return nome;
  }
  return null;
}

function apagarCopia(copia, credenciais) {
  const adaptador = obterPlataforma(copia.plataforma);
  if (!adaptador) return Promise.resolve('ausente');
  return adaptador.apagarCopia(copia, credenciais);
}

registrarPlataforma(require('./fluxer'));

module.exports = {
  registrarPlataforma,
  obterPlataforma,
  plataformaDaMensagem,
  listarPlataformas,
  nomeDoServidor,
  apagarCopia
};
