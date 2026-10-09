/**
 * Moldes das artes do Instagram, na marca Mata Preço.
 * Regra do formato: a arte NUNCA mostra preço em reais. A pergunta ("CAIU MESMO?") chama a atenção, o produto aparece,
 * e a faixa de baixo manda quem quer o preço para o grupo (link na bio). Um só visual para todos os assuntos.
 * Para mudar o visual da marca, mexa só em MARCA, abaixo.
 */

import { simboloNaArte } from './marca.ts';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Cores e textos fixos da marca. */
export const MARCA = {
  nome: ['MATA', 'PREÇO'],
  /** Fundo, em gradiente de cima para baixo. */
  f1: '#0E0E10',
  f2: '#0E0E10',
  /** Destaque da pergunta e da segunda parte do nome. */
  amarelo: '#FFD60A',
  /** Faixa do grupo e selos de desconto. */
  vermelho: '#E10600',
  /** Selo de "menor preço" (é o que o histórico do robô prova). */
  verde: '#16a34a',
  branco: '#ffffff',
  suave: '#A9A9B3',
  /** Texto da faixa do grupo. */
  faixa: 'O PREÇO ESTÁ NO GRUPO',
  faixaCurta: 'CORRE · ENTRE PELO LINK NA BIO',
  aviso: 'Publi · link de afiliado · preço pode mudar',
};

export type TipoDeGancho = 'historico' | 'desconto' | 'categoria';

export interface DadosDaArte {
  /** Linhas do título já quebradas (sem escapar). */
  titulo: string[];
  /** Desconto em % (0 = sem). Nunca valor em reais. */
  desconto: number;
  /** Gatilho da etiqueta vermelha inclinada ("CORRE!", "SÓ NO GRUPO"...). */
  gatilho?: string;
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
  return `<rect x="${cx - largura / 2}" y="${y}" width="${largura}" height="${h}" rx="${h / 2}" fill="${cor}"${opacidade < 1 ? ` fill-opacity="${opacidade}"` : ''}/>\n${texto(cx, y + h * 0.7, tamanho, cor === MARCA.amarelo ? MARCA.f1 : MARCA.branco, rotulo)}`;
}

export const fundo = (largura: number, altura: number) =>
  `<defs><radialGradient id="brilho" cx="0.85" cy="0" r="0.9"><stop offset="0" stop-color="${MARCA.vermelho}" stop-opacity="0.55"/><stop offset="1" stop-color="${MARCA.vermelho}" stop-opacity="0"/></radialGradient></defs>
<rect width="${largura}" height="${altura}" fill="${MARCA.f1}"/>
<rect width="${largura}" height="${Math.round(altura * 0.5)}" fill="url(#brilho)"/>`;

/** Largura de uma pílula para o texto, com limites (estimativa: cada letra maiúscula em negrito ocupa cerca de 0,68 do tamanho da fonte). */
const larguraDaPilula = (rotulo: string, tamanho: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, Math.round(rotulo.length * tamanho * 0.68 + 72)));

const corDoGancho = (d: DadosDaArte) => (d.ganchoTipo === 'historico' ? MARCA.amarelo : d.ganchoTipo === 'desconto' ? MARCA.vermelho : MARCA.branco);

/** Largura do logo para uma altura (símbolo + "MATA PREÇO"), para centralizar. */
const larguraDoLogo = (altura: number) => altura * 1.02 + Math.round(altura * 0.74) * 0.62 * 5 + altura * 0.15 + Math.round(altura * 0.74) * 0.62 * 5 + altura * 0.26;

