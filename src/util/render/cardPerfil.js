const path = require('path');
const { ROTULO_BADGE } = require('../../config');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const LARGURA = 1000;
const ALTURA = 340;
const ESCALA = 2;

const COR = {
  azul: '#0330ef',
  preto: '#0B0B0B',
  cinza: '#0F0F0F',
  texto: '#FFFFFF',
  mudo: '#8B90A0',
  borda: 'rgba(255,255,255,0.07)'
};

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const ICONE_PATH = path.join(ASSETS, 'global-icon.png');

GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', 'Outfit-Regular.ttf'), 'GlobalRegular');
GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', 'Outfit-Medium.ttf'), 'GlobalMedium');
GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts', 'Outfit-Bold.ttf'), 'GlobalBold');

const FONTE_REGULAR = 'GlobalRegular, sans-serif';
const FONTE_MEDIA = 'GlobalMedium, sans-serif';
const FONTE_NEGRITO = 'GlobalBold, sans-serif';

const BADGES = {
  active: { label: ROTULO_BADGE.active, cor: '#4ade5f' },
  developer: { label: ROTULO_BADGE.developer, cor: '#4facfe' },
  partner: { label: ROTULO_BADGE.partner, cor: '#f9a11b' },
  staff: { label: ROTULO_BADGE.staff, cor: '#a855f7' },
  verified: { label: ROTULO_BADGE.verified, cor: '#3b9bf5' }
};

const cacheBadges = new Map();
async function iconeBadge(chave) {
  if (!cacheBadges.has(chave)) {
    cacheBadges.set(chave, carregarImagem(path.join(ASSETS, 'badges', `${chave}.png`)));
  }
  return cacheBadges.get(chave);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function caminhoArredondado(ctx, x, y, w, h, r) {
  const raio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + w, y, x + w, y + h, raio);
  ctx.arcTo(x + w, y + h, x, y + h, raio);
  ctx.arcTo(x, y + h, x, y, raio);
  ctx.arcTo(x, y, x + w, y, raio);
  ctx.closePath();
}

function cortarTexto(ctx, texto, larguraMax) {
  if (ctx.measureText(texto).width <= larguraMax) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > larguraMax) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function ajustarFonte(ctx, texto, familia, tamanhoMax, tamanhoMin, larguraMax) {
  let tamanho = tamanhoMax;
  ctx.font = `${tamanho}px ${familia}`;
  while (tamanho > tamanhoMin && ctx.measureText(texto).width > larguraMax) {
    tamanho -= 1;
    ctx.font = `${tamanho}px ${familia}`;
  }
  return tamanho;
}

function espacarLetras(ctx, valor) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = valor;
}

function formatarNumero(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}

