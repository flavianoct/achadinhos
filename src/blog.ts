import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { diaDe, type Banco, type PostSalvo } from './db.ts';
import { escolherParaGuia, perguntasDoGuia, TIPOS_DE_GUIA, type PerguntaFrequente, type ProdutoDoGuia, type TipoDeGuia } from './guias.ts';
import { formatarPreco, formatarVendas } from './mensagem.ts';
import type { OfertaAvaliada } from './types.ts';

type Fetch = typeof fetch;
type Esperar = (ms: number) => Promise<void>;

/** Produto visto há mais tempo que isso não entra no post de hoje (o preço pode ter mudado). */
const HORAS_DE_VALIDADE = 36;
const DIAS_DO_GRAFICO = 30;
/** O texto de um produto é reaproveitado por este tempo antes de ser reescrito. */
const DIAS_DO_TEXTO_DE_PRODUTO = 14;
const DIAS_DO_TEXTO_DE_POST = 400;
/** Produto visto há mais que isso não entra no guia (o preço pode ter mudado muito). */
const DIAS_DE_VALIDADE_NO_GUIA = 14;
/** O texto de abertura e de fechamento de um guia é reescrito neste intervalo. */
const DIAS_DO_TEXTO_DE_GUIA = 30;
/** Tema do post geral do dia (os outros temas são as categorias). */
const TEMA_GERAL = 'todas';

const NOME_DA_CATEGORIA: Record<string, string> = {
  tech: 'Tecnologia',
  casa: 'Casa e Cozinha',
  games: 'Games',
  beleza: 'Beleza',
  moda: 'Moda',
  esporte: 'Esporte e Fitness',
  pet: 'Pet',
  bebe: 'Bebê e Infantil',
  ferramentas: 'Ferramentas',
  geral: 'Variedades',
};

const NOME_DA_LOJA: Record<string, string> = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };

export interface ResultadoDoBlog {
  gerou: boolean;
  pasta: string;
  /** Todos os arquivos HTML gravados nesta rodada. */
  paginas: string[];
  /** Guias "Melhores X" no ar. */
  guias?: number;
  /** Posts criados ou atualizados hoje. */
  postsDeHoje: number;
  /** Posts no ar, contando os dos dias anteriores. */
  postsNoAr: number;
  produtos: number;
  /** Quantos textos a IA escreveu nesta rodada (os já escritos antes são reaproveitados). */
  textosDeIA: number;
  /** Modelo usado, quando a IA está ligada e respondeu. */
  modeloDeIA?: string;
  avisos: string[];
  publicacao?: string;
}

/** Um produto dentro de um post, com tudo o que a página precisa (o post antigo não consulta mais nada). */
interface ItemDoPost extends OfertaAvaliada {
  grafico: Array<{ dia: string; preco: number }>;
  texto?: string;
  /** Só nos guias: selos calculados dos dados e a data em que o preço foi visto. */
  destaques?: string[];
  vistoEm?: number;
}

interface DadosDoGuia {
  itens: ItemDoPost[];
  intro: string;
  fim?: string;
  temIA: boolean;
  ano: string;
}

interface Guia {
  arquivo: string;
  tipo: TipoDeGuia;
  titulo: string;
  atualizadoEm: number;
  dados: DadosDoGuia;
}

interface DadosDoPost {
  itens: ItemDoPost[];
  intro: string;
  fim?: string;
  temIA: boolean;
}

interface Post {
  arquivo: string;
  dia: string;
  tema: string;
  titulo: string;
  atualizadoEm: number;
  dados: DadosDoPost;
}

/** Tamanho da lista: Top 10, Top 5 ou Top 3. Com menos de 3 produtos, o post não é criado. */
export function tamanhoDoTop(total: number): number {
  if (total >= 10) return 10;
  if (total >= 5) return 5;
  if (total >= 3) return 3;
  return 0;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function urlSegura(url: string | undefined): string | undefined {
  return url && /^https:\/\//i.test(url) ? url : undefined;
}

function dataEHora(ms: number): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms)).replace(',', ' às');
}

