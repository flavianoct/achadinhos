import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { formatarPreco, formatarVendas } from './mensagem.ts';
import type { OfertaAvaliada } from './types.ts';

export type Fetch = typeof fetch;

/** Tudo o que o painel mostra para uma oferta: arte do Story, legenda e roteiro de vídeo. */
export interface ConteudoSocial {
  id: string;
  criadoEm: number;
  titulo: string;
  legenda: string;
  roteiro: string;
  svg: string;
}

const HASHTAGS: Record<string, string[]> = {
  tech: ['#tecnologia', '#gadgets', '#celular', '#fone', '#fonebluetooth', '#eletronicos', '#smartphone', '#tecnologiabrasil'],
  casa: ['#casa', '#cozinha', '#utilidades', '#decoracao', '#casaorganizada', '#utilidadesdomesticas', '#lar', '#dicasdecasa'],
  beleza: ['#beleza', '#skincare', '#maquiagem', '#autocuidado', '#cuidadoscomapele', '#cabelo', '#perfumes', '#makeup'],
  moda: ['#moda', '#lookdodia', '#estilo', '#modafeminina', '#modamasculina', '#outfit', '#tendencia', '#acessorios'],
  esporte: ['#fitness', '#treino', '#academia', '#suplementos', '#vidasaudavel', '#whey', '#musculacao', '#saude'],
  games: ['#games', '#gamer', '#videogame', '#gamebr', '#setupgamer', '#playstation', '#pcgamer', '#gaming'],
  bebe: ['#maternidade', '#bebe', '#mamae', '#maedeprimeiraviagem', '#enxovalbebe', '#filhos', '#vidademae', '#infantil'],
  ferramentas: ['#ferramentas', '#bricolagem', '#facavocemesmo', '#diy', '#construcao', '#reforma', '#oficina', '#marcenaria'],
  pet: ['#pet', '#cachorro', '#gato', '#petshop', '#amopets', '#dogsofinstagram', '#tutordepet', '#cuidadoscompet'],
  geral: ['#achadinhos', '#ofertas', '#compras', '#dicasdecompra', '#economia'],
};

/** Hashtags de alcance, comuns a todas as ofertas (ofertas, economia, achadinhos, Mercado Livre). */
const HASHTAGS_COMUNS = ['#achadinhos', '#achadinhosdodia', '#achadinhosmercadolivre', '#promocao', '#promocaododia', '#ofertas', '#ofertasdodia', '#desconto', '#cupom', '#mercadolivre', '#comprasonline', '#economizar', '#publi'];

/** No máximo 10 hashtags (muitas parecem spam): as da categoria primeiro, depois as de alcance. */
export function hashtagsDaCategoria(categoria: string): string[] {
  const todas = [...(HASHTAGS[categoria] ?? HASHTAGS.geral), ...HASHTAGS_COMUNS];
  // #publi (aviso de publicidade) nunca sai do corte.
  return [...new Set(todas.filter((h) => h !== '#publi'))].slice(0, 9).concat('#publi');
}

/** Número estável de 0 a n-1 para o mesmo produto: varia o gancho entre produtos sem sorteio (o mesmo produto repete a frase). */
function escolha(id: string, n: number): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

/**
 * Primeira linha da legenda. Só afirma o que os dados provam: "menor preço" só quando o histórico do robô confirma,
 * "campeão de vendas" só com muitas vendas e nota alta. Varia a frase entre produtos para as legendas não ficarem iguais.
 */
