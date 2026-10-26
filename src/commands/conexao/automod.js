const { configDaGuild } = require('../../services/filtros/moderacao');
const Guild = require('../../models/Guild');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');

module.exports = {
  name: 'automod',
  aliases: ['moderacao'],
  description: 'Escolhe se este servidor filtra palavrões e links.',

  async execute(message, args) {
    const guildId = idDoServidor(message);
    if (!guildId) return;
    const gId = String(guildId);

    const s = (args[0] || '').toLowerCase();
    const alvo = ['palavroes', 'palavrões', 'palavrao', 'palavrão'].includes(s) ? 'palavroes'
      : ['links', 'link'].includes(s) ? 'links' : null;

    const e = (args[1] || '').toLowerCase();
    const ligar = ['on', 'ligar', 'ativar', 'sim'].includes(e) ? true
      : ['off', 'desligar', 'desativar', 'nao', 'não'].includes(e) ? false : null;

    // Sem argumentos válidos só mostra o estado, então não exige permissão.
    if (!alvo || ligar === null) {
      const cfg = await configDaGuild(gId);
      const st = (v) => (v ? '**filtrando**' : '**liberado**');
      await message.reply(
        '<:information2fill:1562606683371339784> **Filtros deste servidor**\n' +
        `• Palavrões: ${st(cfg.filtrarPalavroes)}\n` +
        `• Links: ${st(cfg.filtrarLinks)}\n\n` +
        'Uso: `g.automod palavroes on|off` ou `g.automod links on|off`\n' +
        '-# Padrão: liberados. Com o filtro ativo, este servidor não recebe mensagens com palavrões/links e as mensagens enviadas daqui com isso são apagadas.'
      );
      return;
    }

    if (!(await temPermissaoConfig(message))) {
      await message.reply('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
      return;
    }

    if (alvo === 'palavroes') {
      await Guild.findOneAndUpdate({ guildId: gId }, { filtrarPalavroes: ligar }, { upsert: true, setDefaultsOnInsert: true });
    } else {
      await Guild.findOneAndUpdate({ guildId: gId }, { filtrarLinks: ligar }, { upsert: true, setDefaultsOnInsert: true });
    }

    log.ok('AUTOMOD', `${alvo} ${ligar ? 'filtrado' : 'liberado'} | ${descreverContexto(message)}`);
    const nome = alvo === 'palavroes' ? 'Palavrões' : 'Links';
    await message.reply(`<:checkboxcirclefill:1562606683371339777> ${nome} agora estão **${ligar ? 'sendo filtrados' : 'liberados'}** neste servidor.`);
  }
};