/** "2026-10-03" → "03/10/2026". */
function dataBr(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

function nomeDoTema(tema: string): string {
  return tema === TEMA_GERAL ? 'Ofertas do dia' : (NOME_DA_CATEGORIA[tema] ?? tema);
}

function listarLojas(itens: OfertaAvaliada[]): string {
  const nomes = [...new Set(itens.map((i) => NOME_DA_LOJA[i.loja] ?? i.loja))];
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

const idDe = (o: OfertaAvaliada) => `${o.loja}:${o.idProduto}`;

function introPadrao(tema: string, itens: OfertaAvaliada[]): string {
  const assunto = tema === TEMA_GERAL ? 'várias categorias' : nomeDoTema(tema);
  return `Selecionamos ${itens.length} ofertas de ${assunto} encontradas neste dia em ${listarLojas(itens)}. A escolha leva em conta o desconto, a avaliação de quem comprou e o nosso próprio histórico de preços.`;
}

function encurtar(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Gráfico pequeno com o preço de cada dia. Só aparece com pelo menos 3 dias de histórico. */
export function graficoDePreco(pontos: Array<{ dia: string; preco: number }>): string {
  if (pontos.length < 3) return '';
  const L = 132;
  const A = 36;
  const margem = 3;
  const precos = pontos.map((p) => p.preco);
  const min = Math.min(...precos);
  const max = Math.max(...precos);
  const faixa = max - min || 1;
  const coords = pontos.map((p, i) => {
    const x = margem + (i / (pontos.length - 1)) * (L - 2 * margem);
    const y = max === min ? A / 2 : margem + ((max - p.preco) / faixa) * (A - 2 * margem);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [ux, uy] = coords[coords.length - 1].split(',');
  const descricao = `Histórico de ${pontos.length} dias: de ${formatarPreco(min)} a ${formatarPreco(max)}`;
  return `<figure class="grafico"><svg viewBox="0 0 ${L} ${A}" width="${L}" height="${A}" role="img" aria-label="${esc(descricao)}"><polyline points="${coords.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${ux}" cy="${uy}" r="3" fill="currentColor"/></svg><figcaption>${esc(descricao)}</figcaption></figure>`;
}

// ───────────── páginas ─────────────

interface Site {
  config: Config;
  posts: Post[];
  hoje: string;
  agora: Date;
  /** Temas que têm pelo menos um post no ar, na ordem do menu. */
  temas: string[];
  guias: Guia[];
}

function moldura(site: Site, p: { arquivo: string; titulo: string; descricao: string; corpo: string; imagem?: string; tipo?: string; dadosEstruturados?: unknown; rodapeExtra?: string }): string {
  const b = site.config.blog;
  const canonica = b.url ? `${b.url}/${p.arquivo === 'index.html' ? '' : p.arquivo}` : '';
  const itensDoMenu: Array<[string, string]> = [['index.html', 'Início'], ...(site.guias.length ? [['guias.html', 'Guias'] as [string, string]] : []), ...site.temas.map((t): [string, string] => [`categoria-${t}.html`, nomeDoTema(t)]), ['arquivo.html', 'Arquivo']];
  const nav = itensDoMenu.map(([arquivo, rotulo]) => `<a href="${arquivo}"${arquivo === p.arquivo ? ' aria-current="page"' : ''}>${esc(rotulo)}</a>`).join('');
  const tituloCompleto = p.arquivo === 'index.html' ? `${b.nome} — ${p.titulo}` : `${p.titulo} | ${b.nome}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(p.descricao)}">
${canonica ? `<link rel="canonical" href="${esc(canonica)}">` : ''}
<meta property="og:type" content="${p.tipo ?? 'website'}">
<meta property="og:title" content="${esc(p.titulo)}">
<meta property="og:description" content="${esc(p.descricao)}">
${canonica ? `<meta property="og:url" content="${esc(canonica)}">` : ''}
${p.imagem ? `<meta property="og:image" content="${esc(p.imagem)}">` : ''}
${b.url ? `<link rel="alternate" type="application/rss+xml" title="${esc(b.nome)}" href="${esc(`${b.url}/feed.xml`)}">` : ''}
<link rel="stylesheet" href="estilo.css">
${p.dadosEstruturados ? `<script type="application/ld+json">${JSON.stringify(p.dadosEstruturados).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header>
  <a class="marca" href="index.html">${esc(b.nome)}</a>
  <nav aria-label="Seções">${nav}</nav>
</header>
<main>
${p.corpo}
  ${b.telegramLink && urlSegura(b.telegramLink) ? `<p class="chamada">Quer receber as ofertas na hora? <a href="${esc(b.telegramLink)}" target="_blank" rel="noopener">Entre no nosso canal do Telegram</a>.</p>` : ''}
</main>
<footer>
  <p><strong>Aviso:</strong> este site participa de programas de afiliados. Ao comprar pelos links, podemos receber uma comissão, sem custo extra para você.</p>
  ${p.rodapeExtra ?? ''}
</footer>
</body>
</html>
`;
}

function cartaoDoProduto(o: ItemDoPost, posicao: number): string {
  const loja = NOME_DA_LOJA[o.loja] ?? o.loja;
  const imagem = urlSegura(o.imagem);
  const selos: string[] = [];
  if (o.desconto && o.desconto > 0) selos.push(`<span class="selo destaque">-${Math.round(o.desconto)}%</span>`);
  for (const d of o.destaques ?? []) selos.push(`<span class="selo destaque">${esc(d)}</span>`);
  if (o.menorPrecoEmDias) selos.push(`<span class="selo">Menor preço em ${o.menorPrecoEmDias} dias</span>`);
  if (o.freteGratis) selos.push('<span class="selo">Frete grátis</span>');

  const social: string[] = [];
  if (o.nota && o.nota > 0) social.push(`Nota ${o.nota.toFixed(1).replace('.', ',')}`);
  if (o.vendas && o.vendas > 0) social.push(`${formatarVendas(o.vendas)} vendidos`);
  social.push(loja);

  const de = o.precoOriginal && o.precoOriginal > o.preco ? `<s>${formatarPreco(o.precoOriginal)}</s> ` : '';
  return `<li class="cartao">
  <span class="posicao">${posicao}</span>
  ${imagem ? `<img src="${esc(imagem)}" alt="${esc(o.titulo)}" width="120" height="120" loading="lazy" referrerpolicy="no-referrer">` : '<div class="semimagem" aria-hidden="true"></div>'}
  <div class="corpo">
    <h2>${esc(o.titulo)}</h2>
    <p class="preco">${de}<strong>${formatarPreco(o.preco)}</strong></p>
    ${selos.length ? `<p class="selos">${selos.join(' ')}</p>` : ''}
    <p class="social">${esc(social.join(' · '))}${o.vistoEm ? ` · preço visto em ${esc(dataBr(diaDe(new Date(o.vistoEm))))}` : ''}</p>
    ${o.texto ? `<p class="analise">${esc(o.texto)}</p>` : ''}
    ${graficoDePreco(o.grafico ?? [])}
    <a class="botao" href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">Ver oferta na ${esc(loja)}</a>
  </div>
</li>`;
}

function paginaDoPost(site: Site, post: Post): string {
  const d = post.dados;
  const atualizado = dataEHora(post.atualizadoEm);
  const antigo = post.dia !== site.hoje;
  const maisNovo = site.posts.find((p) => p.tema === post.tema); // a lista vem do mais novo para o mais antigo
  const aviso = antigo
    ? `<p class="antigo">Este post é de ${dataBr(post.dia)}. Os preços e a disponibilidade podem ter mudado. ${maisNovo && maisNovo.arquivo !== post.arquivo ? `<a href="${maisNovo.arquivo}">Veja o post mais recente de ${esc(nomeDoTema(post.tema))}</a>.` : '<a href="index.html">Veja as ofertas mais recentes</a>.'}</p>`
    : '';
  const descricao = encurtar(`${post.titulo}: ${d.itens.slice(0, 3).map((i) => encurtar(i.titulo, 50)).join('; ')}.`, 300);
  const b = site.config.blog;
  const dadosEstruturados = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BlogPosting', headline: post.titulo, datePublished: `${post.dia}T00:00:00-03:00`, dateModified: new Date(post.atualizadoEm).toISOString(), author: { '@type': 'Organization', name: b.nome } },
      { '@type': 'ItemList', name: post.titulo, numberOfItems: d.itens.length, itemListElement: d.itens.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.titulo, url: o.link })) },
    ],
  };
  const corpo = `  <article>
  <h1>${esc(post.titulo)}</h1>
  <p class="data"><a href="categoria-${post.tema}.html">${esc(nomeDoTema(post.tema))}</a> · Atualizado em <time datetime="${new Date(post.atualizadoEm).toISOString()}">${esc(atualizado)}</time></p>
  ${aviso}
  <p class="intro">${esc(d.intro)}</p>
  <ol class="lista">
${d.itens.map((o, i) => cartaoDoProduto(o, i + 1)).join('\n')}
  </ol>
  ${d.fim ? `<section class="fim"><h2>Como escolher</h2><p>${esc(d.fim)}</p></section>` : ''}
  </article>`;
  const rodapeExtra = `<p>Preços conferidos em ${esc(atualizado)}. Eles podem mudar a qualquer momento; vale o preço mostrado na loja.</p>${d.temIA ? '\n  <p>Os textos desta página são escritos por inteligência artificial a partir do nome e dos dados de cada produto. Confira os detalhes na página da loja antes de comprar.</p>' : ''}`;
  return moldura(site, { arquivo: post.arquivo, titulo: post.titulo, descricao, corpo, imagem: urlSegura(d.itens[0]?.imagem), tipo: 'article', dadosEstruturados, rodapeExtra });
}

function anoDe(agora: Date): string {
  return diaDe(agora).slice(0, 4);
}

function tituloDoGuia(tipo: TipoDeGuia, n: number, ano: string): string {
  return `Melhores ${tipo.nome} de ${ano}: top ${n} comparados`;
}

function tabelaComparativa(itens: ItemDoPost[]): string {
  const linhas = itens.map((o, i) => {
    const nota = o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : '—';
    const vendas = o.vendas && o.vendas > 0 ? formatarVendas(o.vendas) : '—';
    return `<tr><td>${i + 1}</td><td><a href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">${esc(encurtar(o.titulo, 80))}</a></td><td>${formatarPreco(o.preco)}</td><td>${nota}</td><td>${vendas}</td><td>${esc((o.destaques ?? []).join(', ') || '—')}</td></tr>`;
  });
  return `<div class="tabela"><table>
<thead><tr><th>#</th><th>Produto</th><th>Preço</th><th>Nota</th><th>Vendidos</th><th>Destaque</th></tr></thead>
<tbody>
${linhas.join('\n')}
</tbody></table></div>`;
}

function paginaDoGuia(site: Site, guia: Guia): string {
  const d = guia.dados;
  const b = site.config.blog;
  const atualizado = dataEHora(guia.atualizadoEm);
  const faq: PerguntaFrequente[] = perguntasDoGuia(guia.tipo, d.itens.length, d.ano);
  const outros = site.guias.filter((g) => g.arquivo !== guia.arquivo);
  const relacionados = [...outros.filter((g) => g.tipo.categoria === guia.tipo.categoria), ...outros.filter((g) => g.tipo.categoria !== guia.tipo.categoria)].slice(0, 6);
  const descricao = encurtar(`${guia.titulo}. Comparamos ${d.itens.length} opções por nota, vendas e preço: ${d.itens.slice(0, 3).map((i) => encurtar(i.titulo, 45)).join('; ')}.`, 300);
  const dadosEstruturados = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: guia.titulo, dateModified: new Date(guia.atualizadoEm).toISOString(), author: { '@type': 'Organization', name: b.nome }, publisher: { '@type': 'Organization', name: b.nome } },
      { '@type': 'ItemList', name: guia.titulo, numberOfItems: d.itens.length, itemListElement: d.itens.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.titulo, url: o.link })) },
      { '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } })) },
    ],
  };
  const corpo = `  <article>
  <h1>${esc(guia.titulo)}</h1>
  <p class="data"><a href="guias.html">Guias de compra</a> · Atualizado em <time datetime="${new Date(guia.atualizadoEm).toISOString()}">${esc(atualizado)}</time> · ${d.itens.length} produtos comparados</p>
  <p class="intro">${esc(d.intro)}</p>
  <h2 class="secao">Comparativo rápido</h2>
  ${tabelaComparativa(d.itens)}
  <h2 class="secao">Os ${d.itens.length} melhores, em detalhe</h2>
  <ol class="lista">
${d.itens.map((o, i) => cartaoDoProduto(o, i + 1)).join('\n')}
  </ol>
  <section class="fim"><h2>O que observar antes de comprar</h2><ul>${guia.tipo.criterios.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${d.fim ? `<p>${esc(d.fim)}</p>` : ''}</section>
  <section class="faq"><h2>Perguntas frequentes</h2>
${faq.map((f) => `  <h3>${esc(f.pergunta)}</h3>\n  <p>${esc(f.resposta)}</p>`).join('\n')}
  </section>
  ${relacionados.length ? `<section class="fim"><h2>Veja também</h2><ul>${relacionados.map((g) => `<li><a href="${g.arquivo}">${esc(g.titulo)}</a></li>`).join('')}</ul></section>` : ''}
  </article>`;
  const rodapeExtra = `<p>Preços vistos pelo nosso robô nas datas indicadas em cada produto. Eles mudam a qualquer momento; vale o preço mostrado na loja.</p>${d.temIA ? '\n  <p>Alguns textos desta página são escritos por inteligência artificial a partir do nome e dos dados de cada produto. Confira os detalhes na página da loja antes de comprar.</p>' : ''}`;
  return moldura(site, { arquivo: guia.arquivo, titulo: guia.titulo, descricao, corpo, imagem: urlSegura(d.itens[0]?.imagem), tipo: 'article', dadosEstruturados, rodapeExtra });
}

