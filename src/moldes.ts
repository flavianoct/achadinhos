/**
 * Moldes das artes do Instagram, na marca Mata Preço.
 * Regra do formato: a arte NUNCA mostra preço em reais (o preço muda a toda hora; um valor velho na imagem seria propaganda enganosa).
 * O que chama a atenção é o que é verdade por mais tempo: o produto grande, o selo (desconto em % só quando o nosso histórico confirma o
 * preço "de", menor preço, em alta), a prova real (nota, vendidos, frete) e a chamada "comenta QUERO", que leva o link e o preço ao direct.
 * Cada nicho tem a sua cor, para o perfil não parecer um catálogo.
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
  faixaCurta: 'ENTRE PELO LINK NA BIO',
  aviso: 'Publi · link de afiliado · preço pode mudar',
};

export type TipoDeGancho = 'historico' | 'desconto' | 'categoria';

export interface DadosDaArte {
  /** Linhas do título já quebradas (sem escapar). */
  titulo: string[];
  /** Não usado: a arte não mostra valor nenhum (nem em reais nem em %). */
  desconto: number;
  /** Gatilho da etiqueta vermelha grande, inclinada (urgência: "CORRE!", "VAI SUMIR"...). */
  gatilho?: string;
  /** Gatilho da etiqueta amarela pequena (exclusividade: "SÓ NO GRUPO", "VEJA PRIMEIRO NO GRUPO"...). */
  gatilho2?: string;
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
  /** Cor de destaque do nicho (o brilho do fundo). */
  cor?: string;
  /** Selo do canto da foto: desconto confirmado ("-45%"), menor preço ou "EM ALTA". Sem selo, a etiqueta "?" faz a curiosidade. */
  selo?: { texto: string; tipo: 'desconto' | 'historico' | 'febre' };
  /** Chamada do pé da arte: a linha grande e a linha pequena ("COMENTA "QUERO"" / "QUE EU TE MANDO O LINK NO DIRECT"). */
  chamada?: { linha: string; apoio: string };
}

/** Cor de cada nicho no brilho do fundo da arte. */
export const CORES_DO_NICHO: Record<string, string> = {
  tech: '#2563EB',
  casa: '#059669',
  games: '#7C3AED',
  beleza: '#DB2777',
  moda: '#E11D48',
  esporte: '#16A34A',
  pet: '#EA580C',
  bebe: '#0EA5E9',
  ferramentas: '#D97706',
  geral: '#E10600',
};

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

export const fundo = (largura: number, altura: number, cor: string = MARCA.vermelho) =>
  `<defs><radialGradient id="brilho" cx="0.85" cy="0" r="0.9"><stop offset="0" stop-color="${cor}" stop-opacity="0.6"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></radialGradient></defs>
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

/** Etiqueta vermelha inclinada com um gatilho (urgência, exclusividade), como no molde da marca. `cx`/`cy` é o centro e `r` o tamanho. */
function circuloDesconto(d: DadosDaArte, cx: number, cy: number, r: number, tamanho: number): string {
  if (!d.gatilho) return '';
  const fonte = Math.round(tamanho * (d.gatilho.length > 10 ? 0.62 : 0.85));
  const l = Math.min(520, Math.max(Math.round(r * 2.4), Math.round(d.gatilho.length * fonte * 0.62 + 56)));
  const h = Math.round(r * 1.1);
  return `<g transform="rotate(-6 ${cx} ${cy})"><rect x="${cx - l / 2}" y="${cy - h / 2 + 8}" width="${l}" height="${h}" rx="18" fill="#A80400"/><rect x="${cx - l / 2}" y="${cy - h / 2}" width="${l}" height="${h}" rx="18" fill="${MARCA.vermelho}"/>${texto(cx, cy + fonte * 0.34, fonte, MARCA.branco, d.gatilho, ' font-style="italic"')}</g>`;
}

/** Etiqueta amarela pequena com o gatilho de exclusividade, no canto de baixo da foto. `xEsq` é o canto esquerdo e `cy` o centro. */
function etiquetaDeExclusividade(d: DadosDaArte, xEsq: number, cy: number, tamanho: number): string {
  if (!d.gatilho2) return '';
  const l = Math.round(d.gatilho2.length * tamanho * 0.62 + 44);
  const h = Math.round(tamanho * 1.9);
  const cx = xEsq + l / 2;
  return `<g transform="rotate(-6 ${cx} ${cy})"><rect x="${xEsq}" y="${cy - h / 2}" width="${l}" height="${h}" rx="12" fill="${MARCA.amarelo}"/>${texto(cx, cy + tamanho * 0.34, tamanho, MARCA.f1, d.gatilho2, ' font-style="italic"')}</g>`;
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
/** Chamada final clean: uma linha amarela e o "link na bio" pequeno embaixo. Sem caixa, sem bloco: o produto e a pergunta é que chamam a atenção. */
function chamadaLimpa(y: number, altura: number, tamanho: number, linha: string, apoio: string): string {
  const yLinha = y + altura * 0.5;
  return `${texto(540, yLinha, tamanho, MARCA.amarelo, linha, ' font-style="italic"')}
