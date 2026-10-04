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

export type TipoDeGancho = 'historico' | 'economia' | 'categoria';

export interface DadosDaArte {
  /** Linhas do título já quebradas (sem escapar). */
  titulo: string[];
  precoTexto: string;
  deTexto?: string;
  desconto: number;
  freteGratis: boolean;
  /** Data URI da foto, se houver. */
  foto?: string;
  /** Selo do topo: o motivo para parar o dedo (menor preço, economia) ou, sem nada melhor, a categoria. */
  gancho: string;
  /** Versão curta para o feed, onde o selo divide a linha com o nome do perfil. */
  ganchoCurto: string;
  ganchoTipo: TipoDeGancho;
  /** Nota e vendas já formatadas ("4,8" e "2 mil"), para mostrar a prova social no próprio card. */
  nota?: string;
  vendas?: string;
  tema: Tema;
  layout: number;
}

const FONTE = 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif';
const VERDE = '#0e9f6e';
const AVISO = 'Publi · link de afiliado · preço pode mudar';

const texto = (x: number, y: number, tamanho: number, cor: string, conteudo: string, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="middle"${extra}>${esc(conteudo)}</text>`;

function pilula(cx: number, y: number, h: number, largura: number, cor: string, tamanho: number, rotulo: string, opacidade = 1): string {
  return `<rect x="${cx - largura / 2}" y="${y}" width="${largura}" height="${h}" rx="${h / 2}" fill="${cor}"${opacidade < 1 ? ` fill-opacity="${opacidade}"` : ''}/>\n${texto(cx, y + h * 0.7, tamanho, '#ffffff', rotulo)}`;
}

function gradiente(id: string, t: Tema): string {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.f1}"/><stop offset="1" stop-color="${t.f2}"/></linearGradient></defs>`;
}

/** Largura de uma pílula para o texto, com limites (estimativa: cada letra maiúscula em negrito ocupa cerca de 0,68 do tamanho da fonte). */
const larguraDaPilula = (rotulo: string, tamanho: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, Math.round(rotulo.length * tamanho * 0.68 + 72)));

const corDoGancho = (d: DadosDaArte) => (d.ganchoTipo === 'historico' ? VERDE : d.ganchoTipo === 'economia' ? d.tema.selo : '#ffffff');

/** Selo central do Story. */
function ganchoDoStory(d: DadosDaArte, y: number): string {
  const tamanho = 44;
  return pilula(540, y, 84, larguraDaPilula(d.gancho, tamanho, 300, 860), corDoGancho(d), tamanho, d.gancho, d.ganchoTipo === 'categoria' ? 0.2 : 1);
}

function circuloDesconto(d: DadosDaArte, cx: number, cy: number, r: number, tamanho: number): string {
  return d.desconto ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e11d48"/>${texto(cx, cy + r * 0.21, tamanho, '#ffffff', `-${d.desconto}%`)}` : '';
}

function foto(d: DadosDaArte, x: number, y: number, w: number, h: number, tamanhoSemFoto: number): string {
  return d.foto
    ? `<image href="${d.foto}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${x + w / 2}" y="${y + h / 2}" font-size="${tamanhoSemFoto}" text-anchor="middle" fill="#98a2b3">Sem foto</text>`;
}

/** Encolhe o preço quando o texto é longo (R$ 1.299,90), para nunca passar da largura da arte. */
const preco = (d: DadosDaArte, x: number, y: number, base: number) => texto(x, y, Math.round(base * Math.min(1, 9.5 / d.precoTexto.length)), d.tema.preco, d.precoTexto);

const de = (d: DadosDaArte, x: number, y: number, tamanho: number, cor: string) =>
  d.deTexto ? `<text x="${x}" y="${y}" font-size="${tamanho}" fill="${cor}" text-anchor="middle" text-decoration="line-through">De ${esc(d.deTexto)}</text>` : '';

function estrela(cx: number, cy: number, r: number): string {
  const pontos = Array.from({ length: 10 }, (_, i) => {
    const angulo = ((-90 + i * 36) * Math.PI) / 180;
    const raio = i % 2 ? r * 0.42 : r;
    return `${(cx + raio * Math.cos(angulo)).toFixed(1)},${(cy + raio * Math.sin(angulo)).toFixed(1)}`;
  });
  return `<polygon points="${pontos.join(' ')}" fill="#ffd34d"/>`;
}

/**
 * Prova social numa linha só: estrela e nota, vendas e frete grátis ("4,8 · 2 mil vendidos · Frete grátis").
 * A estrela é desenhada (não é letra), porque nem toda máquina tem a fonte do símbolo.
 */