function cartaoDeGuia(g: Guia): string {
  const imagem = urlSegura(g.dados.itens[0]?.imagem);
  return `<li class="resumo">
  ${imagem ? `<img src="${esc(imagem)}" alt="" width="88" height="88" loading="lazy" referrerpolicy="no-referrer">` : ''}
  <div>
    <h3><a href="${g.arquivo}">${esc(g.titulo)}</a></h3>
    <p class="data">${esc(NOME_DA_CATEGORIA[g.tipo.categoria] ?? g.tipo.categoria)} · ${g.dados.itens.length} produtos · atualizado em ${esc(dataBr(diaDe(new Date(g.atualizadoEm))))}</p>
  </div>
</li>`;
}

function paginaDosGuias(site: Site): string {
  const b = site.config.blog;
  const categorias = [...new Set(site.guias.map((g) => g.tipo.categoria))];
  const blocos = categorias.map((c) => `<h2 class="secao">${esc(NOME_DA_CATEGORIA[c] ?? c)}</h2>\n  <ul class="posts">\n${site.guias.filter((g) => g.tipo.categoria === c).map(cartaoDeGuia).join('\n')}\n  </ul>`);
  const corpo = `  <h1>Guias de compra</h1>
  <p class="intro">Comparativos dos melhores produtos de cada tipo, ordenados pela nota de quem comprou, pelas vendas e pelo preço. Atualizados automaticamente.</p>
  ${blocos.join('\n  ')}`;
  return moldura(site, { arquivo: 'guias.html', titulo: 'Guias de compra: os melhores produtos comparados', descricao: `${b.nome}: guias com os melhores produtos de cada tipo, comparados por nota, vendas e preço.`, corpo });
}

