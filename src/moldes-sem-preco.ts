/**
 * Artes do Instagram com a marca Mata Preço e sem preço na imagem.
 * O preço muda depois que o post fica no ar, então a arte mostra o produto e chama para o grupo, onde o preço é o do momento.
 */
import { CORES, simboloNaArte } from './marca.ts';
import { esc } from './moldes.ts';

const FONTE = 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif';
const AVISO = 'Publi · link de afiliado';
const CHAMADA = 'O PREÇO ESTÁ NO GRUPO · LINK NA BIO';

export interface DadosDaArteSemPreco {
  /** Linhas do título já quebradas (sem escapar). */
  titulo: string[];
  /** Data URI da foto, se houver. */
  foto?: string;
  /** Selo do topo, sem valores em reais (a categoria ou "MENOR PREÇO EM 30 DIAS"). */
  selo: string;
  /** Pergunta que puxa a curiosidade, em uma ou duas linhas. */
  pergunta: string[];
  nota?: string;
  vendas?: string;
  freteGratis: boolean;
}

const texto = (x: number, y: number, tamanho: number, cor: string, conteudo: string, ancora = 'middle', extra = '') =>
  `<text x="${x}" y="${y}" font-size="${tamanho}" font-weight="700" fill="${cor}" text-anchor="${ancora}"${extra}>${esc(conteudo)}</text>`;

const italico = (x: number, y: number, tamanho: number, cor: string, conteudo: string, ancora = 'middle', extra = '') => texto(x, y, tamanho, cor, conteudo, ancora, ` font-style="italic"${extra}`);

/** Largura estimada de um texto em negrito (cada letra ocupa perto de 0,62 do tamanho da fonte). */
const largura = (conteudo: string, tamanho: number) => conteudo.length * tamanho * 0.62;

/** Logo: símbolo, "MATA" em branco e "PREÇO" em amarelo riscado de vermelho. `x` é o canto esquerdo. */
function logo(x: number, y: number, altura: number): string {
  const t = Math.round(altura * 0.74);
  const xMata = x + altura * 1.02;
  const xPreco = xMata + largura('MATA ', t) + t * 0.2;
  const larguraPreco = largura('PREÇO', t) + t * 0.35;
  const meio = y + altura * 0.5;
  return `${simboloNaArte(x, y, altura)}
${italico(xMata, y + altura * 0.76, t, '#ffffff', 'MATA', 'start')}
${italico(xPreco, y + altura * 0.76, t, CORES.amarelo, 'PREÇO', 'start')}
<rect x="${xPreco - 8}" y="${meio - t * 0.06}" width="${larguraPreco + 16}" height="${Math.max(6, Math.round(t * 0.11))}" rx="4" fill="${CORES.vermelho}" transform="rotate(-4 ${xPreco + larguraPreco / 2} ${meio})"/>`;
}

/** Largura total do logo, para centralizar. */
const larguraDoLogo = (altura: number) => altura * 1.02 + largura('MATA ', altura * 0.74) + altura * 0.15 + largura('PREÇO', altura * 0.74) + altura * 0.26;

/** O preço "escondido": R$ em amarelo e uma tarja vermelha no lugar do valor. */
function precoEscondido(cx: number, y: number, altura: number): string {
  const tarja = altura * 2.9;
  const rs = altura * 1.45;
  const x0 = cx - (rs + tarja) / 2;
  const meioX = x0 + rs + tarja / 2;
  const giro = ` transform="rotate(-3 ${meioX} ${y + altura / 2})"`;
  return `${italico(x0, y + altura * 0.82, altura, CORES.amarelo, 'R$', 'start')}
<rect x="${x0 + rs}" y="${y}" width="${tarja}" height="${altura}" rx="${altura * 0.2}" fill="${CORES.vermelho}"${giro}/>
${italico(meioX, y + altura * 0.78, altura * 0.72, '#ffffff', '? ? ?', 'middle', giro)}`;
}

function estrela(cx: number, cy: number, r: number): string {
  const pontos = Array.from({ length: 10 }, (_, i) => {
    const angulo = ((-90 + i * 36) * Math.PI) / 180;
    const raio = i % 2 ? r * 0.42 : r;
    return `${(cx + raio * Math.cos(angulo)).toFixed(1)},${(cy + raio * Math.sin(angulo)).toFixed(1)}`;
  });
  return `<polygon points="${pontos.join(' ')}" fill="${CORES.amarelo}"/>`;
}

