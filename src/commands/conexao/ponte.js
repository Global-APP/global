const { PREFIXO } = require('../../config');
const { idDoServidor } = require('../../util/ids');
const { log, descreverContexto } = require('../../util/logger');
const { temPermissaoConfig } = require('../../services/permissoes');
const { origemAdulta } = require('../../services/filtros/adulto');
const {
  MAX_PARTICIPANTES,
  MAX_PONTES_POR_SERVIDOR,
  pontePorCodigo,
  pontePorCanal,
  pontesDoServidor,
  criarPonte,
  entrarNaPonte,
  removerParticipante,
  encerrarPonte
} = require('../../services/pontes');

const ERRO = '<:closecirclefill:1562606683371339786>';
const OK = '<:checkboxcirclefill:1562606683371339777>';
const INFO = '<:information2fill:1562606683371339784>';

const ROTULO_PLATAFORMA = { fluxer: 'Fluxer', discord: 'Discord' };

const ERROS = {
  'canal-ocupado': 'Este canal já está conectado ao chat global ou a outra ponte.',
  'limite-servidor': `Este servidor já participa de ${MAX_PONTES_POR_SERVIDOR} pontes, que é o limite.`,
  'codigo-invalido': 'Código de ponte inválido. Confira se digitou certo.',
  'servidor-ja-esta': 'Este servidor já participa dessa ponte.',
  'ponte-cheia': `Essa ponte já tem ${MAX_PARTICIPANTES} servidores, que é o limite.`
};

function nomeDoServidor(message) {
  return message.guild && message.guild.name ? String(message.guild.name) : null;
}

function descreverParticipante(p) {
  const nome = p.nomeServidor || p.guildId;
  return `${nome} (${ROTULO_PLATAFORMA[p.plataforma] || p.plataforma}) em <#${p.canalId}>`;
}

function ajuda() {
  return [
    `${INFO} **Pontes privadas**: ligam canais de servidores do Fluxer e do Discord sem passar pelo chat global.`,
    `\`${PREFIXO}ponte criar [nome]\`: cria uma ponte com este canal e gera um código.`,
    `\`${PREFIXO}ponte entrar <código>\`: liga este canal a uma ponte existente.`,
    `\`${PREFIXO}ponte listar\`: mostra as pontes deste servidor.`,
    `\`${PREFIXO}ponte sair\`: tira este canal da ponte.`,
    `\`${PREFIXO}ponte remover <código> <id do servidor>\`: o dono tira outro servidor da ponte.`,
    `\`${PREFIXO}ponte encerrar <código>\`: o dono apaga a ponte.`
  ].join('\n');
}