function resumoDoPost(post: Post, site: Site): string {
  const imagem = urlSegura(post.dados.itens[0]?.imagem);
  const hoje = post.dia === site.hoje;
  return `<li class="resumo">
  ${imagem ? `<img src="${esc(imagem)}" alt="" width="88" height="88" loading="lazy" referrerpolicy="no-referrer">` : ''}
  <div>
    <h3><a href="${post.arquivo}">${esc(post.titulo)}</a></h3>
    <p class="data">${hoje ? 'Hoje' : dataBr(post.dia)} · ${esc(nomeDoTema(post.tema))} · ${post.dados.itens.length} produtos</p>
    <p>${esc(encurtar(post.dados.intro, 170))}</p>
  </div>
</li>`;
}

function listaDePosts(posts: Post[], site: Site): string {
  return `<ul class="posts">\n${posts.map((p) => resumoDoPost(p, site)).join('\n')}\n</ul>`;
}

function secaoDeGuiasDaHome(site: Site): string {
  const guiasDaHome = site.guias.slice(0, 8);
  if (guiasDaHome.length === 0) return '';
  return `<h2 class="secao">Guias de compra</h2>\n  <ul class="posts">\n${guiasDaHome.map(cartaoDeGuia).join('\n')}\n  </ul>\n  <p><a href="guias.html">Ver todos os guias</a></p>\n  `;
}

function paginaInicial(site: Site): string {
  const b = site.config.blog;
  if (site.posts.length === 0) {
    const guias = secaoDeGuiasDaHome(site);
    const intro = guias ? 'Comparativos dos melhores produtos de cada tipo. As ofertas do dia chegam em breve.' : 'Os primeiros posts chegam em breve. O robô publica aqui as melhores ofertas de cada dia.';
    return moldura(site, { arquivo: 'index.html', titulo: 'ofertas do dia', descricao: `${b.nome}: as melhores ofertas do dia, com histórico de preço.`, corpo: `  <h1>${esc(b.nome)}</h1>\n  <p class="intro">${intro}</p>\n  ${guias}` });
  }
  const diaMaisNovo = site.posts[0].dia;
  const recentes = site.posts.filter((p) => p.dia === diaMaisNovo);
  const anteriores = site.posts.filter((p) => p.dia !== diaMaisNovo).slice(0, 24);
  const titulo = diaMaisNovo === site.hoje ? 'Ofertas de hoje' : `Ofertas de ${dataBr(diaMaisNovo)}`;
  const secaoDeGuias = secaoDeGuiasDaHome(site);
  const corpo = `  <h1>${esc(titulo)}</h1>
  <p class="intro">As melhores ofertas de cada dia em listas Top 3, 5 e 10, escolhidas pelo desconto, pela avaliação de quem comprou e pelo histórico de preços.</p>
  ${secaoDeGuias}${listaDePosts(recentes, site)}
  ${anteriores.length ? `<h2 class="secao">Dias anteriores</h2>\n  ${listaDePosts(anteriores, site)}\n  <p><a href="arquivo.html">Ver todos os posts</a></p>` : ''}`;
  return moldura(site, { arquivo: 'index.html', titulo: 'ofertas do dia em listas Top 3, 5 e 10', descricao: encurtar(`${b.nome}: ${recentes.map((p) => p.titulo).join('; ')}.`, 300), corpo, imagem: urlSegura(recentes[0]?.dados.itens[0]?.imagem) });
}

function paginaDoTema(site: Site, tema: string): string {
  const posts = site.posts.filter((p) => p.tema === tema);
  const nome = nomeDoTema(tema);
  const corpo = `  <h1>${esc(nome)}</h1>
  <p class="intro">Todos os posts de ${esc(nome)}, do mais novo para o mais antigo.</p>
  ${listaDePosts(posts, site)}`;
  return moldura(site, { arquivo: `categoria-${tema}.html`, titulo: `${nome}: ofertas por dia`, descricao: `Posts de ofertas de ${nome}, atualizados todos os dias.`, corpo });
}

function paginaDoArquivo(site: Site): string {
  const dias = [...new Set(site.posts.map((p) => p.dia))];
  const blocos = dias.map((dia) => `<h2 class="secao">${dia === site.hoje ? 'Hoje' : dataBr(dia)}</h2>\n  ${listaDePosts(site.posts.filter((p) => p.dia === dia), site)}`);
  const corpo = `  <h1>Arquivo</h1>
  <p class="intro">Todos os posts que estão no ar, por dia. Posts antigos mostram os preços do dia em que foram escritos.</p>
  ${blocos.join('\n  ') || '<p>Ainda não há posts.</p>'}`;
  return moldura(site, { arquivo: 'arquivo.html', titulo: 'Arquivo de posts', descricao: `Todos os posts de ofertas de ${site.config.blog.nome}, por dia.`, corpo });
}

