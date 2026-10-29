const { COR_PADRAO_ANUNCIO, ehDev, PREFIXO } = require('../../config');
const { desativarAnuncio, agendarAnuncio, enviarAnuncioParaTodos } = require('../../services/anuncio');
const { log, descreverContexto } = require('../../util/logger');

function tokenizarAnuncio(texto) {
  const tokens = [];
  const regex = /["“”]([^"“”]*)["“”]|(\S+)/g;
  let m;
  while ((m = regex.exec(texto)) !== null) {
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return tokens;
}

module.exports = {
  name: 'anuncio',
  aliases: [],
  description: 'Cria ou agenda um anúncio global.',

  async execute(message) {
    if (!ehDev(message.author.id)) {
      log.warn('ANUNCIO', `Acesso negado para ${descreverContexto(message)}`);
      await message.reply('<:closecirclefill:1562606683371339786> **Somente o desenvolvedor do Global** pode realizar essa ação.');
      return;
    }

    const bruto = (message.content || '').trim().slice(PREFIXO.length).trim().replace(/^\S+\s*/, '');
    const tokens = tokenizarAnuncio(bruto);

    if (tokens.length === 1 && ['parar', 'off', 'desativar'].includes(tokens[0].toLowerCase())) {
      await desativarAnuncio();
      log.ok('ANUNCIO', 'Anúncio automático desativado');
      await message.reply('<:checkboxcirclefill:1562606683371339777> Anúncio automático desativado.');
      return;
    }

    if (tokens.length !== 6) {
      await message.reply(
        '<:information2fill:1562606683371339784> **Uso do anúncio**\n' +
        '`g.anuncio "título" "descrição" #hex "autor" "footer" <mensagens>`\n\n' +
        '• Use `#` sozinho em qualquer campo pra deixá-lo vazio (no hex, usa a cor padrão `#0330ef`).\n' +
        '• Em `<mensagens>`: `#` envia na hora; um número envia a cada N mensagens do chat global.\n' +
        '• Coloque textos com espaços entre **aspas**. Use `\\n` na descrição pra quebrar linha.\n' +
        '• `g.anuncio parar` desativa o anúncio automático.\n\n' +
        '**Exemplo:** `g.anuncio "Novidade" "Entrem no nosso servidor!" # "Equipe Global" # 25`' +
        (tokens.length > 0 && tokens.length !== 6 ? `\n-# Recebi ${tokens.length} campos, mas preciso de 6.` : '')
      );
      return;
    }

    const [tituloRaw, descRaw, hexRaw, autorRaw, footerRaw, duracaoRaw] = tokens;
    const limpar = (v) => (v.trim() === '#' ? null : v.trim());

    const titulo = limpar(tituloRaw);
    const descricao = limpar(descRaw) ? limpar(descRaw).replace(/\\n/g, '\n') : null;
    const autor = limpar(autorRaw);
    const footer = limpar(footerRaw);

    if (!titulo && !descricao && !autor && !footer) {
      await message.reply('<:closecirclefill:1562606683371339786> O anúncio precisa ter pelo menos um texto (título, descrição, autor ou footer).');
      return;
    }

    let cor = COR_PADRAO_ANUNCIO;
    if (hexRaw.trim() !== '#') {
      const hexStr = hexRaw.trim().replace('#', '');
      if (!/^[0-9a-fA-F]{6}$/.test(hexStr)) {
        await message.reply('<:closecirclefill:1562606683371339786> Código HEX inválido. Use 6 dígitos (ex: `#2d8f31`) ou `#` pra cor padrão.');
        return;
      }
      cor = parseInt(hexStr, 16);
    }

    let intervalo = 0;
    const imediato = duracaoRaw.trim() === '#';
    if (!imediato) {
      if (!/^\d+$/.test(duracaoRaw.trim()) || parseInt(duracaoRaw.trim(), 10) < 1) {
        await message.reply('<:closecirclefill:1562606683371339786> A quantidade de mensagens precisa ser um número maior que 0, ou `#` pra enviar agora.');
        return;
      }
      intervalo = parseInt(duracaoRaw.trim(), 10);
    }

    const anuncio = { titulo, descricao, cor, autor, footer };

    if (imediato) {
      const enviados = await enviarAnuncioParaTodos(anuncio);
      await message.reply(`<:checkboxcirclefill:1562606683371339777> Anúncio enviado agora para **${enviados}** servidor(es).`);
      return;
    }

    await agendarAnuncio(anuncio, intervalo);
    log.ok('ANUNCIO', `Anúncio automático salvo (a cada ${intervalo} mensagens)`);
    await message.reply(`<:checkboxcirclefill:1562606683371339777> Anúncio salvo! Ele será enviado **a cada ${intervalo} mensagens** do chat global.\n-# Use g.anuncio parar para desativar.`);
  }
};