/** Logo da marca: símbolo da etiqueta com raio, "MATA" em branco e "PREÇO" em amarelo riscado de vermelho. `x` é o centro (centro) ou o começo (esquerda); `y` é a linha de base do texto. */
export function marca(x: number, y: number, tamanho: number, alinhamento: 'centro' | 'esquerda'): string {
  const altura = Math.round(tamanho * 1.7);
  const t = Math.round(altura * 0.74);
  const largura = larguraDoLogo(altura);
  const x0 = alinhamento === 'centro' ? x - largura / 2 : x;
  const topo = y - altura * 0.76;
  const xMata = x0 + altura * 1.02;
  const xPreco = xMata + t * 0.62 * 5 + t * 0.2;
  const larguraPreco = t * 0.62 * 5 + t * 0.35;
  const meio = topo + altura * 0.5;
  const italico = (px: number, cor: string, s: string) => `<text x="${px}" y="${y}" font-size="${t}" font-weight="700" font-style="italic" fill="${cor}" text-anchor="start">${esc(s)}</text>`;
  return `${simboloNaArte(x0, topo, altura)}
${italico(xMata, MARCA.branco, MARCA.nome[0]!)}
${italico(xPreco, MARCA.amarelo, MARCA.nome[1]!)}
<rect x="${xPreco - 8}" y="${meio - t * 0.06}" width="${larguraPreco + 16}" height="${Math.max(6, Math.round(t * 0.11))}" rx="4" fill="${MARCA.vermelho}" transform="rotate(-4 ${xPreco + larguraPreco / 2} ${meio})"/>`;
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
  const svg = linhas.map((l, i) => texto(540, yTopo + tamanho * 0.85 + i * passo, tamanho, MARCA.amarelo, l, ' font-style="italic"')).join('\n');
  return { svg, altura: Math.round(tamanho * 0.95 + (linhas.length - 1) * passo) };
}

/** Etiqueta de desconto: vermelha, inclinada e com sombra, como no molde da marca. `cx`/`cy` é o centro e `r` o tamanho. */
function circuloDesconto(d: DadosDaArte, cx: number, cy: number, r: number, tamanho: number): string {
  if (!d.desconto) return '';
  const l = Math.round(r * 2.5);
  const h = Math.round(r * 1.3);
  return `<g transform="rotate(-6 ${cx} ${cy})"><rect x="${cx - l / 2}" y="${cy - h / 2 + 8}" width="${l}" height="${h}" rx="18" fill="#A80400"/><rect x="${cx - l / 2}" y="${cy - h / 2}" width="${l}" height="${h}" rx="18" fill="${MARCA.vermelho}"/>${texto(cx, cy + tamanho * 0.34, tamanho, MARCA.branco, `-${d.desconto}%`, ' font-style="italic"')}</g>`;
}

/** Gatilho (urgência, exclusividade): etiqueta amarela pequena no canto de cima da foto. `xEsq` é o canto esquerdo e `cy` o centro. */
function etiquetaDeGatilho(d: DadosDaArte, xEsq: number, cy: number, tamanho: number): string {
  if (!d.gatilho) return '';
  const l = Math.round(d.gatilho.length * tamanho * 0.62 + 44);
  const h = Math.round(tamanho * 1.9);
  const cx = xEsq + l / 2;
  return `<g transform="rotate(-6 ${cx} ${cy})"><rect x="${xEsq}" y="${cy - h / 2}" width="${l}" height="${h}" rx="12" fill="${MARCA.amarelo}"/>${texto(cx, cy + tamanho * 0.34, tamanho, MARCA.f1, d.gatilho, ' font-style="italic"')}</g>`;
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
  return `<rect x="60" y="${y}" width="960" height="${altura}" rx="${Math.round(altura / 4)}" fill="${MARCA.amarelo}"/>
${texto(540, y + altura * 0.48, tamanho, MARCA.f1, MARCA.faixa, ' font-style="italic"')}
${texto(540, y + altura * 0.84, Math.round(tamanho * 0.7), MARCA.vermelho, MARCA.faixaCurta, ' font-style="italic"')}`;
}

const aviso = (y: number, tamanho: number) => `<text x="540" y="${y}" font-size="${tamanho}" font-weight="700" fill="${MARCA.suave}" text-anchor="middle">${MARCA.aviso}</text>`;

