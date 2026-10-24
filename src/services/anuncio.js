const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const { COR_PADRAO_ANUNCIO } = require('../config');
const { sql } = require('../lib/database');
const { tratarFalhaDestino, registrarSucessoDestino } = require('./destinos');
const { log } = require('../util/logger');
const { marcarEnvio } = require('../util/ratelimit');

function carregarAnuncio() {
  const row = sql.getAnuncio.get();
  if (!row) {
    return { ativo: false, titulo: null, descricao: null, cor: COR_PADRAO_ANUNCIO, autor: null, footer: null, intervalo: 0 };
  }
  return { ...row, ativo: row.ativo === 1 };
}

let estadoAnuncio = carregarAnuncio();

let contadorAnuncio = 0;

function salvarAnuncio() {
  try {
    sql.upsertAnuncio.run({
      ativo: estadoAnuncio.ativo ? 1 : 0,
      titulo: estadoAnuncio.titulo ?? null,
      descricao: estadoAnuncio.descricao ?? null,
      cor: estadoAnuncio.cor ?? COR_PADRAO_ANUNCIO,
      autor: estadoAnuncio.autor ?? null,
      footer: estadoAnuncio.footer ?? null,
      intervalo: estadoAnuncio.intervalo || 0
    });
  } catch (e) {
    log.error('DB', 'Erro ao salvar anúncio', e);
  }
}

function desativarAnuncio() {
  estadoAnuncio.ativo = false;
  contadorAnuncio = 0;
  salvarAnuncio();
}

function agendarAnuncio(anuncio, intervalo) {
  estadoAnuncio = { ativo: true, ...anuncio, intervalo };
  contadorAnuncio = 0;
  salvarAnuncio();
}

function importarAnuncio(estado) {
  estadoAnuncio = estado;
  salvarAnuncio();
}

function montarEmbedAnuncio(a) {
  const embed = new EmbedBuilder().setColor(a.cor);
  if (a.titulo) embed.setTitle(a.titulo);
  if (a.descricao) embed.setDescription(a.descricao);
  if (a.autor) embed.setAuthor({ name: a.autor });
  if (a.footer) embed.setFooter({ text: a.footer });
  return embed;
}

async function enviarAnuncioParaTodos(anuncio) {
  const embed = montarEmbedAnuncio(anuncio);
  const destinos = sql.destinosAtivos.all();
  let enviados = 0;
  for (const { guild_id: gId, canal_id: cId } of destinos) {
    try {
      const canal = await client.channels.fetch(cId);
      if (canal) {
        marcarEnvio(cId);
        await canal.send({ embeds: [embed] });
        enviados++;
        registrarSucessoDestino(gId);
      } else {
        tratarFalhaDestino(gId, new Error('canal não encontrado'));
      }
    } catch (e) {
      log.error('ANUNCIO', `Falha ao enviar para o servidor ${gId}`, e);
      tratarFalhaDestino(gId, e);
    }
  }
  log.info('ANUNCIO', `Anúncio enviado para ${enviados}/${destinos.length} servidor(es).`);
  return enviados;
}

async function contarMensagemParaAnuncio() {
  if (!estadoAnuncio.ativo || !estadoAnuncio.intervalo) return;
  contadorAnuncio++;
  if (contadorAnuncio >= estadoAnuncio.intervalo) {
    contadorAnuncio = 0;
    await enviarAnuncioParaTodos(estadoAnuncio);
  }
}

module.exports = {
  desativarAnuncio,
  agendarAnuncio,
  importarAnuncio,
  enviarAnuncioParaTodos,
  contarMensagemParaAnuncio
};
