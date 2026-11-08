// Cache em memória da lista de destinos ativos. Fica isolado dos models para que eles possam
// invalidá-lo sem import circular.
const TTL_MS = 15_000; // rede de segurança; a invalidação por hook é o caminho normal

let versao = 0;
let lista = null;
let carregadoEm = 0;
let carregando = null;

function invalidarDestinos() {
  versao++;
  lista = null;
}

/**
 * Devolve a lista em cache ou carrega uma vez (chamadas simultâneas compartilham a mesma consulta).
 * Se houver invalidação durante o carregamento, o resultado é usado mas não guardado.
 */
async function obterDestinos(carregar) {
  if (lista && Date.now() - carregadoEm < TTL_MS) return lista;
  if (carregando) return carregando;

  const versaoInicial = versao;
  carregando = (async () => {
    const resultado = await carregar();
    if (versao === versaoInicial) {
      lista = resultado;
      carregadoEm = Date.now();
    }
    return resultado;
  })().finally(() => { carregando = null; });
  return carregando;
}

module.exports = { invalidarDestinos, obterDestinos };
