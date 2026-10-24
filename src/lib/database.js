const Database = require('better-sqlite3');
const { ARQUIVO_DB } = require('../config');

// Toda query usa parâmetros (?), e IDs vindos de comandos passam por ehSnowflake antes: nunca concatenar SQL.

const db = new Database(ARQUIVO_DB);

db.pragma('journal_mode = WAL');

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS canais (
    guild_id TEXT PRIMARY KEY,
    canal_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staffs (
    user_id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS cores_servidores (
    guild_id TEXT PRIMARY KEY,
    cor INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS anuncio (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ativo INTEGER NOT NULL DEFAULT 0,
    titulo TEXT,
    descricao TEXT,
    cor INTEGER NOT NULL,
    autor TEXT,
    footer TEXT,
    intervalo INTEGER NOT NULL DEFAULT 0
  );

  -- Original e cópias de uma mesma retransmissão compartilham o grupo_id.
  CREATE TABLE IF NOT EXISTS mensagens_globais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    canal_id TEXT NOT NULL,
    msg_id TEXT NOT NULL UNIQUE,
    autor_id TEXT NOT NULL,
    criado_em INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_msgs_grupo_guild ON mensagens_globais (grupo_id, guild_id);
  CREATE INDEX IF NOT EXISTS idx_msgs_criado ON mensagens_globais (criado_em);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bloqueados (
    -- 'usuario' | 'servidor'
    tipo TEXT NOT NULL,
    id TEXT NOT NULL,
    motivo TEXT,
    por TEXT,
    criado_em INTEGER NOT NULL,
    PRIMARY KEY (tipo, id)
  );

  CREATE TABLE IF NOT EXISTS palavras_proibidas (
    palavra TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS palavras_liberadas (
    palavra TEXT PRIMARY KEY
  );
`);

// Migração: bancos antigos não têm a coluna.
if (!db.prepare('PRAGMA table_info(canais)').all().some((c) => c.name === 'pausado')) {
  db.exec('ALTER TABLE canais ADD COLUMN pausado INTEGER NOT NULL DEFAULT 0');
}

// Padrão: palavrões e links liberados.
db.exec(`
  CREATE TABLE IF NOT EXISTS config_guilds (
    guild_id TEXT PRIMARY KEY,
    filtrar_palavroes INTEGER NOT NULL DEFAULT 0,
    filtrar_links INTEGER NOT NULL DEFAULT 0
  );
`);

const sql = {
  todosCanais: db.prepare('SELECT guild_id, canal_id FROM canais'),
  contarCanais: db.prepare('SELECT COUNT(*) AS n FROM canais'),
  upsertCanal: db.prepare(`
    INSERT INTO canais (guild_id, canal_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET canal_id = excluded.canal_id
  `),
  canalDoServidor: db.prepare('SELECT canal_id, pausado FROM canais WHERE guild_id = ?'),
  removerCanal: db.prepare('DELETE FROM canais WHERE guild_id = ?'),
  listarCanais: db.prepare('SELECT guild_id, canal_id, pausado FROM canais'),
  setPausado: db.prepare('UPDATE canais SET pausado = ? WHERE guild_id = ?'),
  destinosAtivos: db.prepare(`
    SELECT c.guild_id, c.canal_id,
           COALESCE(g.filtrar_palavroes, 0) AS filtrar_palavroes,
           COALESCE(g.filtrar_links, 0) AS filtrar_links
    FROM canais c
    LEFT JOIN config_guilds g ON g.guild_id = c.guild_id
    WHERE c.pausado = 0
      AND NOT EXISTS (SELECT 1 FROM bloqueados b WHERE b.tipo = 'servidor' AND b.id = c.guild_id)
  `),

  ehStaff: db.prepare('SELECT 1 FROM staffs WHERE user_id = ?'),
  addStaff: db.prepare('INSERT OR IGNORE INTO staffs (user_id) VALUES (?)'),
  delStaff: db.prepare('DELETE FROM staffs WHERE user_id = ?'),
  contarStaffs: db.prepare('SELECT COUNT(*) AS n FROM staffs'),

  getBloqueio: db.prepare('SELECT motivo FROM bloqueados WHERE tipo = ? AND id = ?'),
  addBloqueio: db.prepare('INSERT OR REPLACE INTO bloqueados (tipo, id, motivo, por, criado_em) VALUES (?, ?, ?, ?, ?)'),
  delBloqueio: db.prepare('DELETE FROM bloqueados WHERE tipo = ? AND id = ?'),
  listarBloqueios: db.prepare('SELECT tipo, id, motivo FROM bloqueados ORDER BY criado_em DESC'),

  todasPalavras: db.prepare('SELECT palavra FROM palavras_proibidas ORDER BY palavra'),
  addPalavra: db.prepare('INSERT OR IGNORE INTO palavras_proibidas (palavra) VALUES (?)'),
  delPalavra: db.prepare('DELETE FROM palavras_proibidas WHERE palavra = ?'),
  todasLiberadas: db.prepare('SELECT palavra FROM palavras_liberadas'),
  addLiberada: db.prepare('INSERT OR IGNORE INTO palavras_liberadas (palavra) VALUES (?)'),
  delLiberada: db.prepare('DELETE FROM palavras_liberadas WHERE palavra = ?'),

  corDoServidor: db.prepare('SELECT cor FROM cores_servidores WHERE guild_id = ?'),
  upsertCor: db.prepare(`
    INSERT INTO cores_servidores (guild_id, cor) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET cor = excluded.cor
  `),

  getConfigGuild: db.prepare('SELECT filtrar_palavroes, filtrar_links FROM config_guilds WHERE guild_id = ?'),
  setFiltroPalavroes: db.prepare(`
    INSERT INTO config_guilds (guild_id, filtrar_palavroes) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET filtrar_palavroes = excluded.filtrar_palavroes
  `),
  setFiltroLinks: db.prepare(`
    INSERT INTO config_guilds (guild_id, filtrar_links) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET filtrar_links = excluded.filtrar_links
  `),
  removerConfigGuild: db.prepare('DELETE FROM config_guilds WHERE guild_id = ?'),

  getAnuncio: db.prepare('SELECT * FROM anuncio WHERE id = 1'),
  upsertAnuncio: db.prepare(`
    INSERT INTO anuncio (id, ativo, titulo, descricao, cor, autor, footer, intervalo)
    VALUES (1, @ativo, @titulo, @descricao, @cor, @autor, @footer, @intervalo)
    ON CONFLICT(id) DO UPDATE SET
      ativo = excluded.ativo, titulo = excluded.titulo, descricao = excluded.descricao,
      cor = excluded.cor, autor = excluded.autor, footer = excluded.footer, intervalo = excluded.intervalo
  `),

  inserirMensagem: db.prepare(`
    INSERT OR IGNORE INTO mensagens_globais (grupo_id, guild_id, canal_id, msg_id, autor_id, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  grupoPorMensagem: db.prepare('SELECT grupo_id FROM mensagens_globais WHERE msg_id = ?'),
  mensagemDoGrupoNoServidor: db.prepare(
    'SELECT canal_id, msg_id FROM mensagens_globais WHERE grupo_id = ? AND guild_id = ? LIMIT 1'
  ),
  // A mensagem original do grupo tem msg_id == grupo_id.
  origemDoGrupo: db.prepare(
    'SELECT guild_id, canal_id, autor_id FROM mensagens_globais WHERE grupo_id = ? AND msg_id = ? LIMIT 1'
  ),
  copiasDoGrupo: db.prepare(
    'SELECT guild_id, canal_id, msg_id FROM mensagens_globais WHERE grupo_id = ? AND msg_id != ?'
  ),
  removerGrupo: db.prepare('DELETE FROM mensagens_globais WHERE grupo_id = ?'),
  limparMensagensAntigas: db.prepare('DELETE FROM mensagens_globais WHERE criado_em < ?'),
  contarUsuariosAtivos: db.prepare('SELECT COUNT(DISTINCT autor_id) AS n FROM mensagens_globais')
};

const registrarMensagens = db.transaction((linhas) => {
  for (const l of linhas) {
    sql.inserirMensagem.run(l.grupoId, l.guildId, l.canalId, l.msgId, l.autorId, l.criadoEm);
  }
});

module.exports = { db, sql, registrarMensagens };
