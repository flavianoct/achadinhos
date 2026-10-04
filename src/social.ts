import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { formatarPreco, formatarVendas } from './mensagem.ts';
import { normalizar } from './categoria.ts';
import { layoutDoProduto, svgDaCapaDaDica, svgDoCriterio, svgDoFechamentoDaDica, svgDoFeed, svgDoStory, temaDaCategoria, type DadosDaArte, type TipoDeGancho } from './moldes.ts';
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

/** No máximo 9 hashtags de assunto (muitas parecem spam): as da categoria primeiro, depois as de alcance. O #publi vai na primeira linha. */
export function hashtagsDaCategoria(categoria: string): string[] {
  const todas = [...(HASHTAGS[categoria] ?? HASHTAGS.geral), ...HASHTAGS_COMUNS];
  return [...new Set(todas.filter((h) => h !== '#publi'))].slice(0, 9);
}

const ROTULO_DA_CATEGORIA: Record<string, string> = {
  tech: 'TECNOLOGIA',
  casa: 'CASA E COZINHA',
  games: 'GAMES',
  beleza: 'BELEZA',
  moda: 'MODA',
  esporte: 'ESPORTE E FITNESS',
  pet: 'PET',
  bebe: 'BEBÊ E INFANTIL',
  ferramentas: 'FERRAMENTAS',
  geral: 'VARIEDADES',
};

/** Palavras que sozinhas não dizem nada sobre o produto (ou só enchem o título do anúncio). */
const RUIDO_DO_TITULO = new Set(['promocao', 'oferta', 'lancamento', 'imperdivel', 'full']);
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'em', 'a', 'o', 'na', 'no', 'por', 'c/', '+', '-', '–', '|', 'ou']);

/**
 * Título curto para a arte, sem reticências: tira o que vem entre parênteses, corta no primeiro separador forte
 * (" - ", " | ", vírgula) e fica só com as palavras que cabem em `maxLinhas` linhas, sem terminar numa palavra de ligação.
 * O título completo vai na legenda.
 */
export function tituloParaArte(titulo: string, largura: number, maxLinhas = 2): string[] {
  let t = titulo.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const primeiro = t.split(/\s[-–|]\s|,\s/)[0]!.trim();
  if (primeiro.length >= 18) t = primeiro;
  const palavras = t.split(' ').filter((p) => !RUIDO_DO_TITULO.has(normalizar(p)));
  if (palavras.length === 0) return quebrarTexto(titulo, largura, maxLinhas);

  let cabem = 0;
  for (let k = 1; k <= palavras.length; k++) {
    if (quebrarSemCorte(palavras.slice(0, k).join(' '), largura).length > maxLinhas) break;
    cabem = k;
  }
  let usadas = palavras.slice(0, Math.max(cabem, 1));
  while (usadas.length > 2 && LIGACOES.has(normalizar(usadas[usadas.length - 1]!))) usadas = usadas.slice(0, -1);
  return quebrarTexto(usadas.join(' '), largura, maxLinhas);
}

