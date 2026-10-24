const { configDaGuild } = require('../../services/filtros/moderacao');
const { sql } = require('../../lib/database');
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
      const cfg = configDaGuild(gId);
      const st = (v) => (v ? '**filtrando**' : '**liberado**');
      await message.channel.send(
        '<:information2fill:1562606683371339784> **Filtros deste servidor**\n' +
        `• Palavrões: ${st(cfg.filtrar_palavroes)}\n` +
        `• Links: ${st(cfg.filtrar_links)}\n\n` +
        'Uso: `g.automod palavroes on|off` ou `g.automod links on|off`\n' +
        '-# Padrão: liberados. Com o filtro ativo, este servidor não recebe mensagens com palavrões/links e as mensagens enviadas daqui com isso são apagadas.'
      );
      return;
    }

    if (!(await temPermissaoConfig(message))) {
      await message.channel.send('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
      return;
    }

    const valor = ligar ? 1 : 0;
    if (alvo === 'palavroes') sql.setFiltroPalavroes.run(gId, valor);
    else sql.setFiltroLinks.run(gId, valor);

    log.ok('AUTOMOD', `${alvo} ${ligar ? 'filtrado' : 'liberado'} | ${descreverContexto(message)}`);
    const nome = alvo === 'palavroes' ? 'Palavrões' : 'Links';
    await message.channel.send(`<:checkboxcirclefill:1562606683371339777> ${nome} agora estão **${ligar ? 'sendo filtrados' : 'liberados'}** neste servidor.`);
  }
};