${texto(540, yLinha + Math.round(tamanho * 0.75), Math.max(24, Math.round(tamanho * 0.44)), MARCA.branco, apoio, ' letter-spacing="4"')}`;
}

function faixaDoGrupo(y: number, altura: number, tamanho: number): string {
  return chamadaLimpa(y, altura, tamanho, MARCA.faixa, MARCA.faixaCurta);
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

/**
 * Arte do post (Story e feed): clean, com o produto como herói e uma curiosidade só. A foto ocupa quase tudo; uma etiqueta de preço
 * amarela com "?" no canto da foto diz que existe um preço para descobrir (o valor nunca aparece), e uma única pergunta ("QUANTO CUSTA
 * AGORA?") fecha o post. Além disso, só o logo pequeno, o nome curto do produto e a linha de publi. Sem adesivos sobre o produto,
 * sem estatísticas e sem blocos grandes: quem vê precisa sentir vontade de ver o produto e o preço.
 */
function etiquetaDePreco(cx: number, cy: number, escala: number): string {
  // Etiqueta de preço com furo e um "?": o formato já conta a história sem escrever o valor.
  return `<g transform="translate(${cx} ${cy}) rotate(-8) scale(${escala})">
<path d="M-96,-54 H34 L104,0 L34,54 H-96 Q-112,54 -112,38 V-38 Q-112,-54 -96,-54 Z" fill="${MARCA.amarelo}" stroke="${MARCA.f1}" stroke-width="7" stroke-linejoin="round"/>
<circle cx="64" cy="0" r="11" fill="${MARCA.f1}"/>
${texto(-26, 26, 76, MARCA.f1, '?')}
</g>`;
}

/** Selo do canto da foto. Desconto: um círculo vermelho grande ("-45%" / "OFF"). Menor preço e em alta: uma pílula. */
function seloDaFoto(d: DadosDaArte, xDir: number, yTopo: number): string {
  if (!d.selo) return '';
  if (d.selo.tipo === 'desconto') {
    const cx = xDir - 92;
    const cy = yTopo + 92;
    return `<g transform="rotate(-8 ${cx} ${cy})"><circle cx="${cx}" cy="${cy + 6}" r="104" fill="#A80400"/><circle cx="${cx}" cy="${cy}" r="104" fill="${MARCA.vermelho}"/>${texto(cx, cy + 12, 70, MARCA.branco, d.selo.texto)}${texto(cx, cy + 52, 30, MARCA.amarelo, 'OFF', ' letter-spacing="3"')}</g>`;
  }
  const cor = d.selo.tipo === 'historico' ? MARCA.amarelo : MARCA.vermelho;
  const l = larguraDaPilula(d.selo.texto, 30, 200, 360);
  return pilula(xDir - l / 2 - 10, yTopo - 30, 64, l, cor, 30, d.selo.texto);
}

function arteDoProduto(d: DadosDaArte, g: { largura: number; altura: number; yLogo: number; yFoto: number; hFoto: number; passoDoTitulo: number; tamanhoDoTitulo: number; yApoio: number; tamanhoDoApoio: number; yChamada: number; tamanhoDaChamada: number; yAviso: number; escalaDaEtiqueta: number }): string {
  const xCartao = 60;
  const lCartao = 960;
  const yTitulo = g.yFoto + g.hFoto + 24 + g.tamanhoDoTitulo;
  const chamada = d.chamada ?? { linha: d.pergunta, apoio: 'VEJA NO LINK DA BIO' };
  // A chamada encolhe se for comprida, para sempre caber folgada.
  const tamanhoDaChamada = Math.min(g.tamanhoDaChamada, Math.floor(860 / (chamada.linha.length * 0.7)));
  return `${fundo(g.largura, g.altura, d.cor)}