/** Quebra em linhas sem cortar nada (diferente de quebrarTexto, que limita e põe reticências). */
function quebrarSemCorte(texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of texto.split(' ')) {
    if (!atual) atual = p;
    else if (`${atual} ${p}`.length <= largura) atual = `${atual} ${p}`;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Título inteiro para a legenda, sem reticências (corta numa palavra só se passar de `max`). */
function tituloCompleto(titulo: string, max = 150): string {
  const limpo = titulo.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  return corte.slice(0, corte.lastIndexOf(' ') > 40 ? corte.lastIndexOf(' ') : max).replace(/[\s,;:\-–|]+$/, '');
}

/**
 * O selo do topo da arte: o motivo para parar o dedo. Prefere o que o histórico do robô prova (menor preço em N dias),
 * depois a economia em reais (só quando o preço "de" não parece inflado) e, sem nada melhor, a categoria do produto.
 */
export function ganchoDaOferta(o: OfertaAvaliada): { gancho: string; curto: string; tipo: TipoDeGancho } {
  if (o.menorPrecoEmDias) return { gancho: `MENOR PREÇO EM ${o.menorPrecoEmDias} DIAS`, curto: 'MENOR PREÇO', tipo: 'historico' };
  const economia = o.precoOriginal && o.precoOriginal > o.preco && o.precoDe !== 'inflado' ? Math.round(o.precoOriginal - o.preco) : 0;
  if (economia >= 10) {
    const texto = `ECONOMIZE R$ ${economia.toLocaleString('pt-BR')}`;
    return { gancho: texto, curto: texto, tipo: 'economia' };
  }
  const categoria = ROTULO_DA_CATEGORIA[o.categoria] ?? ROTULO_DA_CATEGORIA.geral!;
  return { gancho: categoria, curto: categoria, tipo: 'categoria' };
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
  // A primeira linha é o que aparece antes do "mais": gancho e aviso de publicidade já ali.
  linhas.push(`${montarGancho(o)} #publi`);
  linhas.push(tituloCompleto(o.titulo));
  linhas.push('');
  const mostraDe = Boolean(o.precoOriginal && o.precoOriginal > o.preco && o.precoDe !== 'inflado');
  const de = mostraDe ? `De ${formatarPreco(o.precoOriginal as number)} por ` : 'Por ';
  const desc = o.desconto && o.desconto > 0 && o.precoDe !== 'inflado' ? ` (-${Math.round(o.desconto)}%)` : '';
  linhas.push(`💰 ${de}${formatarPreco(o.preco)}${desc}`);
  if (mostraDe) linhas.push('📌 Desconto sobre o preço informado pela loja');
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

/** Dados da arte que os moldes (moldes.ts) usam: o tema vem da categoria e o layout vem do produto. */
function dadosDaArte(o: OfertaAvaliada, imagem: string | undefined, larguraDoTitulo: number): DadosDaArte {
  // Quando o histórico mostra que o produto nunca custou perto do preço "de", ele não vai riscado nem vira porcentagem na arte.
  const inflado = o.precoDe === 'inflado';
  const temDe = Boolean(o.precoOriginal && o.precoOriginal > o.preco) && !inflado;
  const g = ganchoDaOferta(o);
  return {
    titulo: tituloParaArte(o.titulo, larguraDoTitulo),
    precoTexto: formatarPreco(o.preco),
    deTexto: temDe ? formatarPreco(o.precoOriginal as number) : undefined,
    desconto: !inflado && o.desconto && o.desconto > 0 ? Math.round(o.desconto) : 0,
    freteGratis: Boolean(o.freteGratis),
    foto: imagem,
    gancho: g.gancho,
    ganchoCurto: g.curto,
    ganchoTipo: g.tipo,
    nota: o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : undefined,
    vendas: o.vendas && o.vendas > 0 ? formatarVendas(o.vendas) : undefined,
    tema: temaDaCategoria(o.categoria),
    layout: layoutDoProduto(o.idProduto),
  };
}

/** Arte do Story, 1080x1920, em SVG. A imagem do produto vai embutida (data URI) para o painel virar PNG no navegador. */
export function montarSvgDoStory(o: OfertaAvaliada, imagem: string | undefined, _config?: Config): string {
  return svgDoStory(dadosDaArte(o, imagem, 32));
}

/** Versão 4:5 (1080x1350) para o feed: o feed do Instagram não aceita imagem em pé 9:16. */
export function montarSvgDoFeed(o: OfertaAvaliada, imagem: string | undefined, _config?: Config): string {
  return svgDoFeed(dadosDaArte(o, imagem, 33));
}


/** Slide de produto do carrossel: o mesmo card do feed (sempre no mesmo layout, para o carrossel parecer um conjunto), com a posição no lugar do selo. */
export function montarSvgDoSlide(o: OfertaAvaliada, imagem: string | undefined, posicao: number, total: number): string {
  const rotulo = `#${posicao} DE ${total}`;
  return svgDoFeed({ ...dadosDaArte(o, imagem, 33), layout: 0, gancho: rotulo, ganchoCurto: rotulo, ganchoTipo: 'economia' });
}

/** Carrossel "Top N até R$ X": as ofertas escolhidas e as fotos (para refazer as imagens a cada rodada). */
export interface DadosDoTop {
  formato?: 'top';
  titulo: string;
  teto: number;
  itens: Array<{ oferta: OfertaAvaliada; imagem?: string }>;
}

/** Carrossel educativo "Antes de comprar [produto]": os critérios fixos do guia e os primeiros produtos dele. */
export interface DadosDaDica {
  formato: 'dica';
  titulo: string;
  slug: string;
  /** O produto, no plural ("fones de ouvido bluetooth"). */
  assunto: string;
  categoria: string;
  criterios: string[];
  itens: Array<{ oferta: OfertaAvaliada; imagem?: string }>;
}

export type DadosDoCarrossel = DadosDoTop | DadosDaDica;

/** Quantas imagens o carrossel tem. O Instagram aceita no máximo 10. */
export function totalDeImagens(d: DadosDoCarrossel): number {
  return d.formato === 'dica' ? 1 + d.criterios.length + (d.itens.length >= 2 ? 1 : 0) : d.itens.length + 1;
}

/** Nomes dos PNGs do carrossel, na ordem (a primeira é a capa). Estáveis entre rodadas (o Instagram precisa de um endereço público). */
export function arquivosDoCarrossel(chave: string, imagens: number): string[] {
  const base = chave.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return Array.from({ length: imagens }, (_, i) => `${base}-${i === 0 ? 'capa' : i}.png`);
}

/** As imagens do carrossel "Antes de comprar": capa, um critério por imagem e, no fim, os 3 primeiros do guia. */
export function montarSvgsDaDica(d: DadosDaDica): string[] {
  const tema = temaDaCategoria(d.categoria);
  const slides = [svgDaCapaDaDica({ numero: d.criterios.length, assunto: quebrarSemCorte(d.assunto, 22).slice(0, 3), tema })];
  d.criterios.forEach((c, i) => {
    let linhas = quebrarSemCorte(c, 20);
    let tamanho = 72;
    if (linhas.length > 4) {
      linhas = quebrarSemCorte(c, 24);
      tamanho = 60;
    }
    slides.push(svgDoCriterio({ posicao: i + 1, total: d.criterios.length, linhas, tamanho, assunto: d.assunto, tema }));
  });
  if (d.itens.length >= 2) {
    slides.push(
      svgDoFechamentoDaDica({
        assunto: quebrarSemCorte(`de ${d.assunto}`, 30).slice(0, 2),
        itens: d.itens.slice(0, 3).map(({ oferta: o, imagem }) => ({
          foto: imagem,
          linhas: tituloParaArte(o.titulo, 24),
          precoTexto: formatarPreco(o.preco),
          nota: o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : undefined,
          vendas: o.vendas && o.vendas > 0 ? formatarVendas(o.vendas) : undefined,
        })),
        tema,
      }),
    );
  }
  return slides;
}

/** Perguntas que convidam a comentar (comentário vale mais para o alcance do que curtida); a mesma dica repete a pergunta. */
function perguntaDaDica(d: DadosDaDica): string {
  const opcoes = [
    'Qual desses pontos pesa mais para você? Conta aqui nos comentários 👇',
    'Faltou algum critério que você sempre olha? Comenta aqui 👇',
    `Marca alguém que está pesquisando ${d.assunto} 👇`,
  ];
  return opcoes[escolha(d.slug, opcoes.length)]!;
}

/** Legenda da dica: gancho e #publi na primeira linha, os critérios por escrito, a pergunta e a chamada para o guia. */
export function legendaDaDica(d: DadosDaDica, config: Config): string {
  const linhas = [`📌 ${d.titulo} #publi`, '🔖 Salve este post para consultar na hora de comprar.', ''];
  d.criterios.forEach((c, i) => linhas.push(`${i + 1}) ${c}`));
  linhas.push(
    '',
    `💬 ${perguntaDaDica(d)}`,
    '',
    `👉 Os 3 primeiros do nosso guia de ${d.assunto}, com preço e nota, e o guia completo: link na bio (${enderecoDoBlog(config)})`,
    '',
    'Publi: link de afiliado nos produtos do guia. Os preços podem mudar a qualquer momento.',
    '',
    hashtagsDaCategoria(d.categoria).join(' '),
  );
  return linhas.join('\n');
}

/** Legenda do carrossel "Top N": gancho e #publi na primeira linha, a lista com preço e prova social, e o aviso de afiliado. */
export function legendaDoCarrossel(d: DadosDoCarrossel, config: Config): string {
  if (d.formato === 'dica') return legendaDaDica(d, config);
  const linhas = [`🛒 ${d.titulo} #publi`, 'Bem avaliados e muito vendidos, separados hoje para você.', ''];
  d.itens.forEach((it, i) => {
    const o = it.oferta;
    const prova = o.nota && o.nota > 0 ? ` · ⭐ ${o.nota.toFixed(1).replace('.', ',')}${o.vendas ? ` (${formatarVendas(o.vendas)} vendidos)` : ''}` : '';
    linhas.push(`${i + 1}) ${tituloParaArte(o.titulo, 30).join(' ')} — ${formatarPreco(o.preco)}${prova}`);
  });
  linhas.push('', `👉 Todas as ofertas no blog, link na bio: ${enderecoDoBlog(config)}`, '', 'Publi: link de afiliado. Os preços podem mudar a qualquer momento.', '', hashtagsDaCategoria('geral').join(' '));
  return linhas.join('\n');
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