function formatarData(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

async function carregarImagem(fonte) {
  if (!fonte) return null;
  try {
    return await loadImage(fonte);
  } catch {
    return null;
  }
}

function iconeColorido(img, tamanho, cor) {
  const c = createCanvas(tamanho, tamanho);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, tamanho, tamanho);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = cor;
  x.fillRect(0, 0, tamanho, tamanho);
  return c;
}
function desenharFundo(ctx, iconeBranco) {
  ctx.fillStyle = COR.preto;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  const grad = ctx.createLinearGradient(0, ALTURA * 0.35, 0, ALTURA);
  grad.addColorStop(0, 'rgba(3,48,239,0)');
  grad.addColorStop(1, 'rgba(3,48,239,0.75)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  const brilho = ctx.createRadialGradient(LARGURA - 120, ALTURA + 40, 10, LARGURA - 120, ALTURA + 40, 420);
  brilho.addColorStop(0, 'rgba(3,48,239,0.55)');
  brilho.addColorStop(1, 'rgba(3,48,239,0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  if (iconeBranco) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    const tam = 420;
    ctx.drawImage(iconeBranco, LARGURA - tam * 0.62, ALTURA / 2 - tam / 2 - 10, tam, tam);
    ctx.restore();
  }
}

function desenharAvatar(ctx, avatar, inicial, x, y, tam) {
  const cx = x + tam / 2;
  const cy = y + tam / 2;
  const anel = 5;

  ctx.save();
  ctx.shadowColor = 'rgba(3,48,239,0.85)';
  ctx.shadowBlur = 28;
  ctx.beginPath();
  ctx.arc(cx, cy, tam / 2 + anel, 0, Math.PI * 2);
  ctx.fillStyle = COR.azul;
  ctx.fill();
  ctx.restore();

  const gAnel = ctx.createLinearGradient(x, y, x, y + tam);
  gAnel.addColorStop(0, '#FFFFFF');
  gAnel.addColorStop(1, COR.azul);
  ctx.beginPath();
  ctx.arc(cx, cy, tam / 2 + anel, 0, Math.PI * 2);
  ctx.fillStyle = gAnel;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, tam / 2, 0, Math.PI * 2);
  ctx.fillStyle = COR.preto;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, tam / 2 - 3, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, x + 3, y + 3, tam - 6, tam - 6);
  } else {
    ctx.fillStyle = COR.cinza;
    ctx.fillRect(x, y, tam, tam);
    ctx.fillStyle = COR.texto;
    ctx.font = `72px ${FONTE_NEGRITO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inicial, cx, cy + 4);
  }
  ctx.restore();
}

function larguraPill(ctx, chave) {
  const info = BADGES[chave] || { label: chave };
  ctx.font = `16px ${FONTE_MEDIA}`;
  return 9 + 26 + 9 + ctx.measureText(info.label).width + 16;
}

function desenharPill(ctx, chave, x, y, selecionada, imagem) {
  const info = BADGES[chave] || { label: chave, cor: COR.azul };
  const altura = 38;
  const dIcone = 26;
  const largura = larguraPill(ctx, chave);

  ctx.save();
  if (selecionada) {
    ctx.shadowColor = 'rgba(3,48,239,0.75)';
    ctx.shadowBlur = 16;
  }
  caminhoArredondado(ctx, x, y, largura, altura, altura / 2);
  ctx.fillStyle = selecionada ? 'rgba(3,48,239,0.30)' : 'rgba(15,15,15,0.92)';
  ctx.fill();
  ctx.restore();

  caminhoArredondado(ctx, x, y, largura, altura, altura / 2);
  ctx.lineWidth = selecionada ? 1.6 : 1;
  ctx.strokeStyle = selecionada ? COR.azul : 'rgba(255,255,255,0.10)';
  ctx.stroke();

  const icx = x + 9 + dIcone / 2;
  const icy = y + altura / 2;
  if (imagem) {
    ctx.save();
    ctx.shadowColor = info.cor;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(imagem, icx - dIcone / 2, icy - dIcone / 2, dIcone, dIcone);
    ctx.restore();
    ctx.drawImage(imagem, icx - dIcone / 2, icy - dIcone / 2, dIcone, dIcone);
  }

  ctx.font = `16px ${FONTE_MEDIA}`;
  ctx.fillStyle = COR.texto;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.label, x + 9 + dIcone + 9, icy + 1);

  return largura;
}

function desenharCardStat(ctx, x, y, w, h, rotulo, valor, detalhe) {
  ctx.save();
  caminhoArredondado(ctx, x, y, w, h, 18);
  ctx.fillStyle = 'rgba(15,15,15,0.94)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COR.borda;
  ctx.stroke();
  ctx.restore();

  caminhoArredondado(ctx, x + 18, y + 17, 4, h - 34, 2);
  ctx.fillStyle = COR.azul;
  ctx.fill();

  const tx = x + 36;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = COR.mudo;
  ctx.font = `13px ${FONTE_MEDIA}`;
  espacarLetras(ctx, '1.2px');
  ctx.fillText(rotulo.toUpperCase(), tx, y + 26);
  espacarLetras(ctx, '0px');

  if (detalhe) {
    ctx.textAlign = 'right';
    ctx.fillStyle = COR.mudo;
    ctx.font = `13px ${FONTE_REGULAR}`;
    ctx.fillText(detalhe, x + w - 20, y + 26);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = COR.texto;
  const larguraMax = w - 36 - 20;
  const tamanho = ajustarFonte(ctx, valor, FONTE_NEGRITO, 27, 16, larguraMax);
  ctx.fillText(cortarTexto(ctx, valor, larguraMax), tx, y + 45.5 + tamanho * 0.35);
}

async function gerarCardPerfil(dados) {
  const {
    username,
    displayName,
    avatar = null,
    badges = [],
    selectedBadge = null,
    mensagens = 0,
    contaCriada = null,
    servidor = '—',
    servidorMensagens = null,
    badgeImagens = {}
  } = dados;

  const canvas = createCanvas(LARGURA * ESCALA, ALTURA * ESCALA);
  const ctx = canvas.getContext('2d');
  ctx.scale(ESCALA, ESCALA);

  const [iconeImg, avatarImg] = await Promise.all([carregarImagem(ICONE_PATH), carregarImagem(avatar)]);
  const iconeBranco = iconeImg ? iconeColorido(iconeImg, 512, '#FFFFFF') : null;

  caminhoArredondado(ctx, 0, 0, LARGURA, ALTURA, 30);
  ctx.clip();

  desenharFundo(ctx, iconeBranco);
  const margem = 48;
  const avTam = 150;
  const avX = margem;
  const avY = 44;
  const nomeExibido = displayName || username || '?';
  desenharAvatar(ctx, avatarImg, nomeExibido.trim().charAt(0).toUpperCase() || '?', avX, avY, avTam);
  const colX = avX + avTam + 38;
  const larguraTexto = LARGURA - colX - margem;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COR.texto;
  ajustarFonte(ctx, nomeExibido, FONTE_NEGRITO, 50, 28, larguraTexto);
  ctx.fillText(cortarTexto(ctx, nomeExibido, larguraTexto), colX, avY + 56);

  ctx.fillStyle = COR.mudo;
  ctx.font = `22px ${FONTE_REGULAR}`;
  ctx.fillText(cortarTexto(ctx, `@${username}`, larguraTexto), colX, avY + 88);
  const validas = badges.filter((b, i) => badges.indexOf(b) === i);
  if (selectedBadge && validas.includes(selectedBadge)) {
    validas.splice(validas.indexOf(selectedBadge), 1);
    validas.unshift(selectedBadge);
  }

  const imagensBadge = {};
  await Promise.all(
    validas.map(async (b) => {
      imagensBadge[b] = badgeImagens[b] ? await carregarImagem(badgeImagens[b]) : await iconeBadge(b);
    })
  );

  const pillY = avY + 110;
  const limiteX = LARGURA - margem;
  let px = colX;
  let desenhadas = 0;
  for (const b of validas) {
    const prevista = larguraPill(ctx, b);
    const restantes = validas.length - desenhadas - 1;
    const reservaMais = restantes > 0 ? 62 : 0;
    if (px + prevista + reservaMais > limiteX && desenhadas > 0) break;
    const larg = desenharPill(ctx, b, px, pillY, b === selectedBadge, imagensBadge[b]);
    px += larg + 10;
    desenhadas += 1;
  }
  if (desenhadas < validas.length) {
    const extra = `+${validas.length - desenhadas}`;
    ctx.font = `16px ${FONTE_MEDIA}`;
    const w = ctx.measureText(extra).width + 28;
    caminhoArredondado(ctx, px, pillY, w, 38, 19);
    ctx.fillStyle = 'rgba(15,15,15,0.92)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    ctx.fillStyle = COR.texto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(extra, px + w / 2, pillY + 20);
  }
  if (validas.length === 0) {
    ctx.fillStyle = COR.mudo;
    ctx.font = `16px ${FONTE_REGULAR}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sem badges ainda', colX, pillY + 20);
  }
  const gap = 16;
  const tileH = 66;
  const tileY = ALTURA - 42 - tileH;
  const tileW = (LARGURA - margem * 2 - gap * 2) / 3;
  const stats = [
    ['Mensagens', formatarNumero(mensagens), null],
    ['Começou em', formatarData(contaCriada), null],
    [
      'Servidor mais ativo',
      servidor,
      servidorMensagens != null ? `${formatarNumero(servidorMensagens)} msgs` : null
    ]
  ];
  stats.forEach(([rotulo, valor, detalhe], i) => {
    desenharCardStat(ctx, margem + i * (tileW + gap), tileY, tileW, tileH, rotulo, String(valor), detalhe);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { gerarCardPerfil, BADGES };