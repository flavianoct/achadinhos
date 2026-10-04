/**
 * Moldes das artes do Instagram: temas de cor (um por categoria) e layouts (três para o Story, três para o feed).
 * O tema vem da categoria e o layout vem do produto, então o mesmo produto sempre sai igual.
 * Fica fixo em todos: o nome "ACHADINHOS DO DIA", a fonte, o aviso de publi e o preço em destaque (identidade do perfil).
 */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export interface Tema {
  /** Gradiente do fundo (de cima para baixo). */
  f1: string;
  f2: string;
  /** Cor do selo "OFERTA". */
  selo: string;
  /** Cor do preço. */
  preco: string;
}

const TEMAS: Record<string, Tema> = {
  tech: { f1: '#1b1f27', f2: '#0f3a9e', selo: '#ff5a1f', preco: '#ffd34d' },
  casa: { f1: '#2b1a10', f2: '#b45309', selo: '#0e9f6e', preco: '#ffe08a' },
  beleza: { f1: '#3b0a2a', f2: '#be185d', selo: '#7c3aed', preco: '#ffd6e8' },
  moda: { f1: '#1f1235', f2: '#6d28d9', selo: '#f43f5e', preco: '#fde68a' },
  esporte: { f1: '#0b2a1d', f2: '#15803d', selo: '#f97316', preco: '#fef08a' },
  games: { f1: '#0f0a24', f2: '#4c1d95', selo: '#06b6d4', preco: '#a7f3d0' },
  bebe: { f1: '#0c2a3a', f2: '#0891b2', selo: '#f472b6', preco: '#fef3c7' },
  ferramentas: { f1: '#1c1917', f2: '#a16207', selo: '#dc2626', preco: '#ffffff' },
  pet: { f1: '#052e2b', f2: '#0f766e', selo: '#f59e0b', preco: '#fde68a' },
  geral: { f1: '#111827', f2: '#be123c', selo: '#f59e0b', preco: '#fde68a' },
};

export function temaDaCategoria(categoria: string): Tema {
  return TEMAS[categoria] ?? TEMAS.geral;
}

export const LAYOUTS = 3;

/** Layout de 0 a 2, estável para o mesmo produto. */
export function layoutDoProduto(id: string): number {
  let h = 7;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h % LAYOUTS;
}

export interface DadosDaArte {
  /** Linhas do título já quebradas (sem escapar). */
  titulo: string[];
  precoTexto: string;
  deTexto?: string;
  desconto: number;
  freteGratis: boolean;
  /** Data URI da foto, se houver. */
  foto?: string;
  /** Selo de menor preço, quando o histórico confirma. */
  selo?: string;
  tema: Tema;
  layout: number;
}

const FONTE = 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif';
const VERDE = '#0e9f6e';
const AVISO = 'Publi · link de afiliado · preço pode mudar';

const texto = (x: number, y: number, tamanho: number, cor: string, conteudo: string, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="middle"${extra}>${esc(conteudo)}</text>`;

function pilula(cx: number, y: number, h: number, largura: number, cor: string, tamanho: number, rotulo: string, corDoTexto = '#ffffff'): string {
  return `<rect x="${cx - largura / 2}" y="${y}" width="${largura}" height="${h}" rx="${h / 2}" fill="${cor}"/>\n${texto(cx, y + h * 0.7, tamanho, corDoTexto, rotulo)}`;
}

function gradiente(id: string, t: Tema): string {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.f1}"/><stop offset="1" stop-color="${t.f2}"/></linearGradient></defs>`;
}

function selo(d: DadosDaArte, cx: number, y: number, h: number, tamanho: number, larguraSelo: number, larguraNormal: number): string {
  return d.selo ? pilula(cx, y, h, larguraSelo, VERDE, tamanho - 2, d.selo) : pilula(cx, y, h, larguraNormal, d.tema.selo, tamanho, 'OFERTA');
}

function circuloDesconto(d: DadosDaArte, cx: number, cy: number, r: number, tamanho: number): string {
  return d.desconto ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e11d48"/>${texto(cx, cy + r * 0.21, tamanho, '#ffffff', `-${d.desconto}%`)}` : '';
}