${marca(g.largura / 2, g.yLogo, 40, 'centro')}
<rect x="${xCartao}" y="${g.yFoto}" width="${lCartao}" height="${g.hFoto}" rx="48" fill="${MARCA.branco}"/>
${foto(d, xCartao + 30, g.yFoto + 30, lCartao - 60, g.hFoto - 60, 56)}
${d.selo ? seloDaFoto(d, xCartao + lCartao, g.yFoto) : etiquetaDePreco(xCartao + lCartao - 30 - 104 * g.escalaDaEtiqueta, g.yFoto + g.hFoto - 96, g.escalaDaEtiqueta)}
${linhasDoTitulo(d, 540, yTitulo, g.passoDoTitulo, g.tamanhoDoTitulo, MARCA.branco)}
${apoio(d, 540, g.yApoio, g.tamanhoDoApoio)}
${texto(540, g.yChamada, tamanhoDaChamada, MARCA.amarelo, chamada.linha, ' font-style="italic"')}
${texto(540, g.yChamada + Math.round(tamanhoDaChamada * 0.78), 26, MARCA.branco, chamada.apoio, ' letter-spacing="3"')}
${aviso(g.yAviso, 22)}`;
}

/** Story 1080x1920. A marca da plataforma tira o topo (até 250) e o pé (de 1650 em diante). */
export function svgDoStory(d: DadosDaArte): string {
  const corpo = arteDoProduto(d, { largura: 1080, altura: 1920, yLogo: 290, yFoto: 370, hFoto: 850, passoDoTitulo: 62, tamanhoDoTitulo: 52, yApoio: 1430, tamanhoDoApoio: 34, yChamada: 1525, tamanhoDaChamada: 70, yAviso: 1640, escalaDaEtiqueta: 1.25 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${FONTE}">
${corpo}
</svg>`;
}

// ───────────────────────── Feed 1080x1350 ─────────────────────────

export function svgDoFeed(d: DadosDaArte): string {
  const corpo = arteDoProduto(d, { largura: 1080, altura: 1350, yLogo: 92, yFoto: 140, hFoto: 770, passoDoTitulo: 54, tamanhoDoTitulo: 44, yApoio: 1100, tamanhoDoApoio: 30, yChamada: 1192, tamanhoDaChamada: 58, yAviso: 1312, escalaDaEtiqueta: 1.1 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="${FONTE}">
${corpo}
</svg>`;
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
${texto(540, 1250, 38, MARCA.suave, `${d.posicao} de ${d.total}`)}`);
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
    const nome = it.linhas.slice(0, 2);
    // Sem nota, vendas nem estrela: o cartão mostra o produto e o nome, e a curiosidade fica para o preço.
    const yNome = y + 112 - ((nome.length - 1) * 42) / 2;
    return `<rect x="60" y="${y}" width="960" height="224" rx="36" fill="${MARCA.branco}"/>
${it.foto ? `<image href="${it.foto}" x="84" y="${y + 20}" width="184" height="184" preserveAspectRatio="xMidYMid meet"/>` : ''}
<circle cx="338" cy="${y + 112}" r="0" fill="none"/>
${nome.map((l, k) => textoEsq(300, yNome + 12 + k * 46, 40, '#0f172a', l)).join('\n')}
<rect x="882" y="${y + 20}" width="118" height="50" rx="25" fill="${MARCA.vermelho}"/>${texto(941, y + 56, 32, MARCA.branco, `#${i + 1}`)}`;
  });
  return envolver(`${marca(60, 92, 44, 'esquerda')}
${texto(540, 200, 66, MARCA.branco, 'Os 3 do nosso guia')}
${d.assunto.map((l, i) => texto(540, 262 + i * 50, 44, MARCA.amarelo, l)).join('\n')}
${linhas.join('\n')}
${faixaDoGrupo(1100, 170, 52)}
${aviso(1334, 24)}`);
}

