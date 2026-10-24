const PREFIXO = 'g.';

const DONO_ID = '1561676586179100672';

const MUBI_ID = '1561698550566363137';

const COR_EMBED_MUBI = 0xeb0075;

const COOLDOWN_TEMPO = 1000;

const SUPORTE_GUILD_ID = '1561937517035388928';

const SUPORTE_CANAL_BOAS_VINDAS = '1561937517035388931';

const ARQUIVO_DB = 'global.db';

const PASTA_LOGS = 'logs';

const PASTA_LISTAS = 'listas';

// Só usados na migração única para o SQLite.
const ARQUIVO_CONFIG = 'config_global.json';

const ARQUIVO_ANUNCIO = 'anuncio_global.json';

const COR_PADRAO_ANUNCIO = 0x0330EF;

// Passado esse prazo, reply, edição e denúncia deixam de funcionar para a mensagem.
const RETENCAO_MENSAGENS_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_FALHAS_CONSECUTIVAS = 3;

const CANAL_REPORTS = "1563296711999225856";

const COOLDOWN_REPORT = 30_000;

// A 3ª mensagem idêntica seguida já é bloqueada.
const SPAM_LIMITE = 3;

const SPAM_JANELA_MS = 30_000;

const REGEX_CONVITE = /(?:discord\.gg|discord(?:app)?\.com\/invite|fluxer\.gg|(?:web\.)?fluxer\.app\/(?:invite|i))\b[\/\w-]*/i;

// Também pega domínio solto com TLD comum (exemplo.com/algo), não só http(s) e www.
const REGEX_LINK = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gg|io|app|me|xyz|link|ly|tv|dev|info|gl|br)\b(?:\/\S*)?/i;

// Serviço de verificação NSFW (server.js).
const NSFW_URL = process.env.NSFW_URL || 'http://localhost:3000';

// Mesma API_KEY do server.js, quando ela estiver definida.
const NSFW_API_KEY = process.env.NSFW_API_KEY || '';

const NSFW_TIMEOUT_MS = 30_000;

// Serviço fora do ar bloqueia a mídia (fail-closed) em vez de deixá-la passar.
const NSFW_FALHA_BLOQUEIA = true;

const EMOJI_OK = [
  'checkboxcirclefill:1562606683371339777',
  '1562606683371339777',
  '<:checkboxcirclefill:1562606683371339777>',
  '✅'
];

const EMOJI_BLOQUEIO = [
  'errorwarningfill:1563362758655746048',
  '1563362758655746048',
  '<:errorwarningfill:1563362758655746048>',
  '⚠️'
];

module.exports = {
  PREFIXO,
  DONO_ID,
  MUBI_ID,
  COR_EMBED_MUBI,
  COOLDOWN_TEMPO,
  SUPORTE_GUILD_ID,
  SUPORTE_CANAL_BOAS_VINDAS,
  ARQUIVO_DB,
  PASTA_LOGS,
  PASTA_LISTAS,
  ARQUIVO_CONFIG,
  ARQUIVO_ANUNCIO,
  COR_PADRAO_ANUNCIO,
  RETENCAO_MENSAGENS_MS,
  MAX_FALHAS_CONSECUTIVAS,
  CANAL_REPORTS,
  COOLDOWN_REPORT,
  SPAM_LIMITE,
  SPAM_JANELA_MS,
  REGEX_CONVITE,
  REGEX_LINK,
  NSFW_URL,
  NSFW_API_KEY,
  NSFW_TIMEOUT_MS,
  NSFW_FALHA_BLOQUEIA,
  EMOJI_OK,
  EMOJI_BLOQUEIO
};