const ESTILO = `:root{--fundo:#f6f7f9;--cartao:#fff;--texto:#16181d;--suave:#5b6370;--borda:#e2e5ea;--cor:#d6336c;--cor-texto:#fff;--ok:#0a7d4f;--aviso-fundo:#fff3d6;--aviso:#7a4a00}
@media (prefers-color-scheme:dark){:root{--fundo:#111318;--cartao:#1a1d24;--texto:#eceef2;--suave:#a0a7b4;--borda:#2a2e38;--cor:#f06595;--cor-texto:#111318;--ok:#51cf8a;--aviso-fundo:#3a2c0c;--aviso:#f2c261}}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header,main,footer{max-width:820px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.marca{font-weight:800;font-size:1.25rem;color:var(--texto);text-decoration:none}
nav{display:flex;flex-wrap:wrap;gap:6px}
nav a{padding:4px 10px;border:1px solid var(--borda);border-radius:999px;color:var(--suave);text-decoration:none;font-size:.875rem}
nav a[aria-current]{background:var(--texto);color:var(--fundo);border-color:var(--texto)}
h1{font-size:1.75rem;line-height:1.2;margin:8px 0 4px}
.secao{font-size:1.25rem;margin:28px 0 10px}
.data{color:var(--suave);margin:0 0 12px;font-size:.875rem}
.data a{color:var(--suave)}
.intro{margin:0 0 20px}
.antigo{background:var(--aviso-fundo);color:var(--aviso);border-radius:10px;padding:10px 14px;margin:0 0 16px}
.antigo a{color:inherit;font-weight:700}
.lista,.posts{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.cartao{position:relative;display:flex;gap:14px;background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:14px}
.posicao{position:absolute;top:-8px;left:-8px;width:30px;height:30px;border-radius:50%;background:var(--texto);color:var(--fundo);display:grid;place-items:center;font-weight:700;font-size:.875rem}
.cartao img,.semimagem{width:120px;height:120px;flex:none;border-radius:8px;object-fit:contain;background:#fff}
.semimagem{background:var(--borda)}
.corpo{min-width:0;flex:1}
.cartao h2{font-size:1rem;line-height:1.35;margin:0 0 6px;overflow-wrap:anywhere}
.preco{margin:0 0 6px}
.preco s{color:var(--suave)}
.preco strong{font-size:1.375rem}
.selos{margin:0 0 6px;display:flex;flex-wrap:wrap;gap:6px}
.selo{font-size:.75rem;padding:2px 8px;border-radius:999px;border:1px solid var(--borda);color:var(--ok)}
.selo.destaque{background:var(--cor);border-color:var(--cor);color:var(--cor-texto);font-weight:700}
.social{margin:0 0 8px;color:var(--suave);font-size:.875rem}
.analise{margin:0 0 10px}
.grafico{margin:0 0 10px;color:var(--ok)}
.grafico svg{display:block}
.grafico figcaption{color:var(--suave);font-size:.75rem}
.botao{display:inline-block;background:var(--cor);color:var(--cor-texto);font-weight:700;text-decoration:none;padding:10px 16px;border-radius:8px}
.resumo{display:flex;gap:14px;background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:14px}
.resumo img{width:88px;height:88px;flex:none;border-radius:8px;object-fit:contain;background:#fff}
.resumo div{min-width:0}
.resumo h3{font-size:1.0625rem;line-height:1.3;margin:0 0 4px;overflow-wrap:anywhere}
.resumo h3 a{color:var(--texto)}
.resumo p{margin:0}
.resumo .data{margin:0 0 4px}
.fim{margin:24px 0 0}
.fim h2{font-size:1.25rem;margin:0 0 6px}
.fim p{margin:0}
.chamada{margin:24px 0 0;padding:14px;border:1px dashed var(--borda);border-radius:12px}
a{color:var(--cor)}
.tabela{overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--cartao);border:1px solid var(--borda);border-radius:12px;font-size:.875rem}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--borda);vertical-align:top}
th{color:var(--suave);font-weight:600}
.faq h3{font-size:1rem;margin:16px 0 4px}
.faq p{margin:0}
.fim ul{margin:0 0 10px;padding-left:20px}
footer{color:var(--suave);font-size:.8125rem;border-top:1px solid var(--borda);margin-top:24px}
@media (max-width:520px){.cartao{flex-direction:column}.cartao img{width:100%;height:180px}.semimagem{display:none}.resumo img{width:64px;height:64px}}
`;

// ───────────── IA ─────────────

/** Limpa o texto devolvido pelo modelo. Devolve undefined se ele não servir. */
export function limparTextoDeIA(bruto: string): string | undefined {
  let t = bruto
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '');
  if (t.length < 40) return undefined;
  // O modelo não recebe preços; se citar preço ou percentual, inventou. Melhor ficar sem o texto.
  if (/R\$|\d\s?%|\d+\s?reais/i.test(t)) return undefined;
  if (t.length > 520) {
    const corte = t.slice(0, 520);
    const fim = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '));
    t = fim > 120 ? corte.slice(0, fim + 1) : `${corte.trimEnd()}…`;
  }
  return t;
}

/** Modelos de texto instalados no Ollama (os de "embedding" não servem para escrever). */
export async function modelosDoOllama(url: string, fetchFn: Fetch = fetch): Promise<string[]> {
  const resposta = await fetchFn(`${url}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  if (!resposta.ok) throw new Error(`Ollama respondeu ${resposta.status}`);
  const dados = (await resposta.json()) as { models?: Array<{ name?: string }> };
  return (dados.models ?? []).map((m) => m.name ?? '').filter((n) => n && !/embed/i.test(n));
}

/** Quem escreve: o modelo, como pedir um texto e os limites a respeitar. */
interface Escritor {
  modelo: string;
  pedir(prompt: string): Promise<string>;
  /** Espera entre um pedido e outro, para respeitar o limite por minuto. */
  pausaMs: number;
  /** Teto de textos novos por rodada. O que faltar entra na rodada seguinte. */
  maxPorRodada: number;
}

const ENDERECO_DO_GITHUB_MODELS = 'https://models.github.ai/inference/chat/completions';

/** IA gratuita do GitHub (GitHub Models). No GitHub Actions, usa o token do próprio workflow. */
export async function pedirAoGitHub(token: string, modelo: string, prompt: string, fetchFn: Fetch = fetch): Promise<string> {
  const resposta = await fetchFn(ENDERECO_DO_GITHUB_MODELS, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: 'system', content: 'Você escreve em português do Brasil para um blog de ofertas. Segue as regras à risca e devolve somente o texto pedido.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (resposta.status === 429) throw new Error('limite gratuito do GitHub Models atingido por agora');
  if (resposta.status === 401 || resposta.status === 403) throw new Error('o GitHub recusou o token (no workflow, confira a permissão "models: read")');
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`GitHub Models respondeu ${resposta.status}${/model/i.test(detalhe) ? ` (o modelo "${modelo}" existe?)` : ''}`);
  }
  const corpo = await resposta.text();
  let dados: { choices?: Array<{ message?: { content?: string } }> };
  try {
    dados = JSON.parse(corpo);
  } catch {
    throw new Error(`GitHub Models devolveu algo que não é JSON (${resposta.status}): "${corpo.replace(/\s+/g, ' ').slice(0, 120)}"`);
  }
  return dados.choices?.[0]?.message?.content ?? '';
}

async function prepararEscritor(config: Config, fetchFn: Fetch, avisos: string[]): Promise<Escritor | undefined> {
  const b = config.blog;
  if (b.ia === 'ollama') {
    try {
      const modelo = b.ollamaModelo || (await modelosDoOllama(b.ollamaUrl, fetchFn))[0];
      if (!modelo) {
        avisos.push('O Ollama não tem nenhum modelo instalado. Baixe um (ex.: ollama pull llama3.1) e gere de novo.');
        return undefined;
      }
      return {
        modelo,
        pausaMs: 0,
        maxPorRodada: 30,
        async pedir(prompt) {
          const resposta = await fetchFn(`${b.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: modelo, prompt, stream: false, options: { temperature: 0.6, num_predict: 260 } }),
            signal: AbortSignal.timeout(180_000),
          });
          if (!resposta.ok) throw new Error(`Ollama respondeu ${resposta.status}`);
          return ((await resposta.json()) as { response?: string }).response ?? '';
        },
      };
    } catch (e) {
      avisos.push(`IA indisponível (${(e as Error).message}): o Ollama está aberto? Usei o texto padrão.`);
      return undefined;
    }
  }
  if (b.ia === 'github') {
    if (!b.githubToken) {
      avisos.push('BLOG_IA=github, mas não há GITHUB_TOKEN. No GitHub Actions ele vem do próprio workflow; fora dele, crie um token com a permissão "models".');
      return undefined;
    }
    // O plano gratuito aceita poucos pedidos por minuto e por dia; por isso a pausa e o teto por rodada.
    return { modelo: b.githubModelo, pausaMs: b.githubPausaMs, maxPorRodada: 12, pedir: (prompt) => pedirAoGitHub(b.githubToken, b.githubModelo, prompt, fetchFn) };
  }
  return undefined;
}