function foto(d: DadosDaArte, x: number, y: number, w: number, h: number, tamanhoSemFoto: number): string {
  return d.foto
    ? `<image href="${d.foto}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${x + w / 2}" y="${y + h / 2}" font-size="${tamanhoSemFoto}" text-anchor="middle" fill="#98a2b3">Oferta do dia</text>`;
}

/** Encolhe o preço quando o texto é longo (R$ 1.299,90), para nunca passar da largura da arte. */
const preco = (d: DadosDaArte, x: number, y: number, base: number) => texto(x, y, Math.round(base * Math.min(1, 9.5 / d.precoTexto.length)), d.tema.preco, d.precoTexto);

const de = (d: DadosDaArte, x: number, y: number, tamanho: number, cor: string) =>
  d.deTexto ? `<text x="${x}" y="${y}" font-size="${tamanho}" fill="${cor}" text-anchor="middle" text-decoration="line-through">De ${esc(d.deTexto)}</text>` : '';

/** Pílula branca com texto verde-escuro: lê bem sobre qualquer tema (o verde puro some nos fundos verdes). */
const freteBranco = (d: DadosDaArte, y: number, h: number, tamanho: number) =>
  d.freteGratis ? pilula(540, y, h, 300, '#ffffff', tamanho, 'FRETE GRÁTIS', '#065f46') : '';

const linhasDoTitulo = (d: DadosDaArte, x: number, y0: number, passo: number, tamanho: number, cor: string) =>
  d.titulo.map((l, i) => texto(x, y0 + i * passo, tamanho, cor, l)).join('\n');

// ───────────────────────── Story 1080x1920 ─────────────────────────