export function montarGancho(o: OfertaAvaliada): string {
  const dias = o.menorPrecoEmDias;
  const queda = Math.round(o.quedaHistorica ?? 0);
  const desc = Math.round(o.desconto ?? 0);
  let opcoes: string[];
  if (dias && queda >= 5) opcoes = [`📉 ${queda}% mais barato que o menor preço dos últimos ${dias} dias`, `📉 Caiu ${queda}% abaixo do nosso menor registro de ${dias} dias`];
  else if (dias) opcoes = [`📉 Menor preço dos últimos ${dias} dias`, `📉 O preço mais baixo que registramos em ${dias} dias`];
  else if (desc >= 50) opcoes = [`🔥 ${desc}% de desconto neste achado`, `🏷️ Metade do preço ou menos: -${desc}%`];
  else if (o.vendas && o.vendas >= 1000 && o.nota && o.nota >= 4.7) opcoes = [`⭐ Campeão de vendas: ${formatarVendas(o.vendas)} vendidos`, `⭐ Queridinho de quem compra: nota ${o.nota.toFixed(1).replace('.', ',')}`];
  else opcoes = ['🔥 Achado do dia', '🛒 Oferta separada para você'];
  return opcoes[escolha(o.idProduto, opcoes.length)];
}

/** Selo de histórico para a arte (só com histórico confirmado); curto no feed, completo no Story. */
export function seloDoHistorico(o: OfertaAvaliada, curto: boolean): string | undefined {
  if (!o.menorPrecoEmDias) return undefined;
  return curto ? 'MENOR PREÇO' : `MENOR PREÇO EM ${o.menorPrecoEmDias} DIAS`;
}

/** "@topfera_achadinhos" a partir do link do canal; se não houver, o nome do blog. */
export function nomeDoCanal(config: Config): string {
  const m = /t\.me\/([A-Za-z0-9_]+)/.exec(config.blog.telegramLink);
  return m ? `@${m[1]}` : config.blog.nome;
}

