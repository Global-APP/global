const { PermissionFlags } = require('@fluxerjs/core');
const { DONO_ID } = require('../config');
const { sql } = require('../lib/database');
const { log } = require('../util/logger');

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

function ehStaffOuDono(userId) {
  const id = String(userId);
  return id === DONO_ID || !!sql.ehStaff.get(id);
}

function estaBloqueado(tipo, id) {
  return !!sql.getBloqueio.get(tipo, String(id));
}

async function temPermissaoConfig(message) {
  if (message.author.id === DONO_ID) return true;
  return membroPodeGerenciarCanais(message);
}

module.exports = { membroPodeGerenciarCanais, ehStaffOuDono, estaBloqueado, temPermissaoConfig };
