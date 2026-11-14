const { PREFIXO } = require('../../config');
const Guild = require('../../models/Guild');
const { idDoServidor } = require('../../util/ids');
const { log, errMsg, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');
const { embedPainel, reacoesDoPainel } = require('../../services/configPainel');

const VALORES_LIGAR = ['on', 'ligar', 'ativar', 'sim', 'true'];
const VALORES_DESLIGAR = ['off', 'desligar', 'desativar', 'nao', 'não', 'false'];

module.exports = {
  name: 'config',
  aliases: ['configurar', 'configurações'],
  description: 'Abre o painel de configurações da conexão global.',

  async execute(message, args = []) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (!(await temPermissaoConfig(message))) {
      log.warn('CONFIG', `Permissão negada para ${descreverContexto(message)}`);
      await message.reply('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
      return;
    }

    const gId = String(guildId);
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'servericon') return this.subServerIcon(message, gId, args[1]);

    if (sub) {
      await message.reply(
        '<:closecirclefill:1562606683371339786> Subcomando inválido.\n' +
        `-# Use \`${PREFIXO}config\` para abrir o painel ou \`${PREFIXO}config servericon [on|off]\` para o ícone do servidor.`
      );
      return;
    }

    return this.abrirPainel(message, gId);
  },

  async abrirPainel(message, gId) {
    let painel = null;
    try {
      const atual = await Guild.findOne({ guildId: gId }).lean();
      painel = await message.channel.send({
        embeds: [embedPainel(atual || {})],
        allowedMentions: { parse: [] }
      });

      await Guild.findOneAndUpdate(
        { guildId: gId },
        { $set: { configPainelMessageId: String(painel.id), configPainelUserId: String(message.author.id) } },
        { upsert: true }
      );

      for (const emoji of reacoesDoPainel()) await painel.react(emoji);
      log.ok('CONFIG', `Painel publicado | ${descreverContexto(message)}`);
    } catch (e) {
      if (painel && typeof painel.delete === 'function') await painel.delete().catch(() => {});
      log.error('CONFIG', `Falha ao publicar o painel | ${descreverContexto(message)}: ${errMsg(e)}`, e);
      await message.reply('<:closecirclefill:1562606683371339786> Não consegui abrir o painel. Confira se tenho as permissões de **Enviar mensagens**, **Adicionar reações** e **Gerenciar mensagens** neste canal.');
    }
  },

  async subServerIcon(message, gId, opcao) {
    const atual = await Guild.findOne({ guildId: gId }).lean();
    const estavaLigado = !atual || atual.mostrarIcone !== false;

    let novo;
    const o = (opcao || '').toLowerCase();
    if (VALORES_LIGAR.includes(o)) novo = true;
    else if (VALORES_DESLIGAR.includes(o)) novo = false;
    else if (!o) novo = !estavaLigado;
    else {
      await message.reply(
        '<:closecirclefill:1562606683371339786> Opção inválida.\n' +
        `-# Use \`${PREFIXO}config servericon on\`, \`${PREFIXO}config servericon off\` ou só \`${PREFIXO}config servericon\` para alternar.`
      );
      return;
    }

    await Guild.findOneAndUpdate({ guildId: gId }, { $set: { mostrarIcone: novo } }, { upsert: true });
    log.ok('CONFIG', `servericon ${novo ? 'ativado' : 'desativado'} | ${descreverContexto(message)}`);

    await message.reply(
      novo
        ? '<:checkboxcirclefill:1562606683371339777> O ícone do servidor agora **aparece** nas mensagens do Global.'
        : '<:checkboxcirclefill:1562606683371339777> O ícone do servidor agora **não aparece** mais nas mensagens do Global.'
    );
  }
};