function storyClassico(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1920" fill="url(#fundo)"/>
${texto(540, 170, 46, '#ffffff', 'ACHADINHOS DO DIA', ' letter-spacing="6"')}
${selo(d, 540, 215, 84, 46, 700, 280)}
<rect x="90" y="360" width="900" height="900" rx="56" fill="#ffffff"/>
${foto(d, 130, 400, 820, 820, 64)}
${circuloDesconto(d, 900, 440, 104, 68)}
${linhasDoTitulo(d, 540, 1340, 62, 52, '#ffffff')}
${de(d, 540, 1478, 44, '#cbd5e1')}
${preco(d, 540, 1648, 150)}
${freteBranco(d, 1684, 60, 34)}
<rect x="140" y="1768" width="800" height="92" rx="46" fill="#ffffff"/>
${texto(540, 1827, 40, '#1b1f27', 'Ofertas no link da bio')}
<text x="540" y="1895" font-size="26" fill="#cbd5e1" text-anchor="middle">${AVISO}</text>`;
}

function storyPainel(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1920" fill="url(#fundo)"/>
${texto(540, 150, 46, '#ffffff', 'ACHADINHOS DO DIA', ' letter-spacing="6"')}
${selo(d, 540, 195, 84, 46, 700, 280)}
<rect x="140" y="320" width="800" height="800" rx="56" fill="#ffffff"/>
${foto(d, 180, 360, 720, 720, 60)}
${circuloDesconto(d, 880, 400, 96, 62)}
<rect x="70" y="1170" width="940" height="540" rx="48" fill="#ffffff" fill-opacity="0.13"/>
${linhasDoTitulo(d, 540, 1250, 60, 50, '#ffffff')}
${de(d, 540, 1385, 42, '#e2e8f0')}
${preco(d, 540, 1560, 150)}
${freteBranco(d, 1600, 60, 34)}
<rect x="140" y="1764" width="800" height="92" rx="46" fill="#ffffff"/>
${texto(540, 1823, 40, '#1b1f27', 'Ofertas no link da bio')}
<text x="540" y="1895" font-size="26" fill="#cbd5e1" text-anchor="middle">${AVISO}</text>`;
}

function storyClaro(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1920" fill="#f8fafc"/>
<rect width="1080" height="300" fill="url(#fundo)"/>
${texto(540, 120, 46, '#ffffff', 'ACHADINHOS DO DIA', ' letter-spacing="6"')}
${selo(d, 540, 160, 84, 46, 700, 280)}
<rect x="90" y="330" width="900" height="900" rx="48" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
${foto(d, 130, 370, 820, 820, 64)}
${circuloDesconto(d, 900, 410, 104, 68)}
${linhasDoTitulo(d, 540, 1305, 60, 50, '#0f172a')}
${de(d, 540, 1440, 42, '#64748b')}
<rect y="1480" width="1080" height="440" fill="${d.tema.f2}"/>
${preco(d, 540, 1650, 156)}
${freteBranco(d, 1680, 60, 34)}
<rect x="140" y="1772" width="800" height="84" rx="42" fill="#ffffff"/>
${texto(540, 1829, 38, '#1b1f27', 'Ofertas no link da bio')}
<text x="540" y="1896" font-size="24" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${AVISO}</text>`;
}

const STORIES = [storyClassico, storyPainel, storyClaro];

export function svgDoStory(d: DadosDaArte): string {
  const corpo = STORIES[d.layout % LAYOUTS](d);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

// ───────────────────────── Feed 1080x1350 ─────────────────────────

const cabecalhoDoFeed = (d: DadosDaArte, cor = '#ffffff') =>
  `<text x="60" y="92" font-size="38" font-weight="700" fill="${cor}" letter-spacing="5">ACHADINHOS DO DIA</text>
${d.selo ? pilula(850, 52, 64, 340, VERDE, 32, d.selo) : pilula(910, 52, 64, 220, d.tema.selo, 36, 'OFERTA')}`;

function feedClassico(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="url(#fundo)"/>
${cabecalhoDoFeed(d)}
<rect x="60" y="140" width="960" height="660" rx="48" fill="#ffffff"/>
${foto(d, 190, 170, 700, 600, 60)}
${circuloDesconto(d, 920, 255, 84, 54)}
${linhasDoTitulo(d, 540, 870, 54, 46, '#ffffff')}
${de(d, 540, 980, 38, '#cbd5e1')}
${preco(d, 540, 1120, 124)}
${freteBranco(d, 1146, 52, 30)}
<rect x="140" y="1215" width="800" height="84" rx="42" fill="#ffffff"/>
${texto(540, 1269, 36, '#1b1f27', 'Ofertas no link da bio')}
<text x="540" y="1334" font-size="24" fill="#cbd5e1" text-anchor="middle">${AVISO}</text>`;
}

function feedPainel(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="url(#fundo)"/>
${cabecalhoDoFeed(d)}
<rect x="60" y="140" width="960" height="560" rx="48" fill="#ffffff"/>
${foto(d, 150, 160, 780, 520, 56)}
${circuloDesconto(d, 930, 230, 80, 50)}
<rect x="60" y="725" width="960" height="460" rx="40" fill="#ffffff" fill-opacity="0.13"/>
${linhasDoTitulo(d, 540, 795, 52, 42, '#ffffff')}
${de(d, 540, 905, 36, '#e2e8f0')}
${preco(d, 540, 1050, 124)}
${freteBranco(d, 1085, 52, 30)}
<rect x="140" y="1208" width="800" height="76" rx="38" fill="#ffffff"/>
${texto(540, 1259, 34, '#1b1f27', 'Ofertas no link da bio')}
<text x="540" y="1334" font-size="24" fill="#cbd5e1" text-anchor="middle">${AVISO}</text>`;
}

function feedClaro(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="#f8fafc"/>
<rect width="1080" height="190" fill="url(#fundo)"/>
${cabecalhoDoFeed(d)}
<rect x="60" y="215" width="960" height="560" rx="48" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
${foto(d, 130, 235, 820, 520, 56)}
${circuloDesconto(d, 930, 300, 80, 50)}
${linhasDoTitulo(d, 540, 845, 52, 44, '#0f172a')}
${de(d, 540, 950, 36, '#64748b')}
<rect y="985" width="1080" height="365" fill="${d.tema.f2}"/>
${preco(d, 540, 1125, 120)}
${freteBranco(d, 1150, 50, 30)}
<rect x="140" y="1232" width="800" height="76" rx="38" fill="#ffffff"/>
${texto(540, 1283, 34, '#1b1f27', 'Ofertas no link da bio')}
<text x="540" y="1334" font-size="22" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${AVISO}</text>`;
}

const FEEDS = [feedClassico, feedPainel, feedClaro];

export function svgDoFeed(d: DadosDaArte): string {
  const corpo = FEEDS[d.layout % LAYOUTS](d);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">\n${corpo}\n</svg>`;
}
