/**
 * Moldes das artes do Instagram, na marca Mata Preço.
 * Regra do formato: a arte NUNCA mostra preço em reais. A pergunta ("CAIU MESMO?") chama a atenção, o produto aparece,
 * e a faixa de baixo manda quem quer o preço para o grupo (link na bio). Um só visual para todos os assuntos.
 * Para mudar o visual da marca, mexa só em MARCA, abaixo.
 */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Cores e textos fixos da marca. */
export const MARCA = {
  nome: ['MATA', 'PREÇO'],
  /** Fundo, em gradiente de cima para baixo. */
  f1: '#0b1220',
  f2: '#1b1442',
  /** Destaque da pergunta e da segunda parte do nome. */
  amarelo: '#ffd60a',
  /** Faixa do grupo e selos de desconto. */
  vermelho: '#e11d48',
  /** Selo de "menor preço" (é o que o histórico do robô prova). */
  verde: '#16a34a',
  branco: '#ffffff',
  suave: '#cbd5e1',
  /** Texto da faixa do grupo. */
  faixa: 'O PREÇO ESTÁ NO GRUPO',
  faixaCurta: 'LINK NA BIO',
  aviso: 'Publi · link de afiliado · preço pode mudar',
};

export type TipoDeGancho = 'historico' | 'desconto' | 'categoria';

export interface DadosDaArte {
  /** Linhas do título já quebradas (sem escapar). */
  titulo: string[];
  /** Desconto em % (0 = sem). Nunca valor em reais. */
  desconto: number;
  freteGratis: boolean;
  /** Data URI da foto, se houver. */
  foto?: string;
  /** Selo do topo: o motivo para parar o dedo (menor preço, desconto) ou, sem nada melhor, a categoria. */
  gancho: string;
  /** Versão curta para o feed, onde o selo divide a linha com o nome da marca. */
  ganchoCurto: string;
  ganchoTipo: TipoDeGancho;
  /** A pergunta grande da arte ("CAIU MESMO?" ou "QUANTO CUSTA AGORA?"). */
  pergunta: string;
  /** Nota e vendas já formatadas ("4,8" e "2 mil"), para mostrar a prova social no próprio card. */
  nota?: string;
  vendas?: string;
}

const FONTE = 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif';

