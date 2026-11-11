const Module = require('node:module');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../../src');

const setIntervalReal = global.setInterval;
global.setInterval = (fn, ms, ...a) => {
  const t = setIntervalReal(fn, ms, ...a);
  if (typeof t.unref === 'function') t.unref();
  return t;
};

const dados = new Map();
const consultas = new Map();

function contar(nome, metodo) {
  const k = `${nome}.${metodo}`;
  consultas.set(k, (consultas.get(k) || 0) + 1);
}

function casa(doc, filtro = {}) {
  for (const [k, v] of Object.entries(filtro)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('$ne' in v && doc[k] === v.$ne) return false;
      if ('$in' in v && !v.$in.includes(doc[k])) return false;
      if ('$lt' in v && !(doc[k] < v.$lt)) return false;
    } else if (doc[k] !== v) return false;
  }
  return true;
}

class Consulta {
  constructor(exec) { this.exec = exec; }
  lean() { return this; }
  select() { return this; }
  distinct(campo) {
    const antes = this.exec;
    this.exec = () => [...new Set(antes().map((d) => d[campo]))];
    return this;
  }
  then(ok, err) { return Promise.resolve().then(() => this.exec()).then(ok, err); }
}

class Schema {
  constructor() { this.posts = []; }
  index() {}
  post(nomes, fn) { this.posts.push({ nomes: [].concat(nomes), fn }); }
}

function criarModel(nome, schema) {
  if (!dados.has(nome)) dados.set(nome, []);
  const docs = () => dados.get(nome);
  const disparar = (op) => schema.posts.forEach((p) => { if (p.nomes.includes(op)) p.fn(); });
  const aplicar = (doc, up) => Object.assign(doc, up.$set || up.$setOnInsert || up);

  return {
    find: (f) => { contar(nome, 'find'); return new Consulta(() => docs().filter((d) => casa(d, f)).map((d) => ({ ...d }))); },
    findOne: (f) => { contar(nome, 'findOne'); return new Consulta(() => { const d = docs().find((x) => casa(x, f)); return d ? { ...d } : null; }); },
    exists: (f) => { contar(nome, 'exists'); return new Consulta(() => (docs().some((d) => casa(d, f)) ? { _id: 1 } : null)); },
    countDocuments: (f) => new Consulta(() => docs().filter((d) => casa(d, f)).length),
    async updateOne(f, up) {
      const d = docs().find((x) => casa(x, f));
      if (d) Object.assign(d, up.$set || up);
      disparar('updateOne');
      return { matchedCount: d ? 1 : 0 };
    },
    async findOneAndUpdate(f, up, opts = {}) {
      let d = docs().find((x) => casa(x, f));
      if (!d && opts.upsert) { d = { ...f }; docs().push(d); }
      if (d) Object.assign(d, up.$set || up);
      disparar('findOneAndUpdate');
      return d;
    },
    async deleteMany(f) {
      const antes = docs().length;
      dados.set(nome, docs().filter((d) => !casa(d, f)));
      disparar('deleteMany');
      return { deletedCount: antes - docs().length };
    },
    async bulkWrite(ops) {
      for (const { updateOne: u } of ops) {
        let d = docs().find((x) => casa(x, u.filter));
        if (!d && u.upsert) { d = {}; docs().push(d); aplicar(d, u.update); }
      }
      disparar('bulkWrite');
    }
  };
}

const mongooseFalso = { Schema, model: (nome, schema) => criarModel(nome, schema), connect: async () => {}, connection: {} };

class EmbedBuilder {
  constructor() { this.data = {}; }
  setDescription(v) { this.data.description = v; return this; }
  setColor(v) { this.data.color = v; return this; }
  setAuthor(v) { this.data.author = v; return this; }
  setFooter(v) { this.data.footer = v; return this; }
  setImage(v) { this.data.image = v; return this; }
  setTitle(v) { this.data.title = v; return this; }
  toJSON() { return { ...this.data }; }
}

const coreFalso = {
  EmbedBuilder,
  PermissionFlags: {},
  Events: {},
  Client: class {},
  Webhook: {
    fromToken: (_client, id, token, opcoes) => apiAtual.webhookFalso(id, token, opcoes.channelId)
  },
  Routes: { channelMessage: (c, m) => `/channels/${c}/messages/${m}`, channelMessages: (c) => `/channels/${c}/messages` }
};