// ───────────────────────── Carrossel "A ou B?" (1080x1350) ─────────────────────────

export interface DadosDoCompetidor {
  foto?: string;
  /** Título já quebrado em linhas. */
  linhas: string[];
  nota?: string;
  vendas?: string;
  freteGratis?: boolean;
}

const quadroDaFoto = (foto: string | undefined, x: number, y: number, lado: number) =>
  `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="36" fill="${MARCA.branco}"/>
${foto ? `<image href="${foto}" x="${x + 16}" y="${y + 16}" width="${lado - 32}" height="${lado - 32}" preserveAspectRatio="xMidYMid meet"/>` : texto(x + lado / 2, y + lado / 2, 40, '#98a2b3', 'Sem foto')}`;

/** Capa: as duas fotos lado a lado e a pergunta. Convida a comentar (comentário pesa no alcance). */
export function svgDaCapaDoDuelo(d: { assunto: string[]; a?: string; b?: string }): string {
  return envolver(`${marca(60, 92, 44, 'esquerda')}
${texto(540, 270, 52, MARCA.amarelo, 'QUAL VOCÊ ESCOLHE?', ' letter-spacing="4"')}
${d.assunto.map((l, i) => texto(540, 350 + i * 70, 60, MARCA.branco, l)).join('\n')}
${quadroDaFoto(d.a, 60, 470, 450)}${quadroDaFoto(d.b, 570, 470, 450)}
<circle cx="285" cy="475" r="62" fill="${MARCA.vermelho}"/>${texto(285, 505, 84, MARCA.branco, 'A')}
<circle cx="795" cy="475" r="62" fill="${MARCA.amarelo}"/>${texto(795, 505, 84, MARCA.f1, 'B')}
${texto(540, 1090, 64, MARCA.branco, 'A ou B?')}
${texto(540, 1170, 40, MARCA.suave, 'Veja os dois e conte nos comentários')}
${texto(540, 1250, 40, MARCA.branco, 'Arraste para o lado')}`);
}

/** Um competidor por imagem: letra grande, foto e nome. Sem estatísticas nem preço: a pessoa escolhe pelo que vê. */
export function svgDoCompetidor(d: DadosDoCompetidor & { letra: 'A' | 'B' }): string {
  const cor = d.letra === 'A' ? MARCA.vermelho : MARCA.amarelo;
  const corLetra = d.letra === 'A' ? MARCA.branco : MARCA.f1;
  return envolver(`${marca(60, 92, 44, 'esquerda')}
<circle cx="540" cy="260" r="100" fill="${cor}"/>${texto(540, 318, 144, corLetra, d.letra)}
${quadroDaFoto(d.foto, 215, 400, 650)}
${d.linhas.slice(0, 2).map((l, i) => texto(540, 1120 + i * 54, 44, MARCA.branco, l)).join('\n')}
`);
}

/** Última imagem: pede o voto e leva ao grupo (o preço só lá). */
export function svgDoFechamentoDoDuelo(): string {
  return envolver(`${marca(60, 92, 44, 'esquerda')}
${texto(540, 380, 120, MARCA.branco, 'E você?')}
${texto(540, 520, 76, MARCA.amarelo, 'A ou B?')}
${texto(540, 640, 44, MARCA.branco, 'Comenta a sua escolha')}
${faixaDoGrupo(960, 190, 56)}
${aviso(1300, 24)}`);
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
  return chamadaLimpa(y, altura, tamanho, 'ENTRE NO GRUPO', 'É GRÁTIS · LINK NA BIO');
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
  // Clean: o título, o número grande, e os produtos. Sem caixas de estatística nem lista de assuntos: as fotos é que dão vontade de entrar.
  const fotos = d.fotos.slice(0, 4);
  const lado = 230;
  const corpo = `${fundo(1080, 1920)}
${texto(540, 400, 92, MARCA.amarelo, 'HOJE NO GRUPO')}
${texto(540, 690, 250, MARCA.branco, String(d.achados))}
${texto(540, 780, 56, MARCA.branco, d.achados === 1 ? 'achado separado' : 'achados separados')}
${gradeDeFotos(fotos, (1080 - (fotos.length * lado + Math.max(fotos.length - 1, 0) * 20)) / 2, 880, lado, 20, 4)}
${aviso(Y_FAIXA_DO_STORY - 25, 28)}
${faixaEntre(Y_FAIXA_DO_STORY, STORY_BASE_SEGURA - Y_FAIXA_DO_STORY, 64)}
${marca(540, 1760, 48, 'centro')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="${FONTE}">
${corpo}
</svg>`;
}

