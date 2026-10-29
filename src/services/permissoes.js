const { PermissionFlags } = require('@fluxerjs/core');
const { DONO_ID } = require('../config');
const User = require('../models/User');
const Bloqueio = require('../models/Bloqueio');
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

module.exports = { membroPodeGerenciarCanais, ehStaffOuDono, estaBloqueado, temPermissaoConfig };