const REGRAS_DE_ESCRITA = `Regras:
- De 2 a 3 frases, em português do Brasil, tom direto e útil.
- Baseie-se somente no que está escrito abaixo. Não invente especificações, medidas, materiais nem recursos.
- Não cite preços, percentuais de desconto nem prazos.
- Sem títulos, sem listas, sem emojis, sem aspas. Devolva só o parágrafo.`;

function listaParaPrompt(itens: OfertaAvaliada[]): string {
  return itens.map((o, i) => `${i + 1}. ${o.titulo.slice(0, 90)}`).join('\n');
}

function promptDaIntro(titulo: string, itens: OfertaAvaliada[]): string {
  return `Você escreve para um blog brasileiro de ofertas. Escreva a introdução do post "${titulo}".

${REGRAS_DE_ESCRITA}

Produtos do post:
${listaParaPrompt(itens)}`;
}

function promptDoFim(titulo: string, itens: OfertaAvaliada[]): string {
  return `Você escreve para um blog brasileiro de ofertas. Escreva o parágrafo final do post "${titulo}", com uma dica prática de como escolher entre os produtos da lista.

${REGRAS_DE_ESCRITA}

Produtos do post:
${listaParaPrompt(itens)}`;
}

function promptDaIntroGuia(titulo: string, itens: OfertaAvaliada[]): string {
  return `Você escreve para um blog brasileiro de comparativos de produtos. Escreva a introdução do guia "${titulo}", explicando em geral o que o leitor deve ter em mente ao comprar esse tipo de produto.

${REGRAS_DE_ESCRITA}

Produtos comparados:
${listaParaPrompt(itens)}`;
}

function promptDoFimGuia(titulo: string, itens: OfertaAvaliada[]): string {
  return `Você escreve para um blog brasileiro de comparativos de produtos. Escreva o parágrafo final do guia "${titulo}", com uma recomendação prática de como decidir entre os produtos comparados conforme o perfil de uso.

${REGRAS_DE_ESCRITA}

Produtos comparados:
${listaParaPrompt(itens)}`;
}

function promptDoProduto(o: OfertaAvaliada): string {
  const dados = [`Produto: ${o.titulo.slice(0, 160)}`, `Categoria: ${NOME_DA_CATEGORIA[o.categoria] ?? o.categoria}`, `Loja: ${NOME_DA_LOJA[o.loja] ?? o.loja}`];
  if (o.nota && o.nota > 0) dados.push(`Avaliação dos compradores: ${o.nota.toFixed(1).replace('.', ',')} de 5`);
  if (o.vendas && o.vendas > 0) dados.push(`Unidades vendidas: ${formatarVendas(o.vendas)}`);
  if (o.freteGratis) dados.push('Frete: grátis');
  return `Você escreve para um blog brasileiro de ofertas. Escreva um parágrafo sobre o produto abaixo, para ajudar o leitor a decidir: diga para quem ou para que uso ele serve e um ponto para conferir na página da loja antes de comprar.

${REGRAS_DE_ESCRITA}

${dados.join('\n')}`;
}

// ───────────── publicação pelo PC ─────────────

function rodar(comando: string, args: string[]): Promise<{ codigo: number; saida: string }> {
  return new Promise((resolve) => {
    execFile(comando, args, { timeout: 120_000, windowsHide: true }, (erro, stdout, stderr) => {
      const codigo = erro ? (typeof (erro as any).code === 'number' ? (erro as any).code : 1) : 0;
      resolve({ codigo, saida: `${stdout}${stderr}`.trim() });
    });
  });
}

/**
 * Publica a pasta do blog com Git, para quem roda o robô no próprio PC.
 * A pasta precisa ser um repositório próprio, já ligado ao remoto.
 * (No modo nuvem isto não é usado: o GitHub Actions publica direto no GitHub Pages.)
 */
export async function publicarComGit(pasta: string, mensagem: string): Promise<string> {
  if (!existsSync(join(pasta, '.git'))) {
    throw new Error(`A pasta "${pasta}" ainda não é um repositório Git. Veja "Rodar no PC" no LEIA-ME.`);
  }
  const git = (...args: string[]) => rodar('git', ['-C', pasta, ...args]);
  const add = await git('add', '-A');
  if (add.codigo !== 0) throw new Error(`git add falhou: ${add.saida}`);
  if ((await git('diff', '--cached', '--quiet')).codigo === 0) return 'sem mudanças para publicar';
  const commit = await git('commit', '-m', mensagem);
  if (commit.codigo !== 0) throw new Error(`git commit falhou: ${commit.saida}`);
  const push = await git('push');
  if (push.codigo !== 0) throw new Error(`git push falhou: ${push.saida}`);
  return 'publicado';
}

// ───────────── geração ─────────────

function paraPost(salvo: PostSalvo): Post | undefined {
  try {
    const dados = JSON.parse(salvo.dados) as DadosDoPost;
    if (!Array.isArray(dados.itens)) return undefined;
    return { arquivo: salvo.arquivo, dia: salvo.dia, tema: salvo.tema, titulo: salvo.titulo, atualizadoEm: salvo.atualizadoEm, dados };
  } catch {
    return undefined;
  }
}

function paraGuia(salvo: { arquivo: string; tipo: string; titulo: string; dados: string; atualizadoEm: number }): Guia | undefined {
  try {
    const tipo = TIPOS_DE_GUIA.find((t) => t.slug === salvo.tipo);
    const dados = JSON.parse(salvo.dados) as DadosDoGuia;
    if (!tipo || !Array.isArray(dados.itens) || dados.itens.length === 0) return undefined;
    return { arquivo: salvo.arquivo, tipo, titulo: salvo.titulo, atualizadoEm: salvo.atualizadoEm, dados };
  } catch {
    return undefined;
  }
}

