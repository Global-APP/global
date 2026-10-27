const ACOES_REACAO = Object.freeze({
  '🖼️': 'embed',
  '📝': 'cru',
  '🌄': 'mostrarIcone',
  '🚫': 'ocultarIcone',
  '📌': 'definirCanal'
});

function acaoDaReacao(emojiName) {
  return ACOES_REACAO[emojiName] || null;
}

function textoPainel(config = {}) {
  const modo = config.modoMensagem === 'embed' ? 'Embed' : 'Cru';
  const icone = config.mostrarIcone === true ? 'visível' : 'oculto';
  const canal = config.canalId ? `<#${config.canalId}>` : 'não configurada';

  return [
    '**Configurações do Global**',
    `Modo atual: **${modo}**`,
    `Ícone do servidor: **${icone}**`,
    `Conexão global: **${canal}**`,
    '',
    'Reaja para escolher uma opção. Para reutilizar a mesma reação, remova sua reação anterior primeiro.',
    '🖼️ Embed · 📝 Cru · 🌄 Exibir ícone · 🚫 Ocultar ícone · 📌 Conectar este canal'
  ].join('\n');
}

module.exports = { ACOES_REACAO, acaoDaReacao, textoPainel };