/** Endereço do blog sem "https://" (ex.: flavianoct.github.io/achadinhos). Sem blog publicado, usa o canal. */
export function enderecoDoBlog(config: Config): string {
  const url = (config.blog.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return url || nomeDoCanal(config);
}

function titulosCurto(titulo: string, max = 70): string {
  const limpo = titulo.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  return `${corte.slice(0, corte.lastIndexOf(' ') > 30 ? corte.lastIndexOf(' ') : max).trimEnd()}…`;
}

/** Legenda para Instagram e TikTok. O link não é clicável na legenda: manda para a bio. */
export function montarLegenda(o: OfertaAvaliada, config: Config): string {
  const linhas: string[] = [];
  linhas.push(montarGancho(o));
  linhas.push(titulosCurto(o.titulo, 90));
  linhas.push('');
  const de = o.precoOriginal && o.precoOriginal > o.preco ? `De ${formatarPreco(o.precoOriginal)} por ` : 'Por ';
  const desc = o.desconto && o.desconto > 0 ? ` (-${Math.round(o.desconto)}%)` : '';
  linhas.push(`💰 ${de}${formatarPreco(o.preco)}${desc}`);
  if (o.freteGratis) linhas.push('🚚 Frete grátis');
  if (o.nota && o.nota > 0) linhas.push(`⭐ ${o.nota.toFixed(1).replace('.', ',')}${o.vendas ? ` · ${formatarVendas(o.vendas)} vendidos` : ''}`);
  linhas.push('');
  linhas.push(`👉 Todas as ofertas no blog, link na bio: ${enderecoDoBlog(config)}`);
  linhas.push('');
  linhas.push('Publi: link de afiliado. O preço pode mudar a qualquer momento.');
  linhas.push('');
  linhas.push(hashtagsDaCategoria(o.categoria).join(' '));
  return linhas.join('\n');
}

/** Roteiro de 15 segundos para o Reels/TikTok: gancho, produto, preço, chamada. */
export function montarRoteiro(o: OfertaAvaliada, config: Config): string {
  const preco = formatarPreco(o.preco);
  const desc = o.desconto && o.desconto > 0 ? `${Math.round(o.desconto)}% de desconto` : 'preço baixo';
  return [
    `0 a 3 s (gancho, mostre o produto): "Olha esse achado: ${titulosCurto(o.titulo, 45)}!"`,
    `3 a 8 s (mostre em uso ou de perto): "${o.nota ? `Nota ${o.nota.toFixed(1).replace('.', ',')}` : 'Bem avaliado'}${o.vendas ? ` e ${formatarVendas(o.vendas)} vendidos` : ''}${o.freteGratis ? ', com frete grátis' : ''}."`,
    `8 a 12 s (texto grande na tela): "${preco}, ${desc}"`,
    `12 a 15 s (chamada): "Todas as ofertas no blog, link na minha bio. Corre que o preço muda!" (texto na tela: ${enderecoDoBlog(config)})`,
    'Dica: escreva "publi" ou "link de afiliado" na legenda.',
  ].join('\n');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Quebra o texto em linhas de até `largura` caracteres, no máximo `maxLinhas`; corta com reticências. */
export function quebrarTexto(texto: string, largura: number, maxLinhas: number): string[] {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ');
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    if (!atual) atual = p;
    else if (`${atual} ${p}`.length <= largura) atual = `${atual} ${p}`;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= maxLinhas) return linhas;
  const cortadas = linhas.slice(0, maxLinhas);
  const ultima = cortadas[maxLinhas - 1];
  cortadas[maxLinhas - 1] = `${(ultima.length > largura - 1 ? ultima.slice(0, largura - 1) : ultima).trimEnd()}…`;
  return cortadas;
}

/** Arte do Story, 1080x1920, em SVG. A imagem do produto vai embutida (data URI) para o painel virar PNG no navegador. */
export function montarSvgDoStory(o: OfertaAvaliada, imagem: string | undefined, config: Config): string {
  const titulo = quebrarTexto(o.titulo, 34, 2);
  const selo = seloDoHistorico(o, false);
  const temDe = Boolean(o.precoOriginal && o.precoOriginal > o.preco);
  const desc = o.desconto && o.desconto > 0 ? Math.round(o.desconto) : 0;
  const foto = imagem
    ? `<image href="${imagem}" x="130" y="400" width="820" height="820" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="540" y="830" font-size="64" text-anchor="middle" fill="#98a2b3">Oferta do dia</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" font-family="Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif">
<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f27"/><stop offset="1" stop-color="#0f3a9e"/></linearGradient></defs>
<rect width="1080" height="1920" fill="url(#fundo)"/>
<text x="540" y="170" font-size="46" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="6">ACHADINHOS DO DIA</text>
${selo ? `<rect x="190" y="215" width="700" height="84" rx="42" fill="#0e9f6e"/>\n<text x="540" y="274" font-size="44" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(selo)}</text>` : `<rect x="400" y="215" width="280" height="84" rx="42" fill="#ff5a1f"/>\n<text x="540" y="274" font-size="46" font-weight="700" fill="#ffffff" text-anchor="middle">OFERTA</text>`}
<rect x="90" y="360" width="900" height="900" rx="56" fill="#ffffff"/>
${foto}
${desc ? `<circle cx="900" cy="440" r="104" fill="#e11d48"/><text x="900" y="462" font-size="68" font-weight="700" fill="#ffffff" text-anchor="middle">-${desc}%</text>` : ''}
${titulo.map((l, i) => `<text x="540" y="${1340 + i * 62}" font-size="52" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(l)}</text>`).join('\n')}
${temDe ? `<text x="540" y="1478" font-size="44" fill="#cbd5e1" text-anchor="middle" text-decoration="line-through">De ${esc(formatarPreco(o.precoOriginal as number))}</text>` : ''}
<text x="540" y="1648" font-size="150" font-weight="700" fill="#ffd34d" text-anchor="middle">${esc(formatarPreco(o.preco))}</text>
${o.freteGratis ? `<rect x="390" y="1684" width="300" height="60" rx="30" fill="#12805c"/><text x="540" y="1725" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">FRETE GRÁTIS</text>` : ''}
<rect x="140" y="1768" width="800" height="92" rx="46" fill="#ffffff"/>
<text x="540" y="1827" font-size="40" font-weight="700" fill="#1b1f27" text-anchor="middle">Ofertas no link da bio</text>
<text x="540" y="1895" font-size="26" fill="#cbd5e1" text-anchor="middle">Publi · link de afiliado · preço pode mudar</text>
</svg>`;
}

/** Versão 4:5 (1080x1350) para o feed: o feed do Instagram não aceita imagem em pé 9:16. */
export function montarSvgDoFeed(o: OfertaAvaliada, imagem: string | undefined, config: Config): string {
  const titulo = quebrarTexto(o.titulo, 36, 2);
  const selo = seloDoHistorico(o, true);
  const temDe = Boolean(o.precoOriginal && o.precoOriginal > o.preco);
  const desc = o.desconto && o.desconto > 0 ? Math.round(o.desconto) : 0;
  const foto = imagem
    ? `<image href="${imagem}" x="190" y="170" width="700" height="600" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="540" y="490" font-size="60" text-anchor="middle" fill="#98a2b3">Oferta do dia</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif">
