const Palavra = require('../../models/Palavra');
const { PREFIXO } = require('../../config');
const { recarregarPalavras, acharPalavraProibida, totalEntradas } = require('../../services/filtros/palavras');
const { normalizarTexto } = require('../../services/filtros/normalizacao');
const { log } = require('../../util/logger');
const { negarSeNaoStaff } = require('./_comum');

module.exports = {
  name: 'filtro',
  aliases: [],
  description: 'Gerencia o filtro de palavras.',

  async execute(message, args) {
    if (await negarSeNaoStaff(message)) return;

    const sub = (args[0] || '').toLowerCase();
    const resto = args.slice(1).join(' ');
    const palavra = normalizarTexto(resto).trim();

    if (['add', 'adicionar'].includes(sub) && palavra) {
      if (palavra.length < 2 || palavra.length > 50) {
        await message.channel.send('<:closecirclefill:1562606683371339786> A palavra precisa ter entre 2 e 50 caracteres.');
        return;
      }
      await Palavra.updateOne(
        { palavra, tipo: 'proibida' },
        { $setOnInsert: { palavra, tipo: 'proibida' } },
        { upsert: true }
      );
      await recarregarPalavras();
      log.ok('FILTRO', `Palavra adicionada por ${message.author.id}`);
      await message.channel.send('<:checkboxcirclefill:1562606683371339777> Palavra adicionada ao filtro.');
      return;
    }

    if (['remove', 'remover', 'del'].includes(sub) && palavra) {
      const r = await Palavra.deleteOne({ palavra, tipo: 'proibida' });
      await recarregarPalavras();
      await message.channel.send(r.deletedCount > 0
        ? '<:checkboxcirclefill:1562606683371339777> Palavra removida do filtro.'
        : `<:information2fill:1562606683371339784> Essa palavra não está na lista personalizada (se vier das listas de arquivos, use \`${PREFIXO}filtro liberar\`).`);
      return;
    }

    // Exceção para palavras das listas que dão falso positivo
    if (['liberar', 'permitir'].includes(sub) && palavra) {
      await Palavra.updateOne(
        { palavra, tipo: 'liberada' },
        { $setOnInsert: { palavra, tipo: 'liberada' } },
        { upsert: true }
      );
      await recarregarPalavras();
      await message.channel.send('<:checkboxcirclefill:1562606683371339777> Palavra liberada (não será mais bloqueada).');
      return;
    }

    if (['desliberar', 'bloquear'].includes(sub) && palavra) {
      const r = await Palavra.deleteOne({ palavra, tipo: 'liberada' });
      await recarregarPalavras();
      await message.channel.send(r.deletedCount > 0
        ? '<:checkboxcirclefill:1562606683371339777> Exceção removida.'
        : '<:information2fill:1562606683371339784> Essa palavra não estava liberada.');
      return;
    }

    if (['testar', 'test'].includes(sub) && resto) {
      const achado = acharPalavraProibida(resto);
      await message.channel.send(achado
        ? `<:forbidline:1562606683371339778> Seria bloqueado. Bateu em: \`${achado}\``
        : '<:checkboxcirclefill:1562606683371339777> Passaria pelo filtro.');
      return;
    }

    if (['recarregar', 'reload'].includes(sub)) {
      await recarregarPalavras();
      await message.channel.send(`<:checkboxcirclefill:1562606683371339777> Filtro recarregado (${totalEntradas()} entradas).`);
      return;
    }

    if (['list', 'lista', 'listar'].includes(sub)) {
      const palavras = await Palavra.find().sort({ palavra: 1 }).lean();
      const custom = palavras.filter((p) => p.tipo === 'proibida').map((p) => p.palavra);
      const excecoes = palavras.filter((p) => p.tipo === 'liberada').map((p) => p.palavra);
      let texto = custom.length ? custom.map((p) => `\`${p}\``).join(', ') : '*(nenhuma)*';
      if (texto.length > 1500) texto = texto.slice(0, 1500) + '…';
      await message.channel.send(
        `<:information2fill:1562606683371339784> **Filtro** — ${totalEntradas()} entradas no total\n` +
        `**Personalizadas (${custom.length}):** ${texto}\n` +
        `**Liberadas (${excecoes.length}):** ${excecoes.length ? excecoes.map((p) => `\`${p}\``).join(', ') : '*(nenhuma)*'}`
      );
      return;
    }

    await message.channel.send(
      `<:information2fill:1562606683371339784> Uso: \`${PREFIXO}filtro add|remove <palavra>\`, \`liberar|desliberar <palavra>\`, \`testar <texto>\`, \`recarregar\` ou \`list\``
    );
  }
};