module.exports = {
  name: 'ponte',
  aliases: ['bridge', 'pontes'],
  description: 'Cria e gerencia pontes privadas entre canais.',

  async execute(message, args = []) {
    const guildId = idDoServidor(message);
    if (!guildId) return;

    if (!(await temPermissaoConfig(message))) {
      log.warn('PONTE', `Permissão negada para ${descreverContexto(message)}`);
      await message.reply(`${ERRO} Você precisa da permissão **Gerenciar Canais** (ou ser o desenvolvedor do Global) para usar este comando.`);
      return;
    }

    const sub = (args[0] || '').toLowerCase();
    const gId = String(guildId);

    if (sub === 'criar') return this.criar(message, gId, args.slice(1).join(' '));
    if (sub === 'entrar') return this.entrar(message, gId, args[1]);
    if (sub === 'sair') return this.sair(message, gId);
    if (sub === 'listar') return this.listar(message, gId);
    if (sub === 'remover') return this.remover(message, gId, args[1], args[2]);
    if (sub === 'encerrar') return this.encerrar(message, gId, args[1]);

    await message.reply(ajuda());
  },

  dadosDoCanal(message, gId) {
    return {
      guildId: gId,
      plataforma: message.plataforma || 'fluxer',
      canalId: String(message.channel.id),
      nomeServidor: nomeDoServidor(message)
    };
  },

  async recusarCanalAdulto(message) {
    if (!origemAdulta(message)) return false;
    await message.reply(`${ERRO} Canais e servidores marcados como **18+** não podem participar de pontes.`);
    return true;
  },

  async criar(message, gId, nome) {
    if (await this.recusarCanalAdulto(message)) return;

    const r = await criarPonte({ nome, donoId: message.author.id, ...this.dadosDoCanal(message, gId) });
    if (r.erro) {
      await message.reply(`${ERRO} ${ERROS[r.erro]}`);
      return;
    }

    log.ok('PONTE', `Criada ${r.ponte.codigo} | ${descreverContexto(message)}`);
    await message.reply(
      `${OK} Ponte criada! Código: \`${r.ponte.codigo}\`\n` +
      `-# Em outro servidor, no canal desejado, use \`${PREFIXO}ponte entrar ${r.ponte.codigo}\`. Compartilhe o código só com quem você confia.`
    );
  },

  async entrar(message, gId, codigo) {
    if (!codigo) {
      await message.reply(`${ERRO} Informe o código: \`${PREFIXO}ponte entrar <código>\`.`);
      return;
    }
    if (await this.recusarCanalAdulto(message)) return;

    const r = await entrarNaPonte(codigo, this.dadosDoCanal(message, gId));
    if (r.erro) {
      await message.reply(`${ERRO} ${ERROS[r.erro]}`);
      return;
    }

    log.ok('PONTE', `Entrou em ${r.ponte.codigo} | ${descreverContexto(message)}`);
    await message.reply(`${OK} Canal conectado à ponte \`${r.ponte.codigo}\`, que agora tem ${r.ponte.participantes.length} servidor(es).`);
  },

  async sair(message, gId) {
    const ponte = await pontePorCanal(message.channel.id);
    if (!ponte || !ponte.participantes.some((p) => p.guildId === gId && p.canalId === String(message.channel.id))) {
      await message.reply(`${INFO} Este canal não faz parte de nenhuma ponte.`);
      return;
    }

    await removerParticipante(ponte, gId);
    log.ok('PONTE', `Saiu de ${ponte.codigo} | ${descreverContexto(message)}`);
    await message.reply(`${OK} Este canal saiu da ponte \`${ponte.codigo}\`.`);
  },

  async listar(message, gId) {
    const pontes = await pontesDoServidor(gId);
    if (pontes.length === 0) {
      await message.reply(`${INFO} Este servidor não participa de nenhuma ponte.\n-# Use \`${PREFIXO}ponte criar\` para criar uma.`);
      return;
    }

    const blocos = pontes.map((p) => {
      const titulo = `**${p.nome || 'Ponte sem nome'}** · \`${p.codigo}\`${p.donoGuildId === gId ? ' · você é o dono' : ''}`;
      return `${titulo}\n${p.participantes.map((x) => `- ${descreverParticipante(x)}`).join('\n')}`;
    });
    await message.reply(blocos.join('\n\n'));
  },

  async carregarPonteDoDono(message, gId, codigo) {
    if (!codigo) {
      await message.reply(`${ERRO} Informe o código da ponte.`);
      return null;
    }
    const ponte = await pontePorCodigo(codigo);
    if (!ponte || !ponte.participantes.some((p) => p.guildId === gId)) {
      await message.reply(`${ERRO} Não encontrei essa ponte neste servidor.`);
      return null;
    }
    if (ponte.donoGuildId !== gId) {
      await message.reply(`${ERRO} Só o servidor dono da ponte pode fazer isso.`);
      return null;
    }
    return ponte;
  },

  async remover(message, gId, codigo, alvo) {
    const ponte = await this.carregarPonteDoDono(message, gId, codigo);
    if (!ponte) return;

    if (!alvo || alvo === gId) {
      await message.reply(`${ERRO} Informe o ID de outro servidor da ponte. Use \`${PREFIXO}ponte listar\` para ver a lista.`);
      return;
    }

    const r = await removerParticipante(ponte, alvo);
    if (r.erro) {
      await message.reply(`${ERRO} Esse servidor não participa da ponte.`);
      return;
    }
    log.ok('PONTE', `Servidor ${alvo} removido de ${ponte.codigo} | ${descreverContexto(message)}`);
    await message.reply(`${OK} Servidor removido da ponte \`${ponte.codigo}\`.`);
  },

  async encerrar(message, gId, codigo) {
    const ponte = await this.carregarPonteDoDono(message, gId, codigo);
    if (!ponte) return;

    await encerrarPonte(ponte);
    await message.reply(`${OK} Ponte \`${ponte.codigo}\` encerrada.`);
  }
};