function criarApi({ globalPorSegundo = 50, porCanal = { limite: 30, janelaMs: 60_000 } } = {}) {
  const api = {
    config: { globalPorSegundo, porCanal },
    mensagens: new Map(),
    envios: new Map(),
    falhasDelete: new Map(),
    rate429: 0,
    aceitos: 0,
    globalJanela: [],
    canalJanela: new Map(),
    proximoId: 1,
    cargaExterna: 0,
    webhooks: new Map(),
    criacaoWebhookFalha: false,
    webhooksCriados: 0
  };

  function erro429(esperaMs, global) {
    api.rate429++;
    const e = new Error('Rate limited');
    e.name = 'RateLimitError';
    e.retryAfter = esperaMs / 1000;
    e.global = global;
    return e;
  }

  function consumir(canalId) {
    const agora = Date.now();
    api.globalJanela = api.globalJanela.filter((t) => agora - t < 1000);
    const total = api.globalJanela.length + api.cargaExterna;
    if (total >= api.config.globalPorSegundo) {
      throw erro429(Math.max(50, 1000 - (agora - (api.globalJanela[0] ?? agora))), true);
    }
    const janela = (api.canalJanela.get(canalId) || []).filter((t) => agora - t < api.config.porCanal.janelaMs);
    if (janela.length >= api.config.porCanal.limite) {
      throw erro429(Math.max(50, api.config.porCanal.janelaMs - (agora - janela[0])), false);
    }
    janela.push(agora);
    api.canalJanela.set(canalId, janela);
    api.globalJanela.push(agora);
    api.aceitos++;
  }

  function webhookFalso(id, token, canalId) {
    const valido = () => {
      const w = api.webhooks.get(String(id));
      if (!w || w.token !== token) { const e = new Error('Unknown Webhook'); e.statusCode = 404; throw e; }
    };
    return {
      id: String(id),
      token,
      async send(opcoes) {
        await latencia();
        valido();
        consumir(String(canalId));
        const msgId = `w${api.proximoId++}`;
        api.mensagens.set(`${canalId}:${msgId}`, { canalId: String(canalId), id: msgId, opcoes, webhookId: String(id) });
        api.envios.set(String(canalId), (api.envios.get(String(canalId)) || 0) + 1);
        return { id: msgId };
      },
      async editMessage(msgId, corpo) {
        await latencia();
        valido();
        consumir(String(canalId));
        const m = api.mensagens.get(`${canalId}:${msgId}`);
        if (!m) { const e = new Error('Unknown Message'); e.statusCode = 404; throw e; }
        m.opcoes = { ...m.opcoes, ...corpo };
        m.editadaVezes = (m.editadaVezes || 0) + 1;
      },
      async deleteMessage(msgId) {
        await latencia();
        valido();
        consumir(String(canalId));
        if (!api.mensagens.delete(`${canalId}:${msgId}`)) { const e = new Error('Unknown Message'); e.statusCode = 404; throw e; }
      },
      async delete() { api.webhooks.delete(String(id)); }
    };
  }

  const latencia = () => new Promise((r) => setTimeout(r, 2 + Math.random() * 6));

  api.cliente = {
    user: { id: 'bot-id', username: 'Global' },
    guilds: { get: (id) => ({ id, name: `Servidor ${id}` }) },
    on() {},
    channels: {
      async send(canalId, opcoes) {
        await latencia();
        consumir(String(canalId));
        const id = `m${api.proximoId++}`;
        api.mensagens.set(`${canalId}:${id}`, { canalId: String(canalId), id, opcoes });
        api.envios.set(String(canalId), (api.envios.get(String(canalId)) || 0) + 1);
        return { id };
      },
      async fetch(canalId) {
        return {
          id: canalId,
          async createWebhook() {
            if (api.criacaoWebhookFalha) { const e = new Error('Missing Permissions'); e.statusCode = 403; throw e; }
            const id = `wh${++api.webhooksCriados}`;
            const token = `tok-${id}`;
            api.webhooks.set(id, { token, canalId: String(canalId) });
            return webhookFalso(id, token, canalId);
          }, send: (opcoes) => api.cliente.channels.send(canalId, opcoes), messages: {
          fetch: async (msgId) => {
            await latencia();
            if (!api.mensagens.has(`${canalId}:${msgId}`)) { const e = new Error('Unknown Message'); e.statusCode = 404; throw e; }
            return {
              id: msgId,
              delete: () => api.cliente.rest.delete(`/channels/${canalId}/messages/${msgId}`),
              edit: (o) => api.cliente.rest.patch(`/channels/${canalId}/messages/${msgId}`, { body: { embeds: o.embeds.map((e) => e.toJSON()) } })
            };
          }
        } };
      }
    },
    rest: {
      async patch(rota, { body }) {
        await latencia();
        const [, , canalId, , msgId] = rota.split('/');
        consumir(canalId);
        const m = api.mensagens.get(`${canalId}:${msgId}`);
        if (!m) { const e = new Error('Unknown Message'); e.statusCode = 404; throw e; }
        m.embeds = body.embeds;
        m.editadaVezes = (m.editadaVezes || 0) + 1;
        return m;
      },
      async delete(rota) {
        await latencia();
        const [, , canalId, , msgId] = rota.split('/');
        const status = api.falhasDelete.get(msgId);
        if (status) { const e = new Error(`HTTP ${status}`); e.statusCode = status; throw e; }
        consumir(canalId);
        if (!api.mensagens.delete(`${canalId}:${msgId}`)) { const e = new Error('Unknown Message'); e.statusCode = 404; throw e; }
      }
    }
  };

  api.webhookFalso = webhookFalso;
  api.copiasVivas = () => [...api.mensagens.values()];
  return api;
}