function apoio(d: DadosDaArte, cx: number, y: number, tamanho: number): string {
  const partes = [d.nota ?? '', d.vendas ? `${d.vendas} vendidos` : '', d.freteGratis ? 'Frete grátis' : ''].filter(Boolean);
  if (partes.length === 0) return '';
  const linha = partes.join(' · ');
  const larguraDaEstrela = d.nota ? tamanho * 1.15 : 0;
  const total = larguraDaEstrela + linha.length * tamanho * 0.56;
  const x0 = cx - total / 2;
  return `${d.nota ? estrela(x0 + tamanho * 0.5, y - tamanho * 0.34, tamanho * 0.55) : ''}<text x="${(x0 + larguraDaEstrela).toFixed(1)}" y="${y}" font-size="${tamanho}" font-weight="700" fill="#ffffff" text-anchor="start">${esc(linha)}</text>`;
}

const linhasDoTitulo = (d: DadosDaArte, x: number, y0: number, passo: number, tamanho: number, cor: string) =>
  d.titulo.map((l, i) => texto(x, y0 + i * passo, tamanho, cor, l)).join('\n');

/** Chamada em texto simples: um botão desenhado na imagem parece clicável e frustra quem toca nele. */
const chamada = (y: number, tamanho: number) => texto(540, y, tamanho, '#ffffff', 'Link na bio');

const aviso = (y: number, tamanho: number, cor = '#e2e8f0') => `<text x="540" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="middle">${AVISO}</text>`;

// ───────────────────────── Story 1080x1920 ─────────────────────────