// ───────────────────────── Story 1080x1920 ─────────────────────────

/**
 * Área segura do Story: o Instagram cobre o topo (foto e nome do perfil, uns 250 px) e a base (caixa "Enviar mensagem",
 * uns 270 px). Tudo o que importa (pergunta, produto, chamada e o aviso de publi) fica entre as duas. O nome da marca
 * vai embaixo, na área que pode ficar coberta: no topo o próprio Instagram já mostra o perfil.
 */
export const STORY_TOPO_SEGURO = 250;
export const STORY_BASE_SEGURA = 1650;
const Y_FAIXA_DO_STORY = 1470;

export function svgDoStory(d: DadosDaArte): string {
  const tamanhoDoGancho = 42;
  const gancho = pilula(540, 280, 80, larguraDaPilula(d.gancho, tamanhoDoGancho, 300, 900), corDoGancho(d), tamanhoDoGancho, d.gancho, d.ganchoTipo === 'categoria' ? 0.2 : 1);
  const pergunta = perguntaGrande(d.pergunta, 390, 135);
  const yFoto = 390 + pergunta.altura + 36;
  // A foto se ajusta para título e prova social caberem acima do aviso e da faixa do grupo.
  const lado = Math.min(700, Y_FAIXA_DO_STORY - 50 - yFoto - (90 + 60 * d.titulo.length + 16 + 44));
  const yTitulo = yFoto + lado + 90;
  const corpo = `${fundo(1080, 1920)}
${gancho}
${pergunta.svg}
<rect x="${(1080 - lado) / 2}" y="${yFoto}" width="${lado}" height="${lado}" rx="52" fill="${MARCA.branco}"/>
${foto(d, (1080 - lado) / 2 + 28, yFoto + 28, lado - 56, lado - 56, 56)}
${circuloDesconto(d, (1080 + lado) / 2 - 20, yFoto + 40, 96, 62)}
${etiquetaDeGatilho(d, (1080 - lado) / 2 + 24, yFoto + lado - 56, 30)}
${linhasDoTitulo(d, 540, yTitulo, 60, 50, MARCA.branco)}
${apoio(d, 540, yTitulo + 60 * d.titulo.length + 16, 38)}
${aviso(Y_FAIXA_DO_STORY - 25, 28)}
${faixaDoGrupo(Y_FAIXA_DO_STORY, STORY_BASE_SEGURA - Y_FAIXA_DO_STORY, 60)}
${marca(540, 1760, 48, 'centro')}`;
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
${etiquetaDeGatilho(d, (1080 - lado) / 2 + 22, yFoto + lado - 50, 26)}
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

// ───────────────────────── Vitrine do grupo: o que ele entrega ─────────────────────────

/** Fotos em grade (até 4), cada uma num quadro branco. `x0`/`y0` é o canto da grade. */
function gradeDeFotos(fotos: Array<string | undefined>, x0: number, y0: number, lado: number, folga: number, colunas: number): string {
  return fotos
    .slice(0, colunas * 2)
    .map((f, i) => {
      const x = x0 + (i % colunas) * (lado + folga);
      const y = y0 + Math.floor(i / colunas) * (lado + folga);
      return `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="28" fill="${MARCA.branco}"/>${f ? `<image href="${f}" x="${x + 12}" y="${y + 12}" width="${lado - 24}" height="${lado - 24}" preserveAspectRatio="xMidYMid meet"/>` : ''}`;
    })
    .join('\n');
}

/** Faixa de chamada para entrar no grupo (sem preço). */
function faixaEntre(y: number, altura: number, tamanho: number): string {
  return `<rect x="60" y="${y}" width="960" height="${altura}" rx="${Math.round(altura / 4)}" fill="${MARCA.amarelo}"/>
${texto(540, y + altura * 0.48, tamanho, MARCA.f1, 'ENTRE NO GRUPO', ' font-style="italic"')}
${texto(540, y + altura * 0.84, Math.round(tamanho * 0.62), MARCA.vermelho, 'É GRÁTIS · LINK NA BIO', ' font-style="italic"')}`;
}

/** Uma linha de destaque: número ou palavra grande em amarelo e o texto ao lado. */
function linhaDeDestaque(y: number, destaque: string, resto: string): string {
  return `<rect x="60" y="${y}" width="960" height="120" rx="30" fill="${MARCA.branco}" fill-opacity="0.08"/>
${textoEsq(100, y + 80, 58, MARCA.amarelo, destaque)}
${textoEsq(100 + Math.round(destaque.length * 58 * 0.66) + 24, y + 78, 40, MARCA.branco, resto)}`;
}

export interface DadosDoResumo {
  /** Quantos achados o grupo recebeu hoje. */
  achados: number;
  /** Maior desconto confiável do dia, em % (0 = não mostra). */
  maiorDesconto: number;
  /** Quantos estavam no menor preço do histórico (até 30 dias). */
  noMenorPreco: number;
  /** Nomes dos assuntos do dia (até 3). */
  assuntos: string[];
  fotos: Array<string | undefined>;
}

/** Story "Hoje no grupo" (1080x1920): o resumo do que o grupo entregou hoje, para dar vontade de entrar. Sem preço. Respeita a área segura do Story. */
export function svgDoResumoDoDia(d: DadosDoResumo): string {
  const linhas: Array<[string, string]> = [];
  if (d.maiorDesconto > 0) linhas.push([`${d.maiorDesconto}%`, 'foi o maior desconto']);
  if (d.noMenorPreco > 0) linhas.push([String(d.noMenorPreco), 'no menor preço do mês']);
  const assuntos = d.assuntos.slice(0, 3).join(' · ');
  const yAssuntos = 730 + linhas.length * 130 + 60;
  const fotos = d.fotos.slice(0, 4);
  const lado = 200;
  const corpo = `${fundo(1080, 1920)}
${texto(540, 370, 92, MARCA.amarelo, 'HOJE NO GRUPO')}
${texto(540, 600, 230, MARCA.branco, String(d.achados))}
${texto(540, 680, 54, MARCA.branco, d.achados === 1 ? 'achado separado' : 'achados separados')}
${linhas.map(([a, b], i) => linhaDeDestaque(730 + i * 130, a, b)).join('\n')}
${assuntos ? texto(540, yAssuntos, 40, MARCA.suave, assuntos) : ''}
${fotos.length ? texto(540, yAssuntos + 70, 36, MARCA.suave, 'Alguns achados de hoje') : ''}
${gradeDeFotos(fotos, (1080 - (fotos.length * lado + Math.max(fotos.length - 1, 0) * 20)) / 2, yAssuntos + 95, lado, 20, 4)}
${aviso(Y_FAIXA_DO_STORY - 25, 28)}
${faixaEntre(Y_FAIXA_DO_STORY, STORY_BASE_SEGURA - Y_FAIXA_DO_STORY, 64)}
${marca(540, 1760, 48, 'centro')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${FONTE}">\n${corpo}\n</svg>`;
}

export interface DadosDaApresentacao {
  /** Achados separados nos últimos 7 dias. */
  achadosNaSemana: number;
  /** Assuntos (nichos) da semana, em ordem de volume. */
  assuntos: string[];
  /** Regras de verdade do filtro do robô. */
  descontoMinimo: number;
  quedaMinima: number;
  diasDeHistorico: number;
  bloqueadas: string[];
  fotos: Array<string | undefined>;
}

/** Carrossel "Por que entrar no grupo" (1080x1350): capa, o que o grupo entrega (com números reais do robô) e a chamada. */
export function svgsDaApresentacao(d: DadosDaApresentacao): string[] {
  const cabeca = marca(60, 92, 44, 'esquerda');
  const titulo = (linhas: string[], y0: number, tamanho = 84) => linhas.map((l, i) => texto(540, y0 + i * Math.round(tamanho * 1.1), tamanho, MARCA.amarelo, l)).join('\n');
  const corpo = (linhas: string[], y0: number) => linhas.map((l, i) => textoLeve(540, y0 + i * 58, 44, MARCA.branco, l)).join('\n');
  const rodape = (n: number) => texto(540, 1290, 34, MARCA.suave, `${n} de 5 · arraste para o lado`);
  const capa = envolver(`${cabeca}
${texto(540, 330, 64, MARCA.branco, 'POR QUE ENTRAR NO')}
${texto(540, 470, 120, MARCA.amarelo, 'GRUPO')}
<text x="540" y="640" font-size="130" font-weight="900" fill="${MARCA.branco}" text-anchor="middle" letter-spacing="10">${esc(MARCA.nome[0]!)} <tspan fill="${MARCA.amarelo}">${esc(MARCA.nome[1]!)}</tspan></text>
<rect x="290" y="672" width="500" height="14" rx="7" fill="${MARCA.vermelho}"/>
${gradeDeFotos(d.fotos, 160, 760, 170, 20, 4)}
${texto(500, 1060, 48, MARCA.branco, 'Arraste para o lado')}
<polygon points="790,1026 842,1044 790,1062" fill="${MARCA.branco}"/>
${marcador(150, 1150, 56)}${textoEsq(240, 1195, 42, MARCA.branco, 'Salve para ver depois')}`);
  const todoDia = envolver(`${cabeca}
${titulo(['ACHADOS', 'TODO DIA'], 280)}
${texto(540, 650, 220, MARCA.branco, String(d.achadosNaSemana))}
${corpo(['achados separados nos últimos 7 dias,', 'direto no seu WhatsApp'], 760)}
${gradeDeFotos(d.fotos, 160, 920, 170, 20, 4)}
${rodape(2)}`);
  const historico = envolver(`${cabeca}
${titulo(['A GENTE CONFERE', 'O PREÇO'], 300)}
${texto(540, 640, 200, MARCA.branco, `${d.diasDeHistorico}`)}
${texto(540, 730, 60, MARCA.amarelo, 'dias de histórico')}
${corpo(['O robô anota o preço de cada produto todo dia', 'e avisa quando é o menor preço do mês.', 'Se já esteve mais barato no último mês,', 'fica de fora.'], 850)}
${rodape(3)}`);
  const filtro = envolver(`${cabeca}
${titulo(['SÓ ENTRA O QUE', 'PASSA NO FILTRO'], 300)}
${linhaDeDestaque(460, `${d.descontoMinimo}%`, 'de desconto ou mais')}
${texto(540, 630, 40, MARCA.suave, 'ou')}
${linhaDeDestaque(660, `${d.quedaMinima}%`, 'abaixo do próprio histórico')}
${linhaDeDestaque(810, 'Nota', 'e vendas conferidas')}
${d.bloqueadas.length ? corpo([`Nada de ${d.bloqueadas.slice(0, 3).join(', ')}.`], 1030) : ''}
${rodape(4)}`);
  const assuntos = d.assuntos.slice(0, 6);
  const chamada = envolver(`${cabeca}
${titulo(['TUDO SEPARADO', 'POR ASSUNTO'], 260, 76)}
${assuntos.map((a, i) => pilula(i % 2 ? 760 : 320, 400 + Math.floor(i / 2) * 110, 84, 400, MARCA.branco, 38, a, 0.14)).join('\n')}
${texto(540, 830, 54, MARCA.branco, 'Os achados chegam no seu WhatsApp.')}
${texto(540, 905, 44, MARCA.suave, 'E sair é um toque, quando quiser.')}
${faixaEntre(990, 190, 66)}
${aviso(1300, 26)}`);
  return [capa, todoDia, historico, filtro, chamada];
}