export interface DadosDaDataEspecial {
  nome: string;
  /** Data de um dia só ("HOJE É 10.10") ou período ("ESTÁ NO AR: SEMANA DO DIA DAS MÃES"). */
  umDia: boolean;
}

/** Story da data grande (1080x1920): o nome da data, a promessa de que as ofertas saem no grupo e a faixa de entrada. Só a marca Mata Preço e texto: sem preço, sem foto de produto, sem logo nem nome de loja (direito autoral) e sem emoji (a fonte da arte não os desenha). */
export function svgDaDataEspecial(d: DadosDaDataEspecial): string {
  const titulo = perguntaGrande(d.nome.toUpperCase(), 470, 170);
  const yFim = 470 + titulo.altura;
  const corpo = `${fundo(1080, 1920)}
${texto(540, 400, 66, MARCA.branco, d.umDia ? 'HOJE É' : 'ESTÁ NO AR')}
${titulo.svg}
${texto(540, yFim + 110, 46, MARCA.branco, 'As melhores ofertas saem no grupo,')}
${texto(540, yFim + 170, 46, MARCA.branco, 'uma por uma.')}
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
${corpo(['O robô anota o preço de cada produto todo dia', 'e avisa quando é o menor preço do mês.', 'Assim você vê se a promoção', 'de hoje vale mesmo a pena.'], 850)}
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

// ───────────────────────── Banner do cupom (1280x720) ─────────────────────────

/** Cores de cada loja no banner do cupom: o ticket na cor da loja e o texto que contrasta com ela. */
const CORES_DO_CUPOM = {
  mercadolivre: { ticket: '#FFE600', texto: '#2D3277', loja: 'DO MERCADO LIVRE' },
  shopee: { ticket: '#EE4D2D', texto: '#FFFFFF', loja: 'DA SHOPEE' },
} as const;

/**
 * Banner ilustrativo que vai junto da mensagem do cupom: um ticket na cor da loja ("CUPOM DO MERCADO LIVRE", "CUPOM DA SHOPEE") e só.
 * As regras e o valor do cupom ficam na legenda: a imagem só mostra, de longe, que é um cupom e de qual loja.
 */
export function svgDoBannerDoCupom(loja: keyof typeof CORES_DO_CUPOM): string {
  const c = CORES_DO_CUPOM[loja];
  const x = 190, y = 215, w = 900, h = 340, raio = 38, entalhe = 36, meio = y + h / 2;
  const ticket = `M${x + raio},${y} H${x + w - raio} Q${x + w},${y} ${x + w},${y + raio} V${meio - entalhe} A${entalhe},${entalhe} 0 0 0 ${x + w},${meio + entalhe} V${y + h - raio} Q${x + w},${y + h} ${x + w - raio},${y + h} H${x + raio} Q${x},${y + h} ${x},${y + h - raio} V${meio + entalhe} A${entalhe},${entalhe} 0 0 0 ${x},${meio - entalhe} V${y + raio} Q${x},${y} ${x + raio},${y} Z`;
  const divisor = x + 300;
  const corpo = `${fundo(1280, 720)}
${marca(640, 110, 40, 'centro')}
<path d="${ticket}" fill="#000000" fill-opacity="0.35" transform="translate(0 14)"/>
<path d="${ticket}" fill="${c.ticket}"/>
<line x1="${divisor}" y1="${y + 26}" x2="${divisor}" y2="${y + h - 26}" stroke="${c.texto}" stroke-opacity="0.55" stroke-width="5" stroke-dasharray="14 12" stroke-linecap="round"/>
${texto(x + 150, meio + 62, 200, c.texto, '%')}
${texto(divisor + (x + w - divisor) / 2, meio - 4, 118, c.texto, 'CUPOM')}
${texto(divisor + (x + w - divisor) / 2, meio + 78, 50, c.texto, c.loja)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" font-family="${FONTE}">\n${corpo}\n</svg>`;
}