function storyClassico(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1920" fill="url(#fundo)"/>
${texto(540, 170, 46, '#ffffff', 'ACHADINHOS DO DIA', ' letter-spacing="6"')}
${ganchoDoStory(d, 215)}
<rect x="90" y="360" width="900" height="900" rx="56" fill="#ffffff"/>
${foto(d, 130, 400, 820, 820, 64)}
${circuloDesconto(d, 900, 440, 104, 68)}
${linhasDoTitulo(d, 540, 1340, 62, 52, '#ffffff')}
${de(d, 540, 1478, 44, '#cbd5e1')}
${preco(d, 540, 1648, 150)}
${apoio(d, 540, 1724, 40)}
${chamada(1824, 52)}
${aviso(1892, 28)}`;
}

function storyPainel(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1920" fill="url(#fundo)"/>
${texto(540, 150, 46, '#ffffff', 'ACHADINHOS DO DIA', ' letter-spacing="6"')}
${ganchoDoStory(d, 195)}
<rect x="140" y="320" width="800" height="800" rx="56" fill="#ffffff"/>
${foto(d, 180, 360, 720, 720, 60)}
${circuloDesconto(d, 880, 400, 96, 62)}
<rect x="70" y="1170" width="940" height="540" rx="48" fill="#ffffff" fill-opacity="0.13"/>
${linhasDoTitulo(d, 540, 1250, 60, 50, '#ffffff')}
${de(d, 540, 1385, 42, '#e2e8f0')}
${preco(d, 540, 1560, 150)}
${apoio(d, 540, 1648, 40)}
${chamada(1822, 52)}
${aviso(1892, 28)}`;
}

function storyClaro(d: DadosDaArte): string {
  return `${gradiente('fundo', d.tema)}
<rect width="1080" height="1920" fill="#f8fafc"/>
<rect width="1080" height="300" fill="url(#fundo)"/>
${texto(540, 120, 46, '#ffffff', 'ACHADINHOS DO DIA', ' letter-spacing="6"')}
${ganchoDoStory(d, 160)}
<rect x="90" y="330" width="900" height="900" rx="48" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
${foto(d, 130, 370, 820, 820, 64)}
${circuloDesconto(d, 900, 410, 104, 68)}
${linhasDoTitulo(d, 540, 1305, 60, 50, '#0f172a')}
${de(d, 540, 1440, 42, '#64748b')}
<rect y="1480" width="1080" height="440" fill="${d.tema.f2}"/>
${preco(d, 540, 1650, 156)}
${apoio(d, 540, 1728, 40)}
${chamada(1826, 52)}
${aviso(1894, 28)}`;
}

const STORIES = [storyClassico, storyPainel, storyClaro];

export function svgDoStory(d: DadosDaArte): string {
  const corpo = STORIES[d.layout % LAYOUTS](d);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

// ───────────────────────── Feed 1080x1350 ─────────────────────────

/** Nome do perfil à esquerda e o selo à direita, sem passar de 400 px para deixar uma folga em relação ao nome. */
const cabecalhoDoFeed = (d: DadosDaArte) => {
  const tamanho = 30;
  const largura = larguraDaPilula(d.ganchoCurto, tamanho, 220, 400);
  return `<text x="60" y="92" font-size="34" font-weight="700" fill="#ffffff" letter-spacing="4">ACHADINHOS DO DIA</text>
${pilula(1020 - largura / 2, 52, 64, largura, corDoGancho(d), tamanho, d.ganchoCurto, d.ganchoTipo === 'categoria' ? 0.2 : 1)}`;
};

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
${apoio(d, 540, 1186, 34)}
${chamada(1266, 42)}
${aviso(1334, 26)}`;
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
${apoio(d, 540, 1124, 34)}
${chamada(1262, 40)}
${aviso(1334, 26)}`;
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
${apoio(d, 540, 1192, 34)}
${chamada(1272, 40)}
${aviso(1334, 24)}`;
}

export interface DadosDaCapa {
  /** Quantos produtos o carrossel traz ("TOP 5"). */
  total: number;
  /** Teto de preço do carrossel ("ATÉ R$ 100"). */
  teto: number;
  /** Fotos dos produtos, mostradas em fileira (até 5). */
  fotos: Array<string | undefined>;
  tema: Tema;
}

/** Primeira imagem do carrossel (1080x1350): o que o carrossel promete, com as fotos dos produtos à vista. */
export function svgDaCapaDoCarrossel(d: DadosDaCapa): string {
  const fotos = d.fotos.slice(0, 5);
  const lado = 170;
  const folga = 20;
  const largura = fotos.length * lado + Math.max(fotos.length - 1, 0) * folga;
  const x0 = (1080 - largura) / 2;
  const cartoes = fotos
    .map((f, i) => {
      const x = x0 + i * (lado + folga);
      return `<rect x="${x}" y="800" width="${lado}" height="${lado}" rx="28" fill="#ffffff"/>${f ? `<image href="${f}" x="${x + 10}" y="810" width="${lado - 20}" height="${lado - 20}" preserveAspectRatio="xMidYMid meet"/>` : ''}`;
    })
    .join('\n');
  const corpo = `${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="url(#fundo)"/>
<text x="60" y="92" font-size="38" font-weight="700" fill="#ffffff" letter-spacing="5">ACHADINHOS DO DIA</text>
${texto(540, 430, 250, '#ffffff', `TOP ${d.total}`)}
${texto(540, 580, 120, d.tema.preco, `ATÉ R$ ${d.teto}`)}
${texto(540, 680, 46, '#ffffff', 'Bem avaliados e muito vendidos')}
${texto(540, 740, 38, '#e2e8f0', 'separados hoje para você')}
${cartoes}
${texto(540, 1090, 52, '#ffffff', 'Arraste para o lado')}
<polygon points="860,1054 912,1072 860,1090" fill="#ffffff"/>
${chamada(1230, 44)}
${aviso(1334, 26)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

const FEEDS = [feedClassico, feedPainel, feedClaro];

export function svgDoFeed(d: DadosDaArte): string {
  const corpo = FEEDS[d.layout % LAYOUTS](d);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

// ───────────────────────── Carrossel "Antes de comprar" (1080x1350) ─────────────────────────

const textoEsq = (x: number, y: number, tamanho: number, cor: string, conteudo: string) =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="start">${esc(conteudo)}</text>`;

/** Marcador de "salvar": contorno de um marcador de página, desenhado (sem depender de fonte de símbolos). */
const marcador = (x: number, y: number, altura: number) => {
  const l = altura * 0.72;
  return `<polygon points="${x},${y} ${x + l},${y} ${x + l},${y + altura} ${x + l / 2},${y + altura - altura * 0.22} ${x},${y + altura}" fill="#ffffff"/>`;
};

const envolver = (corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">\n${corpo}\n</svg>`;

export interface DadosDaCapaDaDica {
  /** Quantos critérios o carrossel traz ("5 coisas"). */
  numero: number;
  /** O produto, em linhas já quebradas ("fones de ouvido", "bluetooth"). */
  assunto: string[];
  tema: Tema;
}

/** Capa: promete algo útil e pede para salvar (salvamento pesa no alcance). */
export function svgDaCapaDaDica(d: DadosDaCapaDaDica): string {
  return envolver(`${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="url(#fundo)"/>
<text x="60" y="92" font-size="34" font-weight="700" fill="#ffffff" letter-spacing="4">ACHADINHOS DO DIA</text>
${texto(540, 300, 52, d.tema.preco, 'ANTES DE COMPRAR', ' letter-spacing="6"')}
${texto(540, 640, 380, '#ffffff', String(d.numero))}
${texto(540, 745, 84, '#ffffff', 'coisas para olhar')}
${d.assunto.map((l, i) => texto(540, 855 + i * 92, 80, d.tema.preco, l)).join('\n')}
${marcador(150, 1090, 56)}${textoEsq(240, 1135, 42, '#ffffff', 'Salve para consultar na hora')}
${texto(500, 1232, 48, '#ffffff', 'Arraste para o lado')}
<polygon points="790,1198 842,1216 790,1234" fill="#ffffff"/>`);
}

export interface DadosDoCriterio {
  posicao: number;
  total: number;
  /** Texto do critério já quebrado em linhas, e o tamanho da fonte que cabe. */
  linhas: string[];
  tamanho: number;
  assunto: string;
  tema: Tema;
}

/** Um critério por imagem: número grande e frase curta, legível no celular. */
export function svgDoCriterio(d: DadosDoCriterio): string {
  const passo = Math.round(d.tamanho * 1.28);
  // O texto fica centralizado na área livre entre o assunto (y 600) e o rodapé (y 1150), qualquer que seja o número de linhas.
  const yInicial = Math.round(600 + (550 - d.linhas.length * passo) / 2 + d.tamanho * 0.8);
  return envolver(`${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="url(#fundo)"/>
<text x="60" y="92" font-size="34" font-weight="700" fill="#ffffff" letter-spacing="4">ACHADINHOS DO DIA</text>
<circle cx="540" cy="330" r="130" fill="${d.tema.preco}"/>
${texto(540, 398, 190, d.tema.f1, String(d.posicao))}
${texto(540, 560, 38, '#e2e8f0', d.assunto.toUpperCase())}
${d.linhas.map((l, i) => texto(540, yInicial + i * passo, d.tamanho, '#ffffff', l)).join('\n')}
${texto(540, 1190, 38, '#e2e8f0', `${d.posicao} de ${d.total}`)}
${marcador(250, 1245, 46)}${textoEsq(320, 1284, 36, '#ffffff', 'Salve este post')}`);
}

export interface DadosDoFechamento {
  /** "de fones de ouvido bluetooth", em linhas. */
  assunto: string[];
  itens: Array<{ foto?: string; linhas: string[]; precoTexto: string; nota?: string; vendas?: string }>;
  tema: Tema;
}

/** Última imagem: os 3 primeiros do guia, com foto, preço e prova social, e a chamada para o guia completo. */
export function svgDoFechamentoDaDica(d: DadosDoFechamento): string {
  const linhas = d.itens.slice(0, 3).map((it, i) => {
    const y = 330 + i * 300;
    const partes = [it.nota ?? '', it.vendas ? `${it.vendas} vendidos` : ''].filter(Boolean).join(' · ');
    const estrelaX = 330;
    return `<rect x="60" y="${y}" width="960" height="270" rx="36" fill="#ffffff"/>
${it.foto ? `<image href="${it.foto}" x="84" y="${y + 25}" width="220" height="220" preserveAspectRatio="xMidYMid meet"/>` : ''}
<rect x="${330}" y="${y + 18}" width="76" height="40" rx="20" fill="${d.tema.f2}"/>${texto(368, y + 47, 28, '#ffffff', `#${i + 1}`)}
${it.linhas.slice(0, 2).map((l, k) => textoEsq(330, y + 98 + k * 40, 36, '#0f172a', l)).join('\n')}
${textoEsq(330, y + 206, 54, d.tema.f2, it.precoTexto)}
${partes ? `${it.nota ? estrela(estrelaX + 14, y + 238, 14) : ''}${textoEsq(estrelaX + (it.nota ? 38 : 0), y + 248, 30, '#475569', partes)}` : ''}`;
  });
  return envolver(`${gradiente('fundo', d.tema)}
<rect width="1080" height="1350" fill="url(#fundo)"/>
<text x="60" y="92" font-size="34" font-weight="700" fill="#ffffff" letter-spacing="4">ACHADINHOS DO DIA</text>
${texto(540, 200, 66, '#ffffff', 'Os 3 do nosso guia')}
${d.assunto.map((l, i) => texto(540, 262 + i * 50, 44, d.tema.preco, l)).join('\n')}
${linhas.join('\n')}
${chamada(1268, 46)}
${aviso(1334, 24)}`);
}