<defs><linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f27"/><stop offset="1" stop-color="#0f3a9e"/></linearGradient></defs>
<rect width="1080" height="1350" fill="url(#fundo)"/>
<text x="60" y="92" font-size="38" font-weight="700" fill="#ffffff" letter-spacing="5">ACHADINHOS DO DIA</text>
${selo ? `<rect x="680" y="52" width="340" height="64" rx="32" fill="#0e9f6e"/>\n<text x="850" y="97" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(selo)}</text>` : `<rect x="800" y="52" width="220" height="64" rx="32" fill="#ff5a1f"/>\n<text x="910" y="97" font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">OFERTA</text>`}
<rect x="60" y="140" width="960" height="660" rx="48" fill="#ffffff"/>
${foto}
${desc ? `<circle cx="920" cy="255" r="84" fill="#e11d48"/><text x="920" y="276" font-size="54" font-weight="700" fill="#ffffff" text-anchor="middle">-${desc}%</text>` : ''}
${titulo.map((l, i) => `<text x="540" y="${870 + i * 54}" font-size="46" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(l)}</text>`).join('\n')}
${temDe ? `<text x="540" y="980" font-size="38" fill="#cbd5e1" text-anchor="middle" text-decoration="line-through">De ${esc(formatarPreco(o.precoOriginal as number))}</text>` : ''}
<text x="540" y="1120" font-size="124" font-weight="700" fill="#ffd34d" text-anchor="middle">${esc(formatarPreco(o.preco))}</text>
${o.freteGratis ? `<rect x="400" y="1146" width="280" height="52" rx="26" fill="#12805c"/><text x="540" y="1183" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">FRETE GRÁTIS</text>` : ''}
<rect x="140" y="1215" width="800" height="84" rx="42" fill="#ffffff"/>
<text x="540" y="1269" font-size="36" font-weight="700" fill="#1b1f27" text-anchor="middle">Ofertas no link da bio</text>
<text x="540" y="1334" font-size="24" fill="#cbd5e1" text-anchor="middle">Publi · link de afiliado · preço pode mudar</text>
</svg>`;
}

/** Transforma o SVG em PNG. Devolve undefined se o conversor (@resvg/resvg-js) não estiver instalado. */
export async function renderizarPng(svg: string, largura: number): Promise<Buffer | undefined> {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const r = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Sans' }, fitTo: { mode: 'width', value: largura } });
    return Buffer.from(r.render().asPng());
  } catch {
    return undefined;
  }
}

export type TipoDeArte = 'story' | 'feed';

/** Nome do arquivo PNG de uma arte, estável entre rodadas (o Instagram precisa de um endereço público). */
export function arquivoDaArte(chave: string, tipo: TipoDeArte): string {
  return `${chave.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${tipo}.png`;
}

/**
 * Grava em blog/social/ os PNGs (Story e feed) das ofertas recentes. Como o site é refeito inteiro a cada rodada,
 * isso roda toda vez. Devolve quantos PNGs saíram e se o conversor está faltando.
 */
export async function gravarPngs(banco: Banco, config: Config, agora: Date): Promise<{ gravados: number; semConversor: boolean }> {
  if (!config.social.ativo || !config.instagram.ativo) return { gravados: 0, semConversor: false };
  const pasta = join(config.blog.pasta, 'social');
  mkdirSync(pasta, { recursive: true });
  let gravados = 0;
  for (const l of banco.socialRecentes(HORAS_DO_SOCIAL, MAXIMO_DE_ARTES, agora)) {
    if (!l.svg) continue;
    const oferta = JSON.parse(l.dados) as OfertaAvaliada;
    const foto = await imagemParaPng(l.imagem);
    const story = await renderizarPng(foto === l.imagem ? l.svg : montarSvgDoStory(oferta, foto, config), 1080);
    if (!story) return { gravados, semConversor: true };
    const feed = await renderizarPng(montarSvgDoFeed(oferta, foto, config), 1080);
    writeFileSync(join(pasta, arquivoDaArte(l.chave, 'story')), story);
    gravados++;
    if (feed) {
      writeFileSync(join(pasta, arquivoDaArte(l.chave, 'feed')), feed);
      gravados++;
    }
  }
  return { gravados, semConversor: false };
}

const LIMITE_DA_IMAGEM = 400_000;

/**
 * O conversor de PNG (resvg) não lê WebP, o formato das fotos do Mercado Livre: a foto sumia da arte do Instagram.
 * Aqui o WebP vira JPEG com o "sharp". Se o sharp não estiver instalado, devolve undefined (a arte sai sem foto, como antes).
 */
export async function imagemParaPng(dataUri: string | undefined): Promise<string | undefined> {
  if (!dataUri || !dataUri.startsWith('data:image/webp')) return dataUri;
  try {
    const sharp = (await import('sharp')).default;
    const entrada = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
    const saida = await sharp(entrada).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${saida.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Baixa a foto do produto e devolve como data URI; se algo der errado, devolve undefined (a arte sai sem foto). */
export async function baixarImagemComoDataUri(url: string | undefined, fetchFn: Fetch = fetch): Promise<string | undefined> {
  if (!url || !/^https:\/\//.test(url)) return undefined;
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return undefined;
    const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/(png|jpe?g|webp)$/.test(tipo)) return undefined;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length || bytes.length > LIMITE_DA_IMAGEM) return undefined;
    return await imagemParaPng(`data:${tipo};base64,${bytes.toString('base64')}`);
  } catch {
    return undefined;
  }
}

export const HORAS_DO_SOCIAL = 12;
const MAXIMO_DE_ARTES = 10;

/** Cria a arte das ofertas postadas que ainda não têm. Cada arte é feita uma vez só. */
export async function prepararSocial(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<number> {
  if (!config.social.ativo) return 0;
  let feitas = 0;
  for (const linha of banco.socialSemArte(MAXIMO_DE_ARTES, HORAS_DO_SOCIAL, agora)) {
    const oferta = JSON.parse(linha.dados) as OfertaAvaliada;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    banco.salvarArteSocial(linha.chave, montarSvgDoStory(oferta, imagem, config), imagem);
    feitas++;
  }
  return feitas;
}

/** Conteúdo pronto (legenda, roteiro, arte) das últimas ofertas postadas, para o painel. */
export function conteudoSocialRecente(banco: Banco, config: Config, agora: Date): ConteudoSocial[] {
  if (!config.social.ativo) return [];
  return banco.socialRecentes(HORAS_DO_SOCIAL, MAXIMO_DE_ARTES, agora).map((l) => {
    const o = JSON.parse(l.dados) as OfertaAvaliada;
    return { id: l.chave, criadoEm: l.criadoEm, titulo: o.titulo, legenda: montarLegenda(o, config), roteiro: montarRoteiro(o, config), svg: l.svg ?? montarSvgDoStory(o, undefined, config) };
  });
}