const texto = (x: number, y: number, tamanho: number, cor: string, conteudo: string, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="middle"${extra}>${esc(conteudo)}</text>`;

const textoEsq = (x: number, y: number, tamanho: number, cor: string, conteudo: string) =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="start">${esc(conteudo)}</text>`;

const textoLeve = (x: number, y: number, tamanho: number, cor: string, conteudo: string) =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="400" fill="${cor}" text-anchor="middle">${esc(conteudo)}</text>`;

function pilula(cx: number, y: number, h: number, largura: number, cor: string, tamanho: number, rotulo: string, opacidade = 1): string {
  return `<rect x="${cx - largura / 2}" y="${y}" width="${largura}" height="${h}" rx="${h / 2}" fill="${cor}"${opacidade < 1 ? ` fill-opacity="${opacidade}"` : ''}/>\n${texto(cx, y + h * 0.7, tamanho, MARCA.branco, rotulo)}`;
}

const fundo = (largura: number, altura: number) =>
  `<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${MARCA.f1}"/><stop offset="1" stop-color="${MARCA.f2}"/></linearGradient></defs>\n<rect width="${largura}" height="${altura}" fill="url(#fundo)"/>`;

/** Largura de uma pílula para o texto, com limites (estimativa: cada letra maiúscula em negrito ocupa cerca de 0,68 do tamanho da fonte). */
const larguraDaPilula = (rotulo: string, tamanho: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, Math.round(rotulo.length * tamanho * 0.68 + 72)));

const corDoGancho = (d: DadosDaArte) => (d.ganchoTipo === 'historico' ? MARCA.verde : d.ganchoTipo === 'desconto' ? MARCA.vermelho : MARCA.branco);

/** Nome da marca: "MATA" em branco e "PREÇO" em amarelo, com um traço vermelho embaixo. `x` é o centro (centro) ou o começo (esquerda). */
function marca(x: number, y: number, tamanho: number, alinhamento: 'centro' | 'esquerda'): string {
  const largura = Math.round(MARCA.nome.join(' ').length * tamanho * 0.7);
  const x0 = alinhamento === 'centro' ? x - largura / 2 : x;
  return `<text x="${x0}" y="${y}" font-size="${tamanho}" font-weight="900" fill="${MARCA.branco}" text-anchor="start" letter-spacing="${Math.round(tamanho * 0.08)}">${esc(MARCA.nome[0]!)} <tspan fill="${MARCA.amarelo}">${esc(MARCA.nome[1]!)}</tspan></text>
<rect x="${x0}" y="${y + tamanho * 0.18}" width="${Math.round(largura * 0.62)}" height="${Math.max(6, Math.round(tamanho * 0.1))}" rx="${Math.max(3, Math.round(tamanho * 0.05))}" fill="${MARCA.vermelho}"/>`;
}

/** Quebra a pergunta em até duas linhas, no meio, sem cortar palavra. */
export function linhasDaPergunta(pergunta: string): string[] {
  if (pergunta.length <= 12) return [pergunta];
  const palavras = pergunta.split(' ');
  let melhor = [pergunta];
  let menorDiferenca = Infinity;
  for (let i = 1; i < palavras.length; i++) {
    const a = palavras.slice(0, i).join(' ');
    const b = palavras.slice(i).join(' ');
    const diferenca = Math.abs(a.length - b.length);
    if (diferenca <= menorDiferenca) {
      menorDiferenca = diferenca;
      melhor = [a, b];
    }
  }
  return melhor;
}

/** A pergunta grande, centralizada, encolhendo para nunca passar da largura da arte. Devolve o desenho e a altura que ocupa. */
function perguntaGrande(pergunta: string, yTopo: number, base: number): { svg: string; altura: number } {
  const linhas = linhasDaPergunta(pergunta);
  const maior = Math.max(...linhas.map((l) => l.length));
  const tamanho = Math.min(base, Math.floor(960 / (maior * 0.7)));
  const passo = Math.round(tamanho * 1.08);
  const svg = linhas.map((l, i) => texto(540, yTopo + tamanho * 0.85 + i * passo, tamanho, MARCA.amarelo, l)).join('\n');
  return { svg, altura: Math.round(tamanho * 0.95 + (linhas.length - 1) * passo) };
}

function circuloDesconto(d: DadosDaArte, cx: number, cy: number, r: number, tamanho: number): string {
  return d.desconto ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${MARCA.vermelho}"/>${texto(cx, cy + r * 0.21, tamanho, MARCA.branco, `-${d.desconto}%`)}` : '';
}

function foto(d: DadosDaArte, x: number, y: number, w: number, h: number, tamanhoSemFoto: number): string {
  return d.foto
    ? `<image href="${d.foto}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${x + w / 2}" y="${y + h / 2}" font-size="${tamanhoSemFoto}" text-anchor="middle" fill="#98a2b3">Sem foto</text>`;
}

function estrela(cx: number, cy: number, r: number): string {
  const pontos = Array.from({ length: 10 }, (_, i) => {
    const angulo = ((-90 + i * 36) * Math.PI) / 180;
    const raio = i % 2 ? r * 0.42 : r;
    return `${(cx + raio * Math.cos(angulo)).toFixed(1)},${(cy + raio * Math.sin(angulo)).toFixed(1)}`;
  });
  return `<polygon points="${pontos.join(' ')}" fill="${MARCA.amarelo}"/>`;
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
  return `${d.nota ? estrela(x0 + tamanho * 0.5, y - tamanho * 0.34, tamanho * 0.55) : ''}<text x="${(x0 + larguraDaEstrela).toFixed(1)}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${MARCA.branco}" text-anchor="start">${esc(linha)}</text>`;
}

const linhasDoTitulo = (d: DadosDaArte, x: number, y0: number, passo: number, tamanho: number, cor: string) =>
  d.titulo.map((l, i) => texto(x, y0 + i * passo, tamanho, cor, l)).join('\n');

/** Faixa que leva ao grupo, onde está o preço. É texto, não botão: um botão desenhado parece clicável e frustra quem toca nele. */
function faixaDoGrupo(y: number, altura: number, tamanho: number): string {
  return `<rect x="60" y="${y}" width="960" height="${altura}" rx="${Math.round(altura / 4)}" fill="${MARCA.vermelho}"/>
${texto(540, y + altura * 0.48, tamanho, MARCA.branco, MARCA.faixa)}
${texto(540, y + altura * 0.84, Math.round(tamanho * 0.78), MARCA.amarelo, MARCA.faixaCurta)}`;
}

const aviso = (y: number, tamanho: number) => `<text x="540" y="${y}" font-size="${tamanho}" font-weight="700" fill="${MARCA.suave}" text-anchor="middle">${MARCA.aviso}</text>`;

// ───────────────────────── Story 1080x1920 ─────────────────────────

export function svgDoStory(d: DadosDaArte): string {
  const tamanhoDoGancho = 44;
  const gancho = pilula(540, 215, 84, larguraDaPilula(d.gancho, tamanhoDoGancho, 300, 900), corDoGancho(d), tamanhoDoGancho, d.gancho, d.ganchoTipo === 'categoria' ? 0.2 : 1);
  const pergunta = perguntaGrande(d.pergunta, 340, 150);
  const yFoto = 340 + pergunta.altura + 50;
  // A foto encolhe se a pergunta ocupar duas linhas: título e prova social precisam caber acima da faixa do grupo (y 1660).
  const lado = Math.min(760, 1630 - yFoto - (100 + 62 * d.titulo.length + 20 + 50));
  const yTitulo = yFoto + lado + 100;
  const corpo = `${fundo(1080, 1920)}
${marca(540, 150, 62, 'centro')}
${gancho}
${pergunta.svg}
<rect x="${(1080 - lado) / 2}" y="${yFoto}" width="${lado}" height="${lado}" rx="56" fill="${MARCA.branco}"/>
${foto(d, (1080 - lado) / 2 + 30, yFoto + 30, lado - 60, lado - 60, 60)}
${circuloDesconto(d, (1080 + lado) / 2 - 20, yFoto + 40, 100, 66)}
${linhasDoTitulo(d, 540, yTitulo, 62, 52, MARCA.branco)}
${apoio(d, 540, yTitulo + 62 * d.titulo.length + 20, 40)}
${faixaDoGrupo(1660, 190, 62)}
${aviso(1892, 28)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

// ───────────────────────── Feed 1080x1350 ─────────────────────────

export function svgDoFeed(d: DadosDaArte): string {
  const tamanhoDoGancho = 30;
  const larguraDoGancho = larguraDaPilula(d.ganchoCurto, tamanhoDoGancho, 220, 400);
  const gancho = pilula(1020 - larguraDoGancho / 2, 50, 64, larguraDoGancho, corDoGancho(d), tamanhoDoGancho, d.ganchoCurto, d.ganchoTipo === 'categoria' ? 0.2 : 1);
  const pergunta = perguntaGrande(d.pergunta, 130, 112);
  const yFoto = 130 + pergunta.altura + 36;
  // Idem no feed: a faixa do grupo começa em y 1130.
  const lado = Math.min(570, 1100 - yFoto - (66 + 52 * d.titulo.length + 14 + 44));
  const yTitulo = yFoto + lado + 66;
  const corpo = `${fundo(1080, 1350)}
${marca(60, 92, 44, 'esquerda')}
${gancho}
${pergunta.svg}
<rect x="${(1080 - lado) / 2}" y="${yFoto}" width="${lado}" height="${lado}" rx="44" fill="${MARCA.branco}"/>
${foto(d, (1080 - lado) / 2 + 24, yFoto + 24, lado - 48, lado - 48, 52)}
${circuloDesconto(d, (1080 + lado) / 2 - 20, yFoto + 36, 80, 52)}
${linhasDoTitulo(d, 540, yTitulo, 52, 44, MARCA.branco)}
${apoio(d, 540, yTitulo + 52 * d.titulo.length + 14, 34)}
${faixaDoGrupo(1130, 160, 52)}
${aviso(1334, 26)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

// ───────────────────────── Carrossel "Antes de comprar" (1080x1350) ─────────────────────────

/** Marcador de "salvar": contorno de um marcador de página, desenhado (sem depender de fonte de símbolos). */
const marcador = (x: number, y: number, altura: number) => {
  const l = altura * 0.72;
  return `<polygon points="${x},${y} ${x + l},${y} ${x + l},${y + altura} ${x + l / 2},${y + altura - altura * 0.22} ${x},${y + altura}" fill="${MARCA.branco}"/>`;
};

const envolver = (corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">\n${fundo(1080, 1350)}\n${corpo}\n</svg>`;

export interface DadosDaCapaDaDica {
  /** Quantos critérios o carrossel traz ("5 coisas"). */
  numero: number;
  /** O produto, em linhas já quebradas ("fones de ouvido", "bluetooth"). */
  assunto: string[];
}

/** Capa: promete algo útil e pede para salvar (salvamento pesa no alcance). */
export function svgDaCapaDaDica(d: DadosDaCapaDaDica): string {
  return envolver(`${marca(60, 92, 44, 'esquerda')}
${texto(540, 300, 52, MARCA.amarelo, 'ANTES DE COMPRAR', ' letter-spacing="6"')}
${texto(540, 640, 380, MARCA.branco, String(d.numero))}
${texto(540, 745, 84, MARCA.branco, 'coisas para olhar')}
${d.assunto.map((l, i) => texto(540, 855 + i * 92, 80, MARCA.amarelo, l)).join('\n')}
${marcador(150, 1090, 56)}${textoEsq(240, 1135, 42, MARCA.branco, 'Salve para consultar na hora')}
${texto(500, 1232, 48, MARCA.branco, 'Arraste para o lado')}
<polygon points="790,1198 842,1216 790,1234" fill="${MARCA.branco}"/>`);
}

export interface DadosDoCriterio {
  posicao: number;
  total: number;
  /** O critério (título) e a explicação prática, já quebrados em linhas; e o tamanho de fonte do título. */
  titulo: string[];
  tamanhoDoTitulo: number;
  explicacao: string[];
  assunto: string;
}

/** Um critério por imagem: número, o critério em destaque e, embaixo, a explicação de como decidir. */
export function svgDoCriterio(d: DadosDoCriterio): string {
  const passoDoTitulo = Math.round(d.tamanhoDoTitulo * 1.22);
  const passoDaExplicacao = 54;
  const altura = d.titulo.length * passoDoTitulo + 40 + d.explicacao.length * passoDaExplicacao;
  // O conteúdo fica centralizado na área livre entre o assunto (y 540) e o rodapé (y 1150).
  const topo = Math.round(540 + (610 - altura) / 2);
  const yTitulo = topo + Math.round(d.tamanhoDoTitulo * 0.85);
  const yExplicacao = topo + d.titulo.length * passoDoTitulo + 40 + 40;
  return envolver(`${marca(60, 92, 44, 'esquerda')}
<circle cx="540" cy="290" r="108" fill="${MARCA.amarelo}"/>
${texto(540, 350, 156, MARCA.f1, String(d.posicao))}
${texto(540, 480, 34, MARCA.suave, d.assunto.toUpperCase())}
${d.titulo.map((l, i) => texto(540, yTitulo + i * passoDoTitulo, d.tamanhoDoTitulo, MARCA.amarelo, l)).join('\n')}
${d.explicacao.map((l, i) => textoLeve(540, yExplicacao + i * passoDaExplicacao, 40, MARCA.branco, l)).join('\n')}
${texto(540, 1190, 38, MARCA.suave, `${d.posicao} de ${d.total}`)}
${marcador(250, 1245, 46)}${textoEsq(320, 1284, 36, MARCA.branco, 'Salve este post')}`);
}

export interface DadosDoFechamento {
  /** "de fones de ouvido bluetooth", em linhas. */
  assunto: string[];
  itens: Array<{ foto?: string; linhas: string[]; nota?: string; vendas?: string }>;
}

/** Última imagem: os 3 primeiros do guia, com foto e prova social (sem preço), e a faixa que leva ao grupo. */
export function svgDoFechamentoDaDica(d: DadosDoFechamento): string {
  const linhas = d.itens.slice(0, 3).map((it, i) => {
    const y = 330 + i * 250;
    const partes = [it.nota ?? '', it.vendas ? `${it.vendas} vendidos` : ''].filter(Boolean).join(' · ');
    return `<rect x="60" y="${y}" width="960" height="224" rx="36" fill="${MARCA.branco}"/>
${it.foto ? `<image href="${it.foto}" x="84" y="${y + 20}" width="184" height="184" preserveAspectRatio="xMidYMid meet"/>` : ''}
<rect x="300" y="${y + 20}" width="76" height="40" rx="20" fill="${MARCA.vermelho}"/>${texto(338, y + 49, 28, MARCA.branco, `#${i + 1}`)}
${it.linhas.slice(0, 2).map((l, k) => textoEsq(300, y + 108 + k * 42, 38, '#0f172a', l)).join('\n')}
${partes ? `${it.nota ? estrela(314, y + 190, 14) : ''}${textoEsq(it.nota ? 338 : 300, y + 200, 32, '#475569', partes)}` : ''}`;
  });
  return envolver(`${marca(60, 92, 44, 'esquerda')}
${texto(540, 200, 66, MARCA.branco, 'Os 3 do nosso guia')}
${d.assunto.map((l, i) => texto(540, 262 + i * 50, 44, MARCA.amarelo, l)).join('\n')}
${linhas.join('\n')}
${faixaDoGrupo(1100, 170, 52)}
${aviso(1334, 24)}`);
}
