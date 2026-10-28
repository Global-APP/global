const { ehDev, PREFIXO } = require('../../config');
const { client } = require('../../lib/client');
const Guild = require('../../models/Guild');
const { limparFalhasDestino } = require('../../services/destinos');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const {
  membroPodeGerenciarCanais,
  permissoesBotFaltando,
  PERMISSOES_ABRIR_CONFIG
} = require('../../services/permissoes');
const { obterWebhook } = require('../../services/webhooks');
const { reacoesDoPainel, embedPainel } = require('../../services/configPainel');

const VALORES_LIGAR = ['on', 'ligar', 'ativar', 'sim', 'true'];
const VALORES_DESLIGAR = ['off', 'desligar', 'desativar', 'nao', 'não', 'false'];

module.exports = {
  name: 'config',
  aliases: ['configurar', 'configurações'],
  description: 'Abre o painel de configurações da conexão global.',

  async execute(message, args = []) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (!ehDev(message.author.id)) {
      const temPermissao = await membroPodeGerenciarCanais(message);
      if (!temPermissao) {
        log.warn('CONFIG', `Permissão negada para ${descreverContexto(message)}`);
        await message.reply('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
        return;
      }
    }

    const gId = String(guildId);
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'servericon') {
      return this.subServerIcon(message, gId, args[1]);
    }

    if (sub) {
      await message.reply(
        '<:closecirclefill:1562606683371339786> Subcomando inválido.\n' +
        `-# Use \`${PREFIXO}config\` para abrir o painel ou \`${PREFIXO}config servericon [on|off]\` para o ícone do servidor.`
      );
      return;
    }

    return this.publicarPainelConfiguracao(message, gId);
  },

  async publicarPainelConfiguracao(message, guildId) {
    let painel = null;
    const canalPainelId = String(message.channel.id);
    let faltando;
    try {
      faltando = await permissoesBotFaltando(message, client, [...PERMISSOES_ABRIR_CONFIG]);
    } catch (e) {
      log.error('CONFIG', `Não foi possível verificar as permissões do bot | ${descreverContexto(message)}`, e);
      try {
        await message.reply('⚠️ Não consegui verificar se tenho as permissões necessárias neste canal. Confira minhas permissões e tente novamente.');
      } catch (replyError) {
        log.error('CONFIG', `Não consegui avisar sobre as permissões ausentes | ${descreverContexto(message)}`, replyError);
      }
      return null;
    }
    if (faltando.length > 0) {
      log.warn('CONFIG', `Painel recusado por permissões insuficientes do bot | ${descreverContexto(message)}: ${faltando.join(', ')}`);
      try {
        await message.reply(`⚠️ Não consigo abrir o painel neste canal. Estão faltando estas permissões: **${faltando.join(', ')}**.`);
      } catch (e) {
        log.error('CONFIG', `Não consegui avisar sobre as permissões ausentes | ${descreverContexto(message)}`, e);
      }
      return null;
    }

    try {
      const atual = await Guild.findOne({ guildId }).lean();
      painel = await message.channel.send({
        embeds: [embedPainel({}, true, undefined, canalPainelId)],
        allowedMentions: { parse: [] }
      });

      for (const emoji of reacoesDoPainel(atual || {}, canalPainelId)) {
        await painel.react(emoji);
      }

      await Guild.findOneAndUpdate(
        { guildId },
        { $set: {
          configPainelMessageId: String(painel.id),
          configPainelUserId: String(message.author.id)
        } },
        { upsert: true }
      );
      try {
        await painel.edit({
          embeds: [embedPainel(atual || {}, false, undefined, canalPainelId)],
          allowedMentions: { parse: [] }
        });
      } catch (e) {
        log.error('CONFIG', `Painel salvo, mas não foi possível exibir suas opções | ${descreverContexto(message)}`, e);
        await message.reply('<:closecirclefill:1562606683371339786> O painel foi criado, mas não consegui carregar as opções. Execute o comando novamente para atualizar.');
        return painel;
      }
      log.ok('CONFIG', `Painel publicado | ${descreverContexto(message)}`);
      return painel;
    } catch (e) {
      if (painel && typeof painel.delete === 'function') {
        await painel.delete().catch(() => {});
      }
      log.error('CONFIG', `Falha ao publicar painel | ${descreverContexto(message)}`, e);
      await message.reply('<:closecirclefill:1562606683371339786> Não consegui abrir o painel de configurações. Verifique as permissões de enviar mensagens e adicionar reações, depois tente novamente.');
      return null;
    }
  },

  async definirCanal(message, gId) {
    const anterior = await Guild.findOne({ guildId: gId, canalId: { $ne: null } }).lean();
    try {
      await obterWebhook(gId, String(message.channel.id), message.channel);
    } catch (e) {
      log.error('CONFIG', `Falha ao criar webhook em ${descreverContexto(message)}`, e);
      await message.channel.send(
        '<:closecirclefill:1562606683371339786> Não consegui criar a webhook neste canal. Confira se o bot tem a permissão **Gerenciar Webhooks** e tente novamente.'
      );
      return;
    }

    limparFalhasDestino(gId);
    log.ok('CONFIG', `Canal global ${anterior ? `alterado (${anterior.canalId} -> ${message.channel.id})` : `definido (${message.channel.id})`} | ${descreverContexto(message)}`);

    await message.reply(
      `<:checkboxcirclefill:1562606683371339777> O canal <#${message.channel.id}> foi definido com sucesso como a \`Conexão Global\`.\n` +
      `-# Execute ${PREFIXO}config no canal que **você quer definir** a conexão global.`
    );
  },

  async subServerIcon(message, gId, opcao) {
    const atual = await Guild.findOne({ guildId: gId }).lean();
    const estavaLigado = !atual || atual.mostrarIcone !== false;

    let novo;
    const o = (opcao || '').toLowerCase();
    if (VALORES_LIGAR.includes(o)) {
      novo = true;
    } else if (VALORES_DESLIGAR.includes(o)) {
      novo = false;
    } else if (!o) {
      novo = !estavaLigado;
    } else {
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
