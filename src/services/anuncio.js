const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../lib/client');
const { COR_PADRAO_ANUNCIO } = require('../config');
const Anuncio = require('../models/Anuncio');
const { tratarFalhaDestino, registrarSucessoDestino, listarDestinosAtivos } = require('./destinos');
const { log } = require('../util/logger');
const { marcarEnvio } = require('../util/ratelimit');

const CHAVE = 'global';

function anuncioPadrao() {
  return { ativo: false, titulo: null, descricao: null, cor: COR_PADRAO_ANUNCIO, autor: null, footer: null, intervalo: 0 };
}

let estadoAnuncio = anuncioPadrao();

let contadorAnuncio = 0;

async function carregarAnuncio() {
  const row = await Anuncio.findOne({ chave: CHAVE }).lean();
  estadoAnuncio = row
    ? {
        ativo: !!row.ativo,
        titulo: row.titulo ?? null,
        descricao: row.descricao ?? null,
        cor: row.cor ?? COR_PADRAO_ANUNCIO,
        autor: row.autor ?? null,
        footer: row.footer ?? null,
        intervalo: row.intervalo || 0
      }
    : anuncioPadrao();
}

async function salvarAnuncio() {
  try {
    await Anuncio.findOneAndUpdate(
      { chave: CHAVE },
      { $set: { ...estadoAnuncio, chave: CHAVE } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    log.error('DB', 'Erro ao salvar anúncio', e);
  }
}

async function desativarAnuncio() {
  estadoAnuncio.ativo = false;
  contadorAnuncio = 0;
  await salvarAnuncio();
}

async function agendarAnuncio(anuncio, intervalo) {
  estadoAnuncio = { ativo: true, ...anuncio, intervalo };
  contadorAnuncio = 0;
  await salvarAnuncio();
}

async function importarAnuncio(estado) {
  estadoAnuncio = estado;
  await salvarAnuncio();
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
  const destinos = await listarDestinosAtivos();
  let enviados = 0;
  for (const { guildId, canalId } of destinos) {
    try {
      /** @type {any} */
      const canal = await client.channels.fetch(canalId);
      if (canal) {
        marcarEnvio(canalId);
        await canal.send({ embeds: [embed] });
        enviados++;
        registrarSucessoDestino(guildId);
      } else {
        await tratarFalhaDestino(guildId, new Error('canal não encontrado'));
      }
    } catch (e) {
      log.error('ANUNCIO', `Falha ao enviar para o servidor ${guildId}`, e);
      await tratarFalhaDestino(guildId, e);
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
  iniciarAnuncio: carregarAnuncio,
  desativarAnuncio,
  agendarAnuncio,
  importarAnuncio,
  enviarAnuncioParaTodos,
  contarMensagemParaAnuncio
};
