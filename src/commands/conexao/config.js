const { DONO_ID } = require('../../config');
const Guild = require('../../models/Guild');
const { limparFalhasDestino } = require('../../services/destinos');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { membroPodeGerenciarCanais } = require('../../services/permissoes');

const VALORES_LIGAR = ['on', 'ligar', 'ativar', 'sim', 'true'];
const VALORES_DESLIGAR = ['off', 'desligar', 'desativar', 'nao', 'não', 'false'];

module.exports = {
  name: 'config',
  aliases: ['configurar', 'configurações'],
  description: 'Define o canal atual como a conexão global. Subcomandos: servericon.',

  async execute(message, args = []) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (message.author.id !== DONO_ID) {
      const temPermissao = await membroPodeGerenciarCanais(message);
      if (!temPermissao) {
        log.warn('CONFIG', `Permissão negada para ${descreverContexto(message)}`);
        await message.channel.send('<:closecirclefill:1562606683371339786> Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.');
        return;
      }
    }

    const gId = String(guildId);
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'servericon') {
      return this.subServerIcon(message, gId, args[1]);
    }

    if (sub) {
      await message.channel.send(
        '<:closecirclefill:1562606683371339786> Subcomando inválido.\n' +
        '-# Use `g.config` para definir o canal ou `g.config servericon [on|off]` para o ícone do servidor.'
      );
      return;
    }

    return this.definirCanal(message, gId);
  },

  async definirCanal(message, gId) {
    const anterior = await Guild.findOne({ guildId: gId, canalId: { $ne: null } }).lean();
    await Guild.findOneAndUpdate({ guildId: gId }, { canalId: String(message.channel.id) }, { upsert: true });
    limparFalhasDestino(gId);
    log.ok('CONFIG', `Canal global ${anterior ? `alterado (${anterior.canalId} -> ${message.channel.id})` : `definido (${message.channel.id})`} | ${descreverContexto(message)}`);

    await message.channel.send(
      `<:checkboxcirclefill:1562606683371339777> O canal <#${message.channel.id}> foi definido com sucesso como a \`Conexão Global\`.\n` +
      '-# Execute g.config no canal que **você quer definir** a conexão global.'
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
      await message.channel.send(
        '<:closecirclefill:1562606683371339786> Opção inválida.\n' +
        '-# Use `g.config servericon on`, `g.config servericon off` ou só `g.config servericon` para alternar.'
      );
      return;
    }

    await Guild.findOneAndUpdate({ guildId: gId }, { $set: { mostrarIcone: novo } }, { upsert: true });
    log.ok('CONFIG', `servericon ${novo ? 'ativado' : 'desativado'} | ${descreverContexto(message)}`);

    await message.channel.send(
      novo
        ? '<:checkboxcirclefill:1562606683371339777> O ícone do servidor agora **aparece** nas mensagens do Global.'
        : '<:checkboxcirclefill:1562606683371339777> O ícone do servidor agora **não aparece** mais nas mensagens do Global.'
    );
  }
};