/** Nota, vendas e frete grátis numa linha. Nada disso é preço, então pode ficar na imagem. */
function prova(d: DadosDaArteSemPreco, cx: number, y: number, tamanho: number): string {
  const partes = [d.nota ?? '', d.vendas ? `${d.vendas} vendidos` : '', d.freteGratis ? 'Frete grátis' : ''].filter(Boolean);
  if (partes.length === 0) return '';
  const linha = partes.join(' · ');
  const daEstrela = d.nota ? tamanho * 1.15 : 0;
  const x0 = cx - (daEstrela + linha.length * tamanho * 0.56) / 2;
  return `${d.nota ? estrela(x0 + tamanho * 0.5, y - tamanho * 0.34, tamanho * 0.55) : ''}${texto(Number((x0 + daEstrela).toFixed(1)), y, tamanho, CORES.suave, linha, 'start')}`;
}

/** Selo amarelo com letra preta. `cx` é o centro. */
function selo(cx: number, y: number, h: number, tamanho: number, rotulo: string): string {
  const l = Math.min(520, Math.max(200, Math.round(largura(rotulo, tamanho) + 56)));
  return `<rect x="${cx - l / 2}" y="${y}" width="${l}" height="${h}" rx="${h * 0.22}" fill="${CORES.amarelo}"/>
${texto(cx, y + h * 0.69, tamanho, CORES.preto, rotulo)}`;
}

const faixa = (y: number, h: number, tamanho: number) =>
  `<rect x="60" y="${y}" width="960" height="${h}" rx="${h * 0.28}" fill="${CORES.amarelo}"/>
${italico(540, y + h * 0.67, tamanho, CORES.preto, CHAMADA)}`;

const fundo = (altura: number) =>
  `<defs><radialGradient id="brilho" cx="0.85" cy="0" r="0.9"><stop offset="0" stop-color="${CORES.vermelho}" stop-opacity="0.55"/><stop offset="1" stop-color="${CORES.vermelho}" stop-opacity="0"/></radialGradient></defs>
<rect width="1080" height="${altura}" fill="${CORES.preto}"/>
<rect width="1080" height="${Math.round(altura * 0.5)}" fill="url(#brilho)"/>`;

const foto = (d: DadosDaArteSemPreco, x: number, y: number, w: number, h: number) =>
  d.foto ? `<image href="${d.foto}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` : '';

const envolver = (altura: number, corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${altura}" viewBox="0 0 1080 ${altura}" font-family="${FONTE}">\n${corpo}\n</svg>`;

/** Feed 1080x1350, sem preço. */
export function svgDoFeedSemPreco(d: DadosDaArteSemPreco): string {
  const yPergunta = 962;
  const larguraDoSelo = Math.min(520, Math.max(200, Math.round(largura(d.selo, 26) + 56)));
  return envolver(
    1350,
    `${fundo(1350)}
${logo(52, 38, 84)}
${selo(1020 - larguraDoSelo / 2, 50, 60, 26, d.selo)}
<rect x="60" y="150" width="960" height="600" rx="48" fill="#ffffff"/>
${foto(d, 150, 170, 780, 560)}
${d.titulo.map((l, i) => texto(540, 818 + i * 50, 42, '#ffffff', l)).join('\n')}
${d.pergunta.map((l, i) => italico(540, yPergunta + i * 60, 50, '#ffffff', l)).join('\n')}
${precoEscondido(540, yPergunta + (d.pergunta.length - 1) * 60 + 30, 100)}
${prova(d, 540, 1180, 32)}
${faixa(1208, 84, 38)}
${texto(540, 1330, 24, '#6E6E78', AVISO)}`,
  );
}

/** Story 1080x1920, sem preço. */
export function svgDoStorySemPreco(d: DadosDaArteSemPreco): string {
  const yPergunta = 1462;
  return envolver(
    1920,
    `${fundo(1920)}
${logo(Math.round(540 - larguraDoLogo(110) / 2), 120, 110)}
${selo(540, 268, 72, 32, d.selo)}
<rect x="90" y="390" width="900" height="820" rx="56" fill="#ffffff"/>
${foto(d, 150, 430, 780, 740)}
${d.titulo.map((l, i) => texto(540, 1295 + i * 58, 48, '#ffffff', l)).join('\n')}
${d.pergunta.map((l, i) => italico(540, yPergunta + i * 68, 62, '#ffffff', l)).join('\n')}
${precoEscondido(540, yPergunta + (d.pergunta.length - 1) * 68 + 34, 116)}
${prova(d, 540, 1728, 34)}
${faixa(1762, 92, 38)}
${texto(540, 1892, 26, '#6E6E78', AVISO)}`,
  );
}
