const { client } = require('../../lib/client');
const { COOLDOWN_PERFIL } = require('../../config');
const User = require('../../models/User');
const { badgesDoUsuario, badgeAtiva } = require('../../services/badges');
const { totalMensagens, servidorMaisAtivo } = require('../../services/perfilDados');
const { gerarCardPerfil } = require('../../util/render/cardPerfil');
const { emojis } = require('../../util/emojis');
const { extrairId } = require('../../util/ids');
const { log } = require('../../util/logger');

const cooldownPerfil = new Map();

async function resolverAlvo(message, args) {
  const mencionado = message.mentions && message.mentions.users && message.mentions.users.first();
  if (mencionado) {
    log.debug('PERFIL', `Alvo do perfil resolvido por menção: user=${mencionado.id}`);
    return mencionado;
  }

  const id = extrairId(args[0]);
  if (!id) {
    log.debug('PERFIL', `Alvo do perfil é o próprio autor: user=${message.author.id}`);
    return message.author;
  }

  try {
    log.debug('PERFIL', `Buscando usuário do perfil pelo ID: user=${id}`);
    const alvo = await client.users.fetch(id);
    log.debug('PERFIL', `Usuário do perfil encontrado: user=${alvo.id}`);
    return alvo;
  } catch (error) {
    log.debug('PERFIL', `Falha ao buscar usuário do perfil ${id}: ${resumirErro(error)}`);
    return null;
  }
}

function descreverUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_) {
    return 'URL indisponível';
  }
}

function resumirErro(error) {
  return String(error && error.message ? error.message : error)
    .replace(/(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, '$1')
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, '$1[redacted]@');
}

module.exports = {
  name: 'perfil',
  aliases: ['profile'],
  description: 'Mostra o card de perfil seu ou de outro usuário.',

  async execute(message, args) {
    log.debug('PERFIL', `Solicitação recebida: autor=${message.author.id} ${args[0] ? 'alvo informado' : 'próprio perfil'}`);
    const ultimo = cooldownPerfil.get(message.author.id);
    if (ultimo && Date.now() - ultimo < COOLDOWN_PERFIL) {
      await message.reply('<:forbidline:1562606683371339778> Aguarde um pouco antes de pedir outro perfil.');
      return;
    }
    cooldownPerfil.set(message.author.id, Date.now());

    const alvo = await resolverAlvo(message, args);
    if (!alvo) {
      await message.reply(`${emojis.error} Não encontrei esse usuário.`);
      return;
    }

    try {
      log.debug('PERFIL', `Carregando dados para o card: user=${alvo.id}`);
      const [usuario, mensagens, topo] = await Promise.all([
        User.findOne({ userId: String(alvo.id) }).lean(),
        totalMensagens(alvo.id),
        servidorMaisAtivo(alvo.id)
      ]);

      const servidor = topo
        ? client.guilds.get(topo.guildId)?.name ?? 'Servidor desconhecido'
        : 'Sem atividade recente';

      const avatar = alvo.displayAvatarURL({ size: 256, extension: 'png' });
      log.debug('PERFIL', `Avatar selecionado para o card: ${descreverUrl(avatar)}`);
      log.debug('PERFIL', `Dados do card carregados: user=${alvo.id} mensagens=${mensagens} badges=${badgesDoUsuario(usuario).length} servidor=${servidor}`);

      const card = await gerarCardPerfil({
        username: alvo.username,
        displayName: alvo.globalName || alvo.username,
        avatar,
        badges: badgesDoUsuario(usuario),
        selectedBadge: badgeAtiva(usuario),
        mensagens,
        contaCriada: alvo.createdTimestamp,
        servidor,
        servidorMensagens: topo ? topo.total : null
      });
      log.debug('PERFIL', `Card criado para user=${alvo.id}: ${card.length} bytes`);

      await message.reply({ files: [{ name: `perfil-${alvo.id}.png`, data: card }] });
      log.debug('PERFIL', `Card de perfil enviado: user=${alvo.id}`);
    } catch (e) {
      log.debug('PERFIL', `Fluxo do perfil falhou para user=${alvo.id}: ${resumirErro(e)}`);
      log.error('PERFIL', `Falha ao gerar o perfil de ${alvo.id}`, e);
      await message.reply(`${emojis.error} Não consegui gerar o perfil agora.`);
    }
  }
};