function introPadraoDoGuia(tipo: TipoDeGuia, itens: OfertaAvaliada[]): string {
  return `Reunimos ${itens.length} ${tipo.nome} bem avaliados que apareceram nas lojas nos últimos dias (${listarLojas(itens)}). A lista é ordenada pela nota de quem comprou, pelo volume de vendas e pelo preço, e cada produto mostra a data em que o preço foi visto.`;
}

function diaMenos(agora: Date, dias: number): string {
  return diaDe(new Date(agora.getTime() - dias * 86_400_000));
}

const pausaPadrao: Esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Atualiza os posts de hoje (um geral e um por categoria com ofertas suficientes), apaga os que passaram
 * do prazo e grava o site inteiro na pasta do blog: posts, página inicial, categorias, arquivo, sitemap e feed.
 * Com a IA ligada, ela escreve a abertura, um parágrafo por produto e o fechamento de cada post.
 */
export async function gerarBlog(banco: Banco, config: Config, agora: Date = new Date(), fetchFn: Fetch = fetch, esperar: Esperar = pausaPadrao): Promise<ResultadoDoBlog> {
  const b = config.blog;
  const resultado: ResultadoDoBlog = { gerou: false, pasta: b.pasta, paginas: [], postsDeHoje: 0, postsNoAr: 0, produtos: 0, textosDeIA: 0, avisos: [] };
  const hoje = diaDe(agora);
  const valido = (o: OfertaAvaliada) => Boolean(urlSegura(o.link));

  // 1. Quais posts o dia de hoje tem.
  const rascunhos: Array<{ arquivo: string; tema: string; titulo: string; itens: OfertaAvaliada[] }> = [];
  const gerais = banco.melhoresProdutos({ horas: HORAS_DE_VALIDADE, limite: 40 }, agora).filter(valido);
  const nGeral = tamanhoDoTop(gerais.length);
  if (nGeral > 0) {
    rascunhos.push({ arquivo: `post-${hoje}-ofertas-do-dia.html`, tema: TEMA_GERAL, titulo: `Top ${nGeral} ofertas do dia ${dataBr(hoje)}`, itens: gerais.slice(0, nGeral) });
    for (const { categoria } of banco.categoriasRecentes(HORAS_DE_VALIDADE, agora)) {
      if (!/^[a-z0-9-]+$/.test(categoria)) continue;
      const itens = banco.melhoresProdutos({ horas: HORAS_DE_VALIDADE, limite: 20, categoria }, agora).filter(valido);
      const n = tamanhoDoTop(itens.length);
      if (n === 0) continue;
      rascunhos.push({ arquivo: `post-${hoje}-${categoria}.html`, tema: categoria, titulo: `Top ${n} ofertas de ${nomeDoTema(categoria)} em ${dataBr(hoje)}`, itens: itens.slice(0, n) });
    }
  } else {
    resultado.avisos.push('Ainda não há ofertas recentes suficientes para um post novo hoje (mínimo de 3).');
  }

  // 1b. Guias "Melhores X": um por tipo de produto que tem itens suficientes no acervo.
  const ano = anoDe(agora);
  const guiaRascunhos: Array<{ tipo: TipoDeGuia; arquivo: string; titulo: string; itens: ProdutoDoGuia[] }> = [];
  for (const { tipo: slug } of banco.tiposComProdutos(DIAS_DE_VALIDADE_NO_GUIA, agora)) {
    const tipo = TIPOS_DE_GUIA.find((t) => t.slug === slug);
    if (!tipo) continue;
    const itens = escolherParaGuia(banco.produtosDoGuia(slug, DIAS_DE_VALIDADE_NO_GUIA, 80, agora), tipo);
    if (itens.length === 0) continue;
    guiaRascunhos.push({ tipo, arquivo: `melhores-${slug}.html`, titulo: tituloDoGuia(tipo, itens.length, ano), itens });
  }

  // 2. A IA escreve o que ainda não foi escrito. Qualquer falha só desliga a IA nesta rodada.
  let escritor = rascunhos.length || guiaRascunhos.length ? await prepararEscritor(config, fetchFn, resultado.avisos) : undefined;
  let pedidos = 0;
  let avisouLimite = false;
  const escrever = async (chave: string, validadeEmDias: number, prompt: () => string): Promise<string | undefined> => {
    if (b.ia === 'nenhuma') return undefined;
    const salvo = banco.textoSalvo(chave, validadeEmDias, agora);
    if (salvo) return salvo;
    if (!escritor) return undefined;
    if (pedidos >= escritor.maxPorRodada) {
      if (!avisouLimite) resultado.avisos.push(`A IA escreveu ${pedidos} textos nesta rodada; os que faltam entram na próxima.`);
      avisouLimite = true;
      return undefined;
    }
    try {
      if (pedidos > 0 && escritor.pausaMs > 0) await esperar(escritor.pausaMs);
      pedidos++;
      const texto = limparTextoDeIA(await escritor.pedir(prompt()));
      if (!texto) return undefined;
      banco.salvarTexto(chave, texto, agora);
      resultado.textosDeIA++;
      resultado.modeloDeIA = escritor.modelo;
      return texto;
    } catch (e) {
      resultado.avisos.push(`IA indisponível (${(e as Error).message}); usei o texto padrão no que faltava.`);
      escritor = undefined;
      return undefined;
    }
  };

  // Os guias vêm primeiro: são as páginas que podem aparecer nas buscas, então ganham os textos de IA antes dos "Top do dia".
  for (const g of guiaRascunhos) {
    const introDeIA = await escrever(`guia:${g.tipo.slug}:${g.itens.length}:intro`, DIAS_DO_TEXTO_DE_GUIA, () => promptDaIntroGuia(g.titulo, g.itens));
    const itens: ItemDoPost[] = [];
    for (const o of g.itens) {
      const texto = await escrever(`produto:${idDe(o)}`, DIAS_DO_TEXTO_DE_PRODUTO, () => promptDoProduto(o));
      itens.push({ ...o, texto, grafico: banco.historicoDiario(o.loja, o.idProduto, DIAS_DO_GRAFICO, agora) });
    }
    const fim = await escrever(`guia:${g.tipo.slug}:${g.itens.length}:fim`, DIAS_DO_TEXTO_DE_GUIA, () => promptDoFimGuia(g.titulo, g.itens));
    const dados: DadosDoGuia = { itens, intro: introDeIA ?? introPadraoDoGuia(g.tipo, g.itens), fim, temIA: Boolean(introDeIA || fim || itens.some((i) => i.texto)), ano };
    banco.salvarGuia({ arquivo: g.arquivo, tipo: g.tipo.slug, titulo: g.titulo, dados: JSON.stringify(dados), atualizadoEm: agora.getTime() });
  }

  for (const r of rascunhos) {
    // A abertura e o fechamento são reescritos quando a lista muda de tamanho (Top 3 → 5 → 10) ao longo do dia.
    const introDeIA = await escrever(`post:${r.arquivo}:${r.itens.length}:intro`, DIAS_DO_TEXTO_DE_POST, () => promptDaIntro(r.titulo, r.itens));
    const itens: ItemDoPost[] = [];
    for (const o of r.itens) {
      const texto = await escrever(`produto:${idDe(o)}`, DIAS_DO_TEXTO_DE_PRODUTO, () => promptDoProduto(o));
      itens.push({ ...o, texto, grafico: banco.historicoDiario(o.loja, o.idProduto, DIAS_DO_GRAFICO, agora) });
    }
    const fim = await escrever(`post:${r.arquivo}:${r.itens.length}:fim`, DIAS_DO_TEXTO_DE_POST, () => promptDoFim(r.titulo, r.itens));
    const dados: DadosDoPost = { itens, intro: introDeIA ?? introPadrao(r.tema, r.itens), fim, temIA: Boolean(introDeIA || fim || itens.some((i) => i.texto)) };
    banco.salvarPost({ arquivo: r.arquivo, dia: hoje, tema: r.tema, titulo: r.titulo, dados: JSON.stringify(dados), atualizadoEm: agora.getTime() });
  }
  // Um post de hoje cuja categoria ficou sem ofertas suficientes continua no ar como estava.
  resultado.postsDeHoje = rascunhos.length;

  // 3. Posts que passaram do prazo saem do ar.
  banco.removerPostsAntesDe(diaMenos(agora, b.diasNoAr));

  // 4. Grava o site inteiro a partir do que está guardado.
  const posts = banco.postsSalvos().map(paraPost).filter((p): p is Post => p !== undefined);
  const temasComPost = new Set(posts.map((p) => p.tema));
  const temas = [TEMA_GERAL, ...Object.keys(NOME_DA_CATEGORIA)].filter((t) => temasComPost.has(t));
  for (const t of temasComPost) if (!temas.includes(t)) temas.push(t);
  const guias = banco
    .guiasSalvos()
    .map(paraGuia)
    .filter((g): g is Guia => g !== undefined)
    .sort((a, b) => b.dados.itens.length - a.dados.itens.length || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const site: Site = { config, posts, hoje, agora, temas, guias };

  mkdirSync(b.pasta, { recursive: true });
  const gravar = (arquivo: string, html: string) => {
    writeFileSync(join(b.pasta, arquivo), html, 'utf8');
    resultado.paginas.push(arquivo);
  };
  for (const post of posts) gravar(post.arquivo, paginaDoPost(site, post));
  for (const guia of guias) gravar(guia.arquivo, paginaDoGuia(site, guia));
  if (guias.length) gravar('guias.html', paginaDosGuias(site));
  for (const tema of temas) gravar(`categoria-${tema}.html`, paginaDoTema(site, tema));
  gravar('arquivo.html', paginaDoArquivo(site));
  gravar('index.html', paginaInicial(site));
  gravar('404.html', moldura(site, { arquivo: '404.html', titulo: 'Página não encontrada', descricao: 'Página não encontrada.', corpo: '  <h1>Página não encontrada</h1>\n  <p class="intro">Este post pode ter saído do ar. <a href="index.html">Veja as ofertas mais recentes</a>.</p>' }));

  // Remove páginas que não existem mais (posts vencidos, categorias vazias, formato antigo), para não ficar oferta velha no ar.
  for (const arquivo of readdirSync(b.pasta)) {
    if (/^(post|categoria|ofertas|melhores)-[a-z0-9-]+\.html$/.test(arquivo) && !resultado.paginas.includes(arquivo)) unlinkSync(join(b.pasta, arquivo));
  }

  writeFileSync(join(b.pasta, 'estilo.css'), ESTILO, 'utf8');
  writeFileSync(join(b.pasta, '.nojekyll'), '', 'utf8');
  if (b.url) {
    const endereco = (arquivo: string) => `${b.url}/${arquivo === 'index.html' ? '' : arquivo}`;
    const noMapa = resultado.paginas.filter((a) => a !== '404.html');
    const urls = noMapa.map((a) => {
      const alterado = posts.find((p) => p.arquivo === a)?.atualizadoEm ?? guias.find((g) => g.arquivo === a)?.atualizadoEm;
      return `  <url><loc>${esc(endereco(a))}</loc><lastmod>${new Date(alterado ?? agora.getTime()).toISOString()}</lastmod></url>`;
    });
    writeFileSync(join(b.pasta, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');
    writeFileSync(join(b.pasta, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${b.url}/sitemap.xml\n`, 'utf8');
    const itensDoFeed = posts.slice(0, 30).map((p) => `  <item><title>${esc(p.titulo)}</title><link>${esc(endereco(p.arquivo))}</link><guid>${esc(endereco(p.arquivo))}</guid><pubDate>${new Date(p.atualizadoEm).toUTCString()}</pubDate><description>${esc(encurtar(p.dados.intro, 300))}</description></item>`);
    writeFileSync(join(b.pasta, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>${esc(b.nome)}</title><link>${esc(`${b.url}/`)}</link><description>${esc(`${b.nome}: ofertas do dia`)}</description><language>pt-BR</language>\n${itensDoFeed.join('\n')}\n</channel></rss>\n`, 'utf8');
  } else {
    resultado.avisos.push('BLOG_URL está vazio: o sitemap e o feed não foram criados. Preencha depois de publicar.');
  }

  resultado.gerou = true;
  resultado.postsNoAr = posts.length;
  resultado.guias = guias.length;
  resultado.produtos = new Set(posts.filter((p) => p.dia === hoje).flatMap((p) => p.dados.itens.map(idDe))).size;

  if (b.publicar === 'git') {
    try {
      resultado.publicacao = await publicarComGit(b.pasta, `Atualiza ofertas (${dataEHora(agora.getTime())})`);
    } catch (e) {
      resultado.avisos.push((e as Error).message);
    }
  }
  return resultado;
}
