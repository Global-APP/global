const { PermissionFlags } = require('@fluxerjs/core');
const { DONO_ID } = require('../config');
const User = require('../models/User');
const Bloqueio = require('../models/Bloqueio');
const { log } = require('../util/logger');

const PERMISSOES_ABRIR_CONFIG = Object.freeze(['ViewChannel', 'SendMessages', 'EmbedLinks', 'AddReactions']);
const PERMISSOES_OPERAR_CONFIG = Object.freeze(['ManageMessages']);
const NOMES_PERMISSOES = Object.freeze({
  ViewChannel: 'Ver canal',
  SendMessages: 'Enviar mensagens',
  EmbedLinks: 'Incorporar links',
  AddReactions: 'Adicionar reações',
  ManageMessages: 'Gerenciar mensagens',
  ManageWebhooks: 'Gerenciar webhooks'
});

async function permissoesBotFaltando(message, client, requeridas = [], guildFallback = null, guildIdFallback = null) {
  const channel = message.channel || (typeof message.resolveChannel === 'function' ? await message.resolveChannel() : null);
  if (!channel) throw new Error('Canal indisponível para verificar permissões do bot');

  let guild = guildFallback || message.guild || (message.channel && message.channel.guild) || null;
  if (!guild && typeof message.resolveGuild === 'function') {
    try {
      guild = await message.resolveGuild();
    } catch (_) {
      // Usa os IDs/cache do cliente como fallback para payloads de reações.
    }
  }
  const guildId = String(message.guildId || channel.guildId || guildIdFallback || '');
  if (!guild && guildId && client.guilds) {
    guild = client.guilds.get(guildId);
    if (!guild && typeof client.guilds.resolve === 'function') {
      guild = await client.guilds.resolve(guildId);
    }
  }
  if (!guild) throw new Error('Servidor indisponível para verificar permissões do bot');

  const member = guild.members.me || await guild.members.fetchMe();
  const permissions = member.permissionsIn(channel);
  if (permissions.has(PermissionFlags.Administrator)) return [];

  return requeridas
    .filter((nome) => !permissions.has(PermissionFlags[nome]))
    .map((nome) => NOMES_PERMISSOES[nome] || nome);
}

async function membroPodeGerenciarCanais(message) {
  try {
    const guild = await message.resolveGuild();
    if (!guild) return false;
    const member = guild.members.get(message.author.id) ?? await guild.fetchMember(message.author.id);
    const perms = member ? member.permissions : null;
    if (!perms) return false;
    return perms.has(PermissionFlags.ManageChannels) || perms.has(PermissionFlags.Administrator);
  } catch (e) {
    log.error('PERMISSAO', 'Erro ao checar permissões', e);
    return false;
  }
}

async function ehStaffOuDono(userId) {
  const id = String(userId);
  if (id === DONO_ID) return true;
  return !!(await User.exists({ userId: id, staff: true }));
}

async function estaBloqueado(tipo, id) {
  return !!(await Bloqueio.exists({ tipo, id: String(id) }));
}

async function temPermissaoConfig(message) {
  if (message.author.id === DONO_ID) return true;
  return membroPodeGerenciarCanais(message);
}

module.exports = {
  membroPodeGerenciarCanais,
  permissoesBotFaltando,
  PERMISSOES_ABRIR_CONFIG,
  PERMISSOES_OPERAR_CONFIG,
  NOMES_PERMISSOES,
  ehStaffOuDono,
  estaBloqueado,
  temPermissaoConfig
};