let apiAtual = null;
const clienteEstavel = {
  user: { id: 'bot-id', username: 'Global' },
  guilds: { get: (id) => ({ id, name: `Servidor ${id}` }) },
  on() {},
  channels: {
    send: (...a) => apiAtual.cliente.channels.send(...a),
    fetch: (...a) => apiAtual.cliente.channels.fetch(...a)
  },
  rest: {
    patch: (...a) => apiAtual.cliente.rest.patch(...a),
    delete: (...a) => apiAtual.cliente.rest.delete(...a)
  }
};
const carregarOriginal = Module._load;
Module._load = function (request, parent, ...resto) {
  if (request === 'mongoose') return mongooseFalso;
  if (request === '@fluxerjs/core') return coreFalso;
  let resolvido = null;
  try { resolvido = Module._resolveFilename(request, parent); } catch (_) { /* módulo de runtime */ }
  if (resolvido === path.join(SRC, 'lib', 'client.js')) return { client: clienteEstavel };
  return carregarOriginal.call(this, request, parent, ...resto);
};

function instalarApi(api) { apiAtual = api; }

function guild(idx) { return { guildId: `g${idx}`, canalId: `c${idx}` }; }

function popularDestinos(n) {
  dados.set('Guild', []);
  dados.set('MensagemGlobal', []);
  dados.set('Bloqueio', []);
  dados.set('User', []);
  const g = dados.get('Guild');
  for (let i = 1; i <= n; i++) {
    g.push({ ...guild(i), pausado: false, filtrarPalavroes: false, filtrarLinks: false, mostrarIcone: false, cor: null });
  }
}

let seqMsg = 1000;
function mensagemDe({ guildIdx, autor, conteudo, respondendo = null, anexos = { size: 0 }, figurinhas = [] }) {
  const id = String(seqMsg++);
  const g = guild(guildIdx);
  return {
    id,
    content: conteudo ?? `mensagem de teste ${id}`,
    guildId: g.guildId,
    guild: { id: g.guildId, name: `Servidor ${g.guildId}` },
    channelId: g.canalId,
    channel: { id: g.canalId, send: async () => ({ delete: async () => {} }) },
    author: {
      id: autor ?? `u${id}`, bot: false, username: `user${id}`, discriminator: '0001',
      displayName: `User ${id}`, displayAvatarURL: () => null
    },
    messageReference: respondendo ? { messageId: respondendo } : null,
    attachments: anexos,
    stickers: figurinhas,
    react: async () => {},
    delete: async () => {}
  };
}

module.exports = { criarApi, instalarApi, popularDestinos, mensagemDe, dados, consultas, guild, EmbedBuilder };
