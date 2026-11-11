const TTL_MS = 15_000; // rede de segurança; a invalidação por hook é o caminho normal

let versao = 0;
let lista = null;
let carregadoEm = 0;
let carregando = null;

function invalidarDestinos() {
  versao++;
  lista = null;
}

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
