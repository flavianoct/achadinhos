import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { diaDe, type Banco, type PostSalvo } from './db.ts';
import { explicacaoDoCriterio } from './dicas.ts';
import { tituloParaArte } from './social.ts';
import { chaveDoProduto, escolherParaGuia, perguntasDoGuia, TIPOS_DE_GUIA, type PerguntaFrequente, type ProdutoDoGuia, type TipoDeGuia } from './guias.ts';
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
/** Produto que já está no guia continua elegível por mais tempo, para a lista não mudar quando a promoção dele acaba. */
const DIAS_DOS_VETERANOS_NO_GUIA = 30;
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
  /** Só nos guias: preço em relação à mediana da lista, em %. */
  precoVsMediana?: number;
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

/** Texto curto sem reticências: corta no fim de uma frase e, se não houver, numa palavra. */
function resumir(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fimDeFrase = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '));
  if (fimDeFrase >= max * 0.55) return corte.slice(0, fimDeFrase + 1);
  const espaco = corte.lastIndexOf(' ');
  return (espaco > max * 0.5 ? corte.slice(0, espaco) : corte).replace(/[\s,;:\-–|(]+$/, '');
}

/** A primeira frase do texto (para o resumo em cartões); se for longa demais, corta numa palavra. */
function primeiraFrase(s: string, max: number): string {
  const limpo = s.replace(/\s+/g, ' ').trim();
  const fim = limpo.search(/[.!?](\s|$)/);
  if (fim >= 30 && fim + 1 <= max) return limpo.slice(0, fim + 1);
  return resumir(limpo, max);
}

/** Descrição para buscadores e redes sociais: até 155 caracteres (o que o Google costuma mostrar), sem reticências. */
function descricaoSeo(s: string): string {
  return resumir(s, 155);
}

/** Nome do produto para listas e tabelas: curto, sem reticências, sem terminar em palavra de ligação. */
function tituloDoProduto(titulo: string, largura = 40): string {
  return tituloParaArte(titulo, largura).join(' ');
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
  /** Endereço da imagem padrão de pré-visualização (redes sociais), quando foi possível criá-la. */
  imagemPadrao?: string;
  config: Config;
  posts: Post[];
  hoje: string;
  agora: Date;
  /** Temas que têm pelo menos um post no ar, na ordem do menu. */
  temas: string[];
  guias: Guia[];
}

const ICONE_DO_SITE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23d6336c'/%3E%3Cpath d='M8 17l8-8h8v8l-8 8z' fill='%23fff'/%3E%3Ccircle cx='20.5' cy='11.5' r='2' fill='%23d6336c'/%3E%3C/svg%3E";
const LOGO = '<svg class="logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M8 17l8-8h8v8l-8 8z" fill="#fff"/><circle cx="20.5" cy="11.5" r="2" fill="currentColor"/></svg>';

type Trilha = Array<[string, string?]>;

/** Muda sempre que o CSS muda, para o navegador não usar uma cópia antiga guardada. */
let VERSAO_DO_ESTILO = '1';

function moldura(site: Site, p: { arquivo: string; titulo: string; tituloSeo?: string; descricao: string; corpo: string; imagem?: string; tipo?: string; dadosEstruturados?: unknown; rodapeExtra?: string; trilha?: Trilha; largo?: boolean }): string {
  const b = site.config.blog;
  const endereco = (arquivo: string) => (b.url ? `${b.url}/${arquivo === 'index.html' ? '' : arquivo}` : '');
  const canonica = endereco(p.arquivo);
  const itensDoMenu: Array<[string, string]> = [['index.html', 'Início'], ...(site.guias.length ? [['guias.html', 'Guias'] as [string, string]] : []), ...site.temas.map((t): [string, string] => [`categoria-${t}.html`, nomeDoTema(t)]), ['arquivo.html', 'Arquivo']];
  const nav = itensDoMenu.map(([arquivo, rotulo]) => `<a href="${arquivo}"${arquivo === p.arquivo ? ' aria-current="page"' : ''}>${esc(rotulo)}</a>`).join('');
  // O título da aba e dos resultados de busca fica em até 62 caracteres (o Google corta perto de 60): o nome do site só vai se couber.
  const tituloBase = p.tituloSeo ?? p.titulo;
  const tituloCompleto = p.arquivo === 'index.html' ? `${b.nome} — ${p.titulo}` : `${tituloBase} | ${b.nome}`.length <= 62 ? `${tituloBase} | ${b.nome}` : tituloBase;
  const descricao = descricaoSeo(p.descricao);
  const imagem = p.imagem ?? site.imagemPadrao;

  // Dados estruturados: o que a página trouxe + trilha de navegação (+ identidade do site, na página inicial).
  const grafo: unknown[] = [...(((p.dadosEstruturados as { '@graph'?: unknown[] } | undefined)?.['@graph']) ?? [])];
  if (b.url && p.trilha?.length) {
    const passos: Trilha = [['Início', 'index.html'], ...p.trilha];
    grafo.push({ '@type': 'BreadcrumbList', itemListElement: passos.map(([nome, arquivo], i) => ({ '@type': 'ListItem', position: i + 1, name: nome, item: arquivo ? endereco(arquivo) : canonica })) });
  }
  if (b.url && p.arquivo === 'index.html') {
    grafo.push({ '@type': 'WebSite', '@id': `${b.url}/#site`, url: `${b.url}/`, name: b.nome, inLanguage: 'pt-BR' });
    grafo.push({ '@type': 'Organization', '@id': `${b.url}/#org`, name: b.nome, url: `${b.url}/`, logo: ICONE_DO_SITE, ...(b.telegramLink && urlSegura(b.telegramLink) ? { sameAs: [b.telegramLink] } : {}) });
  }
  const ld = grafo.length ? { '@context': 'https://schema.org', '@graph': grafo } : undefined;
  const migalhas = p.trilha?.length
    ? `<nav class="trilha" aria-label="Você está em"><a href="index.html">Início</a>${p.trilha.map(([nome, arquivo]) => ` <span aria-hidden="true">›</span> ${arquivo ? `<a href="${arquivo}">${esc(nome)}</a>` : `<span aria-current="page">${esc(encurtar(nome, 60))}</span>`}`).join('')}</nav>\n`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="robots" content="${p.arquivo === '404.html' ? 'noindex' : 'index,follow,max-image-preview:large'}">
<meta name="theme-color" content="#d6336c">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${ICONE_DO_SITE}">
${canonica ? `<link rel="canonical" href="${esc(canonica)}">` : ''}
<meta property="og:site_name" content="${esc(b.nome)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${p.tipo ?? 'website'}">
<meta property="og:title" content="${esc(tituloBase)}">
<meta property="og:description" content="${esc(descricao)}">
${canonica ? `<meta property="og:url" content="${esc(canonica)}">` : ''}
${imagem ? `<meta property="og:image" content="${esc(imagem)}">` : ''}
<meta name="twitter:card" content="${imagem ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(tituloBase)}">
<meta name="twitter:description" content="${esc(descricao)}">
${imagem ? `<meta name="twitter:image" content="${esc(imagem)}">` : ''}
${b.url ? `<link rel="alternate" type="application/rss+xml" title="${esc(b.nome)}" href="${esc(`${b.url}/feed.xml`)}">` : ''}
<link rel="preconnect" href="https://http2.mlstatic.com" crossorigin>
<link rel="stylesheet" href="estilo.css?v=${VERSAO_DO_ESTILO}">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">
  <div class="topo-miolo">
    <a class="marca" href="index.html">${LOGO}<span>${esc(b.nome)}</span></a>
    <nav aria-label="Seções">${nav}</nav>
  </div>
</header>
<main id="conteudo"${p.largo ? ' class="largo"' : ''}>
${migalhas}${p.corpo}
  ${b.telegramLink && urlSegura(b.telegramLink) ? `<aside class="chamada"><div><strong>Receba as melhores ofertas na hora</strong><span>Nosso canal do Telegram avisa quando um bom preço aparece.</span></div><a class="botao" href="${esc(b.telegramLink)}" target="_blank" rel="noopener">Entrar no canal</a></aside>` : ''}
</main>
<footer class="rodape">
  <div class="rodape-miolo">
    <div class="rodape-marca">
      <p class="rodape-nome">${LOGO}<span>${esc(b.nome)}</span></p>
      <p>Guias de compra e ofertas das lojas parceiras, com nota, vendas e histórico de preço, atualizados a cada 30 minutos.</p>
    </div>
    <div>
      <p class="rodape-titulo">Navegue</p>
      <p class="rodape-links"><a href="index.html">Início</a> <a href="guias.html">Guias de compra</a> <a href="arquivo.html">Arquivo</a>${b.url ? ' <a href="feed.xml">RSS</a>' : ''}</p>
    </div>
    <div>
      <p class="rodape-titulo">Transparência</p>
      <p class="rodape-links"><a href="sobre.html">Como escolhemos</a> <a href="privacidade.html">Privacidade e afiliados</a>${b.telegramLink && urlSegura(b.telegramLink) ? ` <a href="${esc(b.telegramLink)}" target="_blank" rel="noopener">Canal no Telegram</a>` : ''}</p>
    </div>
    <div class="rodape-aviso">
      <p><strong>Aviso:</strong> este site participa de programas de afiliados. Ao comprar pelos links, podemos receber uma comissão, sem custo extra para você.</p>
      ${p.rodapeExtra ?? ''}
    </div>
  </div>
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

  const nota = o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : '';
  const avaliacao = [
    nota ? `<span class="estrelas" role="img" aria-label="Nota ${nota} de 5"><svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6L10 15l-5.3 3 1.1-6L1.4 7.8l6-.8z" fill="currentColor"/></svg><b>${nota}</b></span>` : '',
    o.vendas && o.vendas > 0 ? `<span>${formatarVendas(o.vendas)} vendidos</span>` : '',
  ].filter(Boolean);
  const social: string[] = [];
  if (o.precoVsMediana !== undefined && Math.abs(o.precoVsMediana) >= 3) social.push(`preço ${Math.abs(o.precoVsMediana)}% ${o.precoVsMediana < 0 ? 'abaixo' : 'acima'} da mediana da lista`);
  social.push(loja);

  const de =o.precoOriginal && o.precoOriginal > o.preco ? `<s>${formatarPreco(o.precoOriginal)}</s> ` : '';
  return `<li class="cartao${posicao === 1 ? ' primeiro' : ''}">
  <span class="posicao">${posicao}</span>
  ${imagem ? `<img src="${esc(imagem)}" alt="${esc(encurtar(o.titulo, 110))}" width="140" height="140" loading="${posicao <= 2 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">` : '<div class="semimagem" aria-hidden="true"></div>'}
  <div class="corpo">
    <h2>${esc(o.titulo)}</h2>
    ${avaliacao.length ? `<p class="avaliacao">${avaliacao.join('')}</p>` : ''}
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
  const descricao = `${post.titulo}: ${d.itens.slice(0, 3).map((i) => tituloDoProduto(i.titulo, 36)).join('; ')}.`;
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
  return moldura(site, { arquivo: post.arquivo, titulo: post.titulo, descricao, corpo, imagem: urlSegura(d.itens[0]?.imagem), tipo: 'article', dadosEstruturados, rodapeExtra, trilha: [[nomeDoTema(post.tema), `categoria-${post.tema}.html`], [post.titulo]] });
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
    const vsMedia = o.precoVsMediana === undefined ? '—' : o.precoVsMediana === 0 ? 'na média' : `${o.precoVsMediana > 0 ? '+' : '−'}${Math.abs(o.precoVsMediana)}%`;
    return `<tr><td>${i + 1}</td><td><a href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">${esc(tituloDoProduto(o.titulo, 32))}</a></td><td>${formatarPreco(o.preco)}</td><td>${vsMedia}</td><td>${nota}</td><td>${vendas}</td><td>${(o.destaques ?? []).length ? `<span class="etiquetas">${(o.destaques ?? []).map((d) => `<span class="etiqueta">${esc(d)}</span>`).join('')}</span>` : '—'}</td></tr>`;
  });
  return `<div class="tabela"><table>
<thead><tr><th>#</th><th>Produto</th><th>Preço</th><th>vs. média da lista</th><th>Nota</th><th>Vendidos</th><th>Destaque</th></tr></thead>
<tbody>
${linhas.join('\n')}
</tbody></table></div>`;
}

/** Os "campeões" do guia (custo-benefício, mais vendido, melhor avaliado...), para o leitor decidir em dez segundos. */
function melhoresEscolhas(itens: ItemDoPost[]): string {
  const rotulos = ['Melhor custo-benefício', 'Mais vendido', 'Melhor avaliado', 'Mais barato da lista'];
  // Um produto que ganha vários selos aparece uma vez só, com todos eles.
  const grupos: Array<{ item: ItemDoPost; selos: string[] }> = [];
  for (const rotulo of rotulos) {
    const o = itens.find((i) => (i.destaques ?? []).includes(rotulo));
    if (!o) continue;
    const grupo = grupos.find((g) => g.item === o);
    if (grupo) grupo.selos.push(rotulo);
    else grupos.push({ item: o, selos: [rotulo] });
  }
  if (grupos.length === 0) return '';
  const cartoes = grupos.map(({ item: o, selos }) => {
    const imagem = urlSegura(o.imagem);
    return `<li class="escolha">
    <span class="escolha-selos">${selos.map((r) => `<span class="escolha-rotulo">${esc(r)}</span>`).join('')}</span>
    ${imagem ? `<img src="${esc(imagem)}" alt="" width="72" height="72" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
    <a class="escolha-nome" href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">${esc(tituloDoProduto(o.titulo, 38))}</a>
    <span class="escolha-preco">${formatarPreco(o.preco)}</span>
  </li>`;
  });
  return `<h2 class="secao">Em resumo: nossas escolhas</h2>\n  <ul class="escolhas">\n  ${cartoes.join('\n  ')}\n  </ul>\n  `;
}

/** Há quanto tempo o robô viu o produto à venda para podermos dizer que ele está disponível. Mais velho que isso, não afirmamos nada. */
const DIAS_PARA_AFIRMAR_DISPONIBILIDADE = 2;

/** Só afirma "em estoque" (para o Google) se o robô viu o produto à venda nos últimos 2 dias. */
function vistoRecentemente(o: ItemDoPost, agora: Date): boolean {
  return Boolean(o.vistoEm) && agora.getTime() - (o.vistoEm as number) <= DIAS_PARA_AFIRMAR_DISPONIBILIDADE * 86_400_000;
}

function paginaDoGuia(site: Site, guia: Guia): string {
  const d = guia.dados;
  const b = site.config.blog;
  const atualizado = dataEHora(guia.atualizadoEm);
  const faq: PerguntaFrequente[] = perguntasDoGuia(guia.tipo, d.itens.length, d.ano);
  const outros = site.guias.filter((g) => g.arquivo !== guia.arquivo);
  const relacionados = [...outros.filter((g) => g.tipo.categoria === guia.tipo.categoria), ...outros.filter((g) => g.tipo.categoria !== guia.tipo.categoria)].slice(0, 6);
  const descricao = `Comparamos ${d.itens.length} ${guia.tipo.nome}: nota, vendas e preço de cada um, o que olhar antes de comprar e perguntas frequentes. Atualizado em ${dataBr(diaDe(new Date(guia.atualizadoEm)))}.`;
  const dadosEstruturados = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: guia.titulo, description: descricao, inLanguage: 'pt-BR', datePublished: new Date(guia.atualizadoEm).toISOString(), dateModified: new Date(guia.atualizadoEm).toISOString(), ...(urlSegura(d.itens[0]?.imagem) ? { image: [urlSegura(d.itens[0]?.imagem)] } : {}), ...(b.url ? { mainEntityOfPage: `${b.url}/${guia.arquivo}` } : {}), author: { '@type': 'Organization', name: b.nome }, publisher: { '@type': 'Organization', name: b.nome } },
      {
        '@type': 'ItemList',
        name: guia.titulo,
        numberOfItems: d.itens.length,
        itemListElement: d.itens.map((o, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: { '@type': 'Product', name: o.titulo, ...(urlSegura(o.imagem) ? { image: urlSegura(o.imagem) } : {}), url: o.link, offers: { '@type': 'Offer', url: o.link, price: o.preco.toFixed(2), priceCurrency: 'BRL', ...(vistoRecentemente(o, site.agora) ? { availability: 'https://schema.org/InStock' } : {}), ...(NOME_DA_LOJA[o.loja] ? { seller: { '@type': 'Organization', name: NOME_DA_LOJA[o.loja] } } : {}) } },
        })),
      },
      { '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } })) },
    ],
  };
  const corpo = `  <article>
  <h1>${esc(guia.titulo)}</h1>
  <p class="data"><a href="guias.html">Guias de compra</a> · <a href="sobre.html">Como escolhemos</a> · Atualizado em <time datetime="${new Date(guia.atualizadoEm).toISOString()}">${esc(atualizado)}</time> · ${d.itens.length} produtos comparados</p>
  <p class="intro">${esc(d.intro)}</p>
  ${melhoresEscolhas(d.itens)}<h2 class="secao">Comparativo rápido</h2>
  ${tabelaComparativa(d.itens)}
  <h2 class="secao">Os ${d.itens.length} melhores, em detalhe</h2>
  <ol class="lista">
${d.itens.map((o, i) => cartaoDoProduto(o, i + 1)).join('\n')}
  </ol>
  <section class="fim"><h2>O que observar antes de comprar</h2><ul>${guia.tipo.criterios.map((c, i) => `<li><strong>${esc(c)}</strong>${explicacaoDoCriterio(guia.tipo.slug, i) ? `: ${esc(explicacaoDoCriterio(guia.tipo.slug, i)!)}` : ''}</li>`).join('')}</ul>${d.fim ? `<p>${esc(d.fim)}</p>` : ''}</section>
  <section class="faq"><h2>Perguntas frequentes</h2>
${faq.map((f) => `  <h3>${esc(f.pergunta)}</h3>\n  <p>${esc(f.resposta)}</p>`).join('\n')}
  </section>
  ${relacionados.length ? `<section class="fim"><h2>Veja também</h2><ul>${relacionados.map((g) => `<li><a href="${g.arquivo}">${esc(g.titulo)}</a></li>`).join('')}</ul></section>` : ''}
  </article>`;
  const rodapeExtra = `<p>Preços vistos pelo nosso robô nas datas indicadas em cada produto. Eles mudam a qualquer momento; vale o preço mostrado na loja.</p>${d.temIA ? '\n  <p>Alguns textos desta página são escritos por inteligência artificial a partir do nome e dos dados de cada produto. Confira os detalhes na página da loja antes de comprar.</p>' : ''}`;
  return moldura(site, { arquivo: guia.arquivo, titulo: guia.titulo, tituloSeo: `Melhores ${guia.tipo.nome} de ${d.ano} (Top ${d.itens.length})`, descricao, corpo, imagem: urlSegura(d.itens[0]?.imagem), tipo: 'article', dadosEstruturados, rodapeExtra, trilha: [['Guias', 'guias.html'], [guia.titulo]] });
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
  <p class="intro">Comparativos dos melhores produtos de cada tipo, ordenados pela nota de quem comprou e pelo volume de vendas, com os preços atualizados automaticamente.</p>
  ${blocos.join('\n  ')}`;
  return moldura(site, { arquivo: 'guias.html', titulo: 'Guias de compra: os melhores produtos comparados', tituloSeo: 'Guias de compra: melhores produtos comparados', descricao: `${site.guias.length} guias de compra do ${b.nome}: os melhores produtos de cada tipo comparados por nota, vendas e preço, com o que olhar antes de comprar.`, corpo, trilha: [['Guias']], largo: true });
}

function resumoDoPost(post: Post, site: Site): string {
  const imagem = urlSegura(post.dados.itens[0]?.imagem);
  const hoje = post.dia === site.hoje;
  return `<li class="resumo">
  ${imagem ? `<img src="${esc(imagem)}" alt="" width="88" height="88" loading="lazy" referrerpolicy="no-referrer">` : ''}
  <div>
    <h3><a href="${post.arquivo}">${esc(post.titulo)}</a></h3>
    <p class="data">${hoje ? 'Hoje' : dataBr(post.dia)} · ${esc(nomeDoTema(post.tema))} · ${post.dados.itens.length} produtos</p>
    <p>${esc(primeiraFrase(post.dados.intro, 170))}</p>
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

function heroDaHome(site: Site, titulo: string, texto: string): string {
  const b = site.config.blog;
  const produtos = new Set(site.guias.flatMap((g) => g.dados.itens.map(idDe))).size;
  const numeros = [site.guias.length ? `<li><strong>${site.guias.length}</strong><span>guias de compra</span></li>` : '', produtos ? `<li><strong>${produtos}</strong><span>produtos comparados</span></li>` : '', `<li><strong>30 min</strong><span>para atualizar</span></li>`].join('');
  const telegram = b.telegramLink && urlSegura(b.telegramLink) ? `<a class="botao claro" href="${esc(b.telegramLink)}" target="_blank" rel="noopener">Canal no Telegram</a>` : '';
  const categorias = site.temas.filter((t) => t !== TEMA_GERAL);
  const atalhos = categorias.length ? `\n  <nav class="chips" aria-label="Categorias">${categorias.map((t) => `<a href="categoria-${t}.html">${esc(nomeDoTema(t))}</a>`).join('')}</nav>` : '';
  return `<section class="hero">
    <div class="hero-texto">
      <h1>${esc(titulo)}</h1>
      <p>${esc(texto)}</p>
      <div class="hero-acoes">${site.guias.length ? '<a class="botao" href="guias.html">Ver guias de compra</a>' : ''}${telegram}</div>
    </div>
    <div class="hero-painel">
      <ul class="hero-numeros">${numeros}</ul>
      <p class="vivo"><span class="ponto" aria-hidden="true"></span>Preços atualizados a cada 30 minutos</p>
    </div>
  </section>
  <p class="confianca">Ranking feito com dados reais de nota e vendas. <a href="sobre.html">Veja como escolhemos</a>.</p>${atalhos}`;
}

function paginaInicial(site: Site): string {
  const b = site.config.blog;
  if (site.posts.length === 0) {
    const guias = secaoDeGuiasDaHome(site);
    const intro = guias ? 'Comparativos dos melhores produtos de cada tipo, com nota, vendas e preço. As ofertas do dia chegam em breve.' : 'Os primeiros posts chegam em breve. O robô publica aqui as melhores ofertas de cada dia.';
    return moldura(site, { arquivo: 'index.html', titulo: 'guias de compra e ofertas do dia', descricao: `${b.nome}: guias de compra com os melhores produtos comparados por nota e vendas, e as ofertas do dia com histórico de preço.`, corpo: `  ${heroDaHome(site, b.nome, intro)}\n  ${guias}`, largo: true });
  }
  const diaMaisNovo = site.posts[0].dia;
  const recentes = site.posts.filter((p) => p.dia === diaMaisNovo);
  const anteriores = site.posts.filter((p) => p.dia !== diaMaisNovo).slice(0, 24);
  const titulo = diaMaisNovo === site.hoje ? 'Ofertas de hoje' : `Ofertas de ${dataBr(diaMaisNovo)}`;
  const secaoDeGuias = secaoDeGuiasDaHome(site);
  const corpo = `  ${heroDaHome(site, `${b.nome}: guias de compra e ofertas do dia`, 'Comparamos os produtos mais bem avaliados e as melhores ofertas de cada dia, com histórico de preço, para você comprar com mais segurança.')}
  ${secaoDeGuias}<h2 class="secao">${esc(titulo)}</h2>
  ${listaDePosts(recentes, site)}
  ${anteriores.length ? `<h2 class="secao">Dias anteriores</h2>\n  ${listaDePosts(anteriores, site)}\n  <p><a href="arquivo.html">Ver todos os posts</a></p>` : ''}`;
  return moldura(site, { arquivo: 'index.html', titulo: 'guias de compra e ofertas do dia', descricao: `${b.nome}: guias de compra com os melhores produtos comparados por nota e vendas, e as ofertas do dia com histórico de preço.`, corpo, imagem: urlSegura(recentes[0]?.dados.itens[0]?.imagem), largo: true });
}

function paginaSobre(site: Site): string {
  const b = site.config.blog;
  const telegram = b.telegramLink && urlSegura(b.telegramLink) ? `<p>Dúvidas, sugestões ou algum erro? Fale com a gente pelo <a href="${esc(b.telegramLink)}" target="_blank" rel="noopener">canal do Telegram</a>.</p>` : '';
  const corpo = `  <article class="texto">
  <h1>Como escolhemos os produtos</h1>
  <p class="intro">${esc(b.nome)} é um site de comparativos e ofertas mantido por um sistema automático. Aqui está, sem rodeios, como cada lista é montada.</p>
  <nav class="indice" aria-label="Nesta página"><a href="#origem">De onde vêm os produtos</a><a href="#ranking">Como montamos o ranking</a><a href="#selos">Os selos</a><a href="#limites">O que não fazemos</a><a href="#dinheiro">Como ganhamos dinheiro</a></nav>
  <section class="bloco" id="origem">
  <h2>De onde vêm os produtos</h2>
  <p>Todos os dias o sistema lê as ofertas publicadas nas lojas parceiras e guarda nome, preço, preço anterior, nota dos compradores e volume de vendas de cada produto. Os preços são os que o robô viu na data indicada em cada produto; eles podem mudar a qualquer momento.</p>
  </section>
  <section class="bloco" id="ranking">
  <h2>Como montamos o ranking</h2>
  <p>Só entram produtos com boa avaliação de quem comprou. A ordem usa a nota dos compradores, corrigida pelo volume de vendas (uma nota 5,0 com poucas vendas vale menos que uma 4,8 com milhares), e o próprio volume de vendas. Desconto e frete grátis não entram na ordem, porque mudam toda hora e não dizem se o produto é bom. Por isso um produto muito barato, mas mal avaliado, não aparece no topo.</p>
  <p>As listas têm 3, 5 ou 10 produtos, conforme quantos bons encontramos. Para a recomendação ser confiável, um produto só perde o lugar quando outro o supera por uma margem clara, ou quando deixa de aparecer nas lojas por semanas. Os preços são atualizados a cada rodada do robô.</p>
  </section>
  <section class="bloco" id="selos">
  <h2>O que significam os selos</h2>
  <ul>
    <li><strong>Melhor custo-benefício:</strong> a melhor pontuação (nota e vendas) em relação ao preço, comparado com o preço típico da lista. Não é necessariamente o primeiro colocado nem o mais barato.</li>
    <li><strong>Mais vendido:</strong> o produto com maior volume de vendas informado pela loja.</li>
    <li><strong>Melhor avaliado:</strong> a maior nota entre os compradores.</li>
    <li><strong>Mais barato da lista:</strong> o menor preço entre os comparados, que não é necessariamente o melhor produto.</li>
  </ul>
  </section>
  <section class="bloco destaque-bloco" id="limites">
  <h2>O que não fazemos</h2>
  <p>Não recebemos os aparelhos para teste: as comparações usam os dados públicos das lojas, não testes próprios. Alguns textos são escritos por inteligência artificial a partir do nome e dos dados de cada produto, e o sistema é instruído a não inventar especificações. Mesmo assim, confira as características na página da loja antes de comprar.</p>
  </section>
  <section class="bloco" id="dinheiro">
  <h2>Como ganhamos dinheiro</h2>
  <p>Os links para as lojas são links de afiliado: se você comprar depois de clicar, podemos receber uma pequena comissão da loja, sem nenhum custo extra para você. Isso não muda a posição dos produtos nas listas. Veja mais em <a href="privacidade.html">Privacidade e afiliados</a>.</p>
  ${telegram}
  </section>
  </article>`;
  return moldura(site, { arquivo: 'sobre.html', titulo: 'Como escolhemos os produtos', descricao: `Como o ${b.nome} escolhe e ordena os produtos: critérios do ranking, significado dos selos, origem dos dados e como o site ganha dinheiro.`, corpo, trilha: [['Como escolhemos']] });
}

function paginaPrivacidade(site: Site): string {
  const b = site.config.blog;
  const corpo = `  <article class="texto">
  <h1>Privacidade e afiliados</h1>
  <p class="intro">Resumo claro do que acontece com os seus dados e dos links deste site.</p>
  <nav class="indice" aria-label="Nesta página"><a href="#afiliados">Links de afiliado</a><a href="#dados">Dados pessoais</a><a href="#imagens">Imagens e preços</a><a href="#ia">Inteligência artificial</a><a href="#contato">Contato</a></nav>
  <section class="bloco" id="afiliados">
  <h2>Links de afiliado</h2>
  <p>${esc(b.nome)} participa de programas de afiliados de lojas online. Quando você clica em um botão ou link de produto e compra, a loja pode nos pagar uma comissão. O preço para você é o mesmo. Esses links são marcados como patrocinados (<code>rel="sponsored"</code>).</p>
  </section>
  <section class="bloco" id="dados">
  <h2>Dados pessoais</h2>
  <p>Este site não tem cadastro, comentários nem formulários, e não coleta nome, e-mail ou telefone. Ele não usa cookies próprios de publicidade nem ferramentas de rastreamento. Ao abrir um link de loja, você passa a seguir as regras de privacidade dessa loja.</p>
  </section>
  <section class="bloco" id="imagens">
  <h2>Imagens e preços</h2>
  <p>As imagens e os preços pertencem às lojas e são exibidos para facilitar a comparação. O preço correto é sempre o que aparece na página da loja no momento da compra.</p>
  </section>
  <section class="bloco" id="ia">
  <h2>Inteligência artificial</h2>
  <p>Parte dos textos é escrita por inteligência artificial a partir dos dados públicos de cada produto. Eles não substituem a descrição oficial da loja.</p>
  </section>
  <section class="bloco" id="contato">
  <h2>Contato</h2>
  ${b.telegramLink && urlSegura(b.telegramLink) ? `<p>Pelo <a href="${esc(b.telegramLink)}" target="_blank" rel="noopener">canal do Telegram</a>.</p>` : '<p>Pelo canal do Telegram do site.</p>'}
  </section>
  </article>`;
  return moldura(site, { arquivo: 'privacidade.html', titulo: 'Privacidade e afiliados', descricao: `Como o ${b.nome} usa links de afiliado, imagens e preços das lojas, e o que acontece com os seus dados: sem cadastro e sem rastreamento.`, corpo, trilha: [['Privacidade e afiliados']] });
}

/** Página 404 com saída clara: voltar ao início, ver os guias ou escolher uma categoria. */
function pagina404(site: Site): string {
  const categorias = site.temas.filter((t) => t !== TEMA_GERAL);
  const atalhos = categorias.length ? `\n  <nav class="chips" aria-label="Categorias">${categorias.map((t) => `<a href="categoria-${t}.html">${esc(nomeDoTema(t))}</a>`).join('')}</nav>` : '';
  const corpo = `  <section class="erro404">
  <p class="numero" aria-hidden="true">404</p>
  <h1>Página não encontrada</h1>
  <p>Este endereço não existe ou o post saiu do ar: as ofertas antigas são removidas depois de um tempo. Os guias de compra e as ofertas de hoje continuam aqui.</p>
  <div class="hero-acoes"><a class="botao" href="index.html">Ir para o início</a>${site.guias.length ? '<a class="botao claro" href="guias.html">Ver guias de compra</a>' : ''}</div>${atalhos}
  </section>`;
  return moldura(site, { arquivo: '404.html', titulo: 'Página não encontrada', descricao: `Esta página não existe mais. Veja os guias de compra e as ofertas de hoje do ${site.config.blog.nome}.`, corpo });
}

function paginaDoTema(site: Site, tema: string): string {
  const b = site.config.blog;
  const posts = site.posts.filter((p) => p.tema === tema);
  const nome = nomeDoTema(tema);
  const guias = tema === TEMA_GERAL ? [] : site.guias.filter((g) => g.tipo.categoria === tema);
  const tiposDosGuias = guias.slice(0, 3).map((g) => g.tipo.nome);
  const paragrafos = [
    tema === TEMA_GERAL
      ? `Todos os dias o ${esc(b.nome)} reúne as melhores ofertas de todas as categorias que o robô encontra nas lojas parceiras. Cada produto mostra o preço, a nota de quem comprou, o volume de vendas e, quando já temos dados suficientes, o histórico de preço, para você saber se o desconto é de verdade.`
      : `Aqui estão as melhores ofertas de ${esc(nome)} que o ${esc(b.nome)} encontra todos os dias nas lojas parceiras. Cada produto mostra o preço, a nota de quem comprou, o volume de vendas e, quando já temos dados suficientes, o histórico de preço, para você saber se o desconto é de verdade.`,
    guias.length
      ? 'Prefere comparar com calma? Os guias de compra abaixo reúnem os produtos mais bem avaliados de cada tipo e explicam o que olhar antes de decidir.'
      : 'Prefere comparar com calma? Veja os guias de compra, que reúnem os produtos mais bem avaliados de cada tipo e explicam o que olhar antes de decidir.',
    'Os preços mudam o tempo todo: confira sempre o valor na loja antes de comprar. Para entender como montamos cada lista, leia <a href="sobre.html">Como escolhemos os produtos</a>.',
  ];
  const corpo = `  <h1>${esc(nome)}: ofertas do dia${guias.length ? ' e guias de compra' : ''}</h1>
  ${paragrafos.map((p, i) => `<p class="intro${i === 0 ? '' : ' apoio'}">${p}</p>`).join('\n  ')}
  ${guias.length ? `<h2 class="secao">Guias de compra de ${esc(nome)}</h2>\n  <ul class="posts">\n${guias.map(cartaoDeGuia).join('\n')}\n  </ul>\n  ` : ''}<h2 class="secao">Ofertas de ${esc(nome)}, dia a dia</h2>
  ${listaDePosts(posts, site)}`;
  const descricao = guias.length
    ? `Ofertas de ${nome} do dia e guias de compra de ${tiposDosGuias.join(', ')}: nota, vendas e histórico de preço, atualizados a cada 30 minutos.`
    : `Ofertas de ${nome} do dia, com nota de quem comprou, volume de vendas e histórico de preço. Atualizado todos os dias.`;
  return moldura(site, { arquivo: `categoria-${tema}.html`, titulo: `${nome}: ofertas por dia`, tituloSeo: guias.length ? `${nome}: ofertas do dia e guias de compra` : `${nome}: ofertas do dia`, descricao, corpo, trilha: [[nome]], largo: true });
}

function paginaDoArquivo(site: Site): string {
  const dias = [...new Set(site.posts.map((p) => p.dia))];
  const blocos = dias.map((dia) => `<h2 class="secao">${dia === site.hoje ? 'Hoje' : dataBr(dia)}</h2>\n  ${listaDePosts(site.posts.filter((p) => p.dia === dia), site)}`);
  const corpo = `  <h1>Arquivo</h1>
  <p class="intro">Todos os posts que estão no ar, por dia. Posts antigos mostram os preços do dia em que foram escritos.</p>
  ${blocos.join('\n  ') || '<p>Ainda não há posts.</p>'}`;
  return moldura(site, { arquivo: 'arquivo.html', titulo: 'Arquivo de posts', descricao: `Arquivo de ofertas do ${site.config.blog.nome}: todos os posts por dia, com os preços do dia em que foram escritos e o histórico de preço.`, corpo, trilha: [['Arquivo']], largo: true });
}

const ESTILO = `:root{--fundo:#f6f7f9;--cartao:#fff;--texto:#111827;--suave:#5b6474;--borda:#e4e7ee;--borda-forte:#cfd5e1;--cor:#d6336c;--cor-forte:#b5214f;--cor-texto:#fff;--cor-suave:#fdecf2;--ok:#0b7a52;--ok-fundo:#e6f6ef;--aviso-fundo:#fff4d6;--aviso:#7a4a00;--estrela:#f08c00;--sombra:0 1px 2px rgba(16,24,40,.05),0 6px 18px rgba(16,24,40,.06);--sombra-forte:0 2px 4px rgba(16,24,40,.06),0 16px 36px rgba(16,24,40,.10);--raio:16px}
@media (prefers-color-scheme:dark){:root{--fundo:#0b0d12;--cartao:#141821;--texto:#eef0f5;--suave:#9aa3b3;--borda:#232837;--borda-forte:#323a4f;--cor:#f06595;--cor-forte:#ff8fb3;--cor-texto:#13151b;--cor-suave:#2a1823;--ok:#4cd694;--ok-fundo:#10281e;--aviso-fundo:#3a2c0c;--aviso:#f2c261;--estrela:#ffd43b;--sombra:none;--sombra-forte:0 12px 32px rgba(0,0,0,.40)}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:76px}
body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--cor-forte)}
img{max-width:100%}
.pular{position:absolute;left:-999px;top:8px;background:var(--texto);color:var(--fundo);padding:8px 12px;border-radius:8px;z-index:20}
.pular:focus{left:8px}
.topo{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--cartao) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--borda)}
.topo-miolo{max-width:1120px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:8px 22px;flex-wrap:wrap}
.marca{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.15rem;color:var(--texto);text-decoration:none;letter-spacing:-.015em}
.logo{color:var(--cor);flex:none}
nav[aria-label="Seções"]{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0}
nav[aria-label="Seções"]::-webkit-scrollbar{display:none}
nav[aria-label="Seções"] a{white-space:nowrap;padding:7px 14px;border-radius:999px;color:var(--suave);text-decoration:none;font-size:.9rem;font-weight:600;transition:background .12s,color .12s}
nav[aria-label="Seções"] a:hover{background:var(--cor-suave);color:var(--cor-forte)}
nav[aria-label="Seções"] a[aria-current]{background:var(--texto);color:var(--fundo)}
main{max-width:880px;margin:0 auto;padding:28px 20px 12px}
main.largo{max-width:1120px}
.trilha{font-size:.84rem;color:var(--suave);margin:0 0 16px}
.trilha a{color:var(--suave)}
h1{font-size:clamp(1.7rem,4.4vw,2.4rem);line-height:1.12;letter-spacing:-.025em;margin:6px 0 10px}
h2{line-height:1.25}
.secao{display:flex;align-items:center;gap:12px;font-size:1.4rem;margin:44px 0 18px;letter-spacing:-.015em}
.secao::before{content:"";flex:none;width:5px;height:1.15em;border-radius:3px;background:var(--cor)}
.data{color:var(--suave);margin:0 0 16px;font-size:.875rem}
.data a{color:var(--suave)}
.intro{margin:0 0 24px;font-size:1.08rem;color:var(--texto);max-width:68ch}
.antigo{background:var(--aviso-fundo);color:var(--aviso);border-radius:12px;padding:12px 16px;margin:0 0 18px}
.antigo a{color:inherit;font-weight:700}
.hero{position:relative;overflow:hidden;display:grid;grid-template-columns:1.2fr .8fr;gap:28px 36px;align-items:center;background:radial-gradient(760px 280px at 92% -12%,color-mix(in srgb,var(--cor) 26%,transparent),transparent 62%),linear-gradient(140deg,var(--cor-suave),var(--cartao) 70%);border:1px solid var(--borda);border-radius:26px;padding:clamp(24px,5vw,52px);margin:4px 0 16px;box-shadow:var(--sombra-forte)}
.hero-texto h1{font-size:clamp(1.9rem,4.8vw,3rem);max-width:17ch;margin:0 0 16px;line-height:1.06;letter-spacing:-.032em}
.hero-texto p{margin:0 0 24px;max-width:50ch;color:var(--suave);font-size:1.08rem}
.hero-acoes{display:flex;flex-wrap:wrap;gap:12px}
.hero-painel{display:grid;gap:14px}
.hero-numeros{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.hero-numeros li{display:flex;flex-direction:column;align-items:center;text-align:center;background:color-mix(in srgb,var(--cartao) 78%,transparent);border:1px solid var(--borda);border-radius:16px;padding:16px 8px}
.hero-numeros strong{font-size:clamp(1.3rem,5.4vw,1.75rem);line-height:1.05;letter-spacing:-.02em;white-space:nowrap}
.hero-numeros span{font-size:.76rem;color:var(--suave);margin-top:4px;line-height:1.25}
.vivo{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;font-size:.85rem;color:var(--suave)}
.ponto{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 color-mix(in srgb,var(--ok) 55%,transparent);animation:pulso 2.4s infinite}
@keyframes pulso{70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}
.confianca{color:var(--suave);font-size:.875rem;margin:0 0 4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}
.chips a{padding:8px 16px;border-radius:999px;border:1px solid var(--borda);background:var(--cartao);color:var(--texto);text-decoration:none;font-size:.9rem;font-weight:600;transition:border-color .12s,color .12s,transform .12s}
.chips a:hover{border-color:var(--cor);color:var(--cor-forte);transform:translateY(-1px)}
.lista,.posts{list-style:none;margin:0;padding:0;display:grid;gap:16px}
.posts{grid-template-columns:repeat(auto-fill,minmax(min(100%,255px),1fr))}
.cartao{position:relative;display:grid;grid-template-columns:168px 1fr;gap:24px;background:var(--cartao);border:1px solid var(--borda);border-radius:var(--raio);padding:22px;box-shadow:var(--sombra);transition:box-shadow .15s,border-color .15s}
.cartao:hover{box-shadow:var(--sombra-forte)}
.cartao.primeiro{border-color:var(--cor);box-shadow:0 0 0 1px var(--cor),var(--sombra-forte)}
.posicao{position:absolute;top:-12px;left:-10px;min-width:34px;height:34px;padding:0 8px;border-radius:999px;background:var(--texto);color:var(--fundo);display:grid;place-items:center;font-weight:800;font-size:.95rem;box-shadow:var(--sombra-forte)}
.cartao.primeiro .posicao{background:var(--cor);color:var(--cor-texto)}
.cartao img,.semimagem{width:168px;height:168px;border-radius:14px;object-fit:contain;background:#fff;border:1px solid var(--borda);padding:8px}
.semimagem{background:var(--borda)}
.corpo{min-width:0;display:flex;flex-direction:column;gap:9px}
.cartao h2{font-size:1.08rem;line-height:1.35;margin:0;overflow-wrap:anywhere}
.avaliacao{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:0;font-size:.9rem;color:var(--suave)}
.estrelas{display:inline-flex;align-items:center;gap:5px;color:var(--estrela)}
.estrelas b{color:var(--texto);font-size:.95rem}
.estrelas svg{display:block}
.preco{margin:0}
.preco s{color:var(--suave);font-size:.95rem;margin-right:4px}
.preco strong{font-size:1.8rem;letter-spacing:-.02em;line-height:1.1}
.selos{margin:0;display:flex;flex-wrap:wrap;gap:6px}
.selo{font-size:.76rem;font-weight:600;padding:4px 10px;border-radius:999px;border:1px solid color-mix(in srgb,var(--ok) 35%,transparent);color:var(--ok);background:var(--ok-fundo)}
.selo.destaque{background:var(--cor);border-color:var(--cor);color:var(--cor-texto);font-weight:700}
.social{margin:0;color:var(--suave);font-size:.82rem}
.analise{margin:0}
.grafico{margin:0;color:var(--ok)}
.grafico svg{display:block}
.grafico figcaption{color:var(--suave);font-size:.75rem}
.botao{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 24px;background:var(--cor);color:var(--cor-texto);font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,.10),0 8px 18px color-mix(in srgb,var(--cor) 26%,transparent);transition:transform .12s,background .12s,box-shadow .12s}
.botao:hover{background:var(--cor-forte);transform:translateY(-1px)}
.cartao .botao{align-self:flex-start;margin-top:4px}
.cartao .botao::after{content:"\\2197";font-weight:700}
.botao.claro{background:var(--cartao);color:var(--texto);border:1px solid var(--borda-forte);box-shadow:none}
.botao.claro:hover{background:var(--cor-suave);color:var(--cor-forte)}
.botao:focus-visible,a:focus-visible{outline:3px solid var(--cor);outline-offset:3px}
.resumo{position:relative;display:flex;flex-direction:column;gap:14px;background:var(--cartao);border:1px solid var(--borda);border-radius:var(--raio);padding:14px;box-shadow:var(--sombra);transition:border-color .15s,transform .15s,box-shadow .15s}
.resumo:hover{border-color:var(--cor);transform:translateY(-3px);box-shadow:var(--sombra-forte)}
.resumo img{width:100%;height:150px;object-fit:contain;background:#fff;border-radius:12px;border:1px solid var(--borda);padding:10px}
.resumo div{min-width:0}
.resumo h3{font-size:1.04rem;line-height:1.3;margin:0 0 6px;overflow-wrap:anywhere;letter-spacing:-.005em}
.resumo h3 a{color:var(--texto);text-decoration:none}
.resumo h3 a::after{content:"";position:absolute;inset:0}
.resumo p{margin:0;font-size:.9rem;color:var(--suave)}
.resumo .data{margin:0 0 6px;font-size:.8rem}
.escolhas{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:14px}
.escolha{display:flex;flex-direction:column;gap:8px;background:var(--cartao);border:1px solid var(--borda);border-top:3px solid var(--cor);border-radius:var(--raio);padding:16px;box-shadow:var(--sombra)}
.escolha-selos{display:flex;flex-wrap:wrap;gap:6px}
.escolha-rotulo{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--cor-forte);background:var(--cor-suave);padding:4px 10px;border-radius:999px}
.escolha img{width:84px;height:84px;object-fit:contain;background:#fff;border-radius:10px;border:1px solid var(--borda);padding:4px}
.escolha-nome{color:var(--texto);font-weight:600;font-size:.93rem;line-height:1.35;text-decoration:none;overflow-wrap:anywhere}
.escolha-nome:hover{color:var(--cor-forte)}
.escolha-preco{font-weight:800;font-size:1.2rem;letter-spacing:-.01em}
.fim{margin:34px 0 0}
.fim h2{font-size:1.3rem;margin:0 0 10px}
.fim p{margin:0}
.fim ul{margin:0 0 14px;padding-left:20px}
.fim li{margin-bottom:8px}
.chamada{margin:44px 0 14px;padding:24px 26px;border:1px solid var(--borda);background:linear-gradient(135deg,var(--cor-suave),var(--cartao) 75%);border-radius:20px;display:flex;flex-wrap:wrap;gap:14px 24px;align-items:center;justify-content:space-between;box-shadow:var(--sombra)}
.chamada div{display:flex;flex-direction:column;min-width:0}
.chamada strong{font-size:1.1rem;letter-spacing:-.01em}
.chamada span{color:var(--suave);font-size:.92rem}
.tabela{overflow-x:auto;border:1px solid var(--borda);border-radius:var(--raio);background:var(--cartao);box-shadow:var(--sombra)}
table{width:100%;min-width:760px;border-collapse:collapse;font-size:.9rem}
th,td{padding:13px 14px;text-align:left;border-bottom:1px solid var(--borda);vertical-align:middle}
th:first-child,td:first-child{width:48px;text-align:center}
td:nth-child(2){min-width:240px;line-height:1.4}
td:nth-child(2) a{text-decoration-thickness:1px;text-underline-offset:3px}
th:nth-child(4),td:nth-child(4){width:100px}
th:nth-child(4){white-space:normal;line-height:1.25}
td:nth-child(7){min-width:200px}
.etiquetas{display:flex;flex-wrap:wrap;gap:5px}
.etiqueta{white-space:nowrap;font-size:.72rem;font-weight:700;color:var(--cor-forte);background:var(--cor-suave);padding:3px 10px;border-radius:999px}
tbody tr:last-child td{border-bottom:0}
tbody tr:nth-child(even){background:color-mix(in srgb,var(--borda) 26%,transparent)}
tbody tr:hover{background:var(--cor-suave)}
td:first-child{font-weight:800;color:var(--cor-forte)}
td:nth-child(3),td:nth-child(4),td:nth-child(5),td:nth-child(6){white-space:nowrap}
th{background:color-mix(in srgb,var(--borda) 40%,var(--cartao));color:var(--suave);font-weight:700;font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;vertical-align:middle}
.intro.apoio{font-size:1rem;color:var(--suave);margin:0 0 12px}
h1+.intro,h1+.data{margin-top:14px}
.bloco{background:var(--cartao);border:1px solid var(--borda);border-radius:var(--raio);padding:22px 26px;margin:0 0 16px;box-shadow:var(--sombra)}
.texto .bloco h2,.bloco h2{margin:0 0 10px;font-size:1.2rem}
.bloco p,.bloco li{max-width:70ch}
.bloco p:last-child,.bloco ul:last-child{margin-bottom:0}
.bloco ul{margin:0;padding-left:20px}
.bloco li{margin-bottom:8px}
.bloco.destaque-bloco{border-left:4px solid var(--cor)}
.indice{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px}
.indice a{padding:7px 14px;border:1px solid var(--borda);border-radius:999px;background:var(--cartao);color:var(--texto);text-decoration:none;font-size:.88rem;font-weight:600;transition:border-color .12s,color .12s}
.indice a:hover{border-color:var(--cor);color:var(--cor-forte)}
.erro404{text-align:center;padding:48px 0 12px}
.erro404 .numero{font-size:clamp(4.5rem,18vw,8rem);font-weight:900;letter-spacing:-.05em;line-height:1;color:var(--cor);margin:0}
.erro404 h1{margin:4px 0 12px}
.erro404 p{color:var(--suave);max-width:48ch;margin:0 auto 24px}
.erro404 .hero-acoes{justify-content:center}
.erro404 .chips{justify-content:center;margin-top:28px}
.faq h3{font-size:1.02rem;margin:20px 0 6px}
.faq p{margin:0;color:var(--suave)}
.texto h2{font-size:1.25rem;margin:30px 0 10px}
.texto p,.texto li{max-width:70ch}
.texto code{background:var(--borda);padding:1px 6px;border-radius:6px;font-size:.9em}
.rodape{margin-top:48px;border-top:1px solid var(--borda);background:var(--cartao);color:var(--suave);font-size:.86rem}
.rodape-miolo{max-width:1120px;margin:0 auto;padding:36px 20px 40px;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:28px 40px}
.rodape p{margin:0 0 10px}
.rodape-nome{display:flex;align-items:center;gap:9px;font-weight:800;color:var(--texto);font-size:1.05rem}
.rodape-titulo{font-weight:800;color:var(--texto);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px}
.rodape-links{display:flex;flex-direction:column;gap:8px}
.rodape-aviso{grid-column:1/-1;border-top:1px solid var(--borda);padding-top:20px}
.rodape-aviso p{max-width:90ch}
.rodape a{color:var(--suave);text-decoration:none}
.rodape a:hover{color:var(--cor-forte);text-decoration:underline}
@media (max-width:820px){table{min-width:600px}th,td{padding:12px 10px}th:nth-child(4),td:nth-child(4){display:none}.hero{grid-template-columns:1fr}.hero-texto h1{max-width:none}.rodape-miolo{grid-template-columns:1fr 1fr}.rodape-marca{grid-column:1/-1}}
@media (max-width:560px){main{padding:20px 16px 8px}.topo-miolo{padding:10px 16px}.cartao{grid-template-columns:1fr;padding:18px}.cartao img{width:100%;height:200px}.semimagem{display:none}.posicao{left:-4px}.hero-acoes .botao{flex:1}.cartao .botao{align-self:stretch}.rodape-miolo{grid-template-columns:1fr}.secao{margin-top:36px;font-size:1.25rem}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;
VERSAO_DO_ESTILO = createHash('sha1').update(ESTILO).digest('hex').slice(0, 8);

// ───────────── IA ─────────────

/** Limpa o texto devolvido pelo modelo. Devolve undefined se ele não servir. */
/** O texto termina como uma frase de verdade? */
export function terminaBem(t: string): boolean {
  return /[.!?…]["”')]?$/.test(t.trim());
}

export function limparTextoDeIA(bruto: string): string | undefined {
  let t = bruto
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '');
  if (t.length < 40) return undefined;
  // Texto cortado no meio da frase: aproveita até a última frase completa ou descarta.
  if (!terminaBem(t)) {
    const fim = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '));
    if (fim < 60) return undefined;
    t = t.slice(0, fim + 1);
  }
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

const ENDERECOS_DO_GITHUB_MODELS = ['https://models.github.ai/inference/chat/completions', 'https://models.inference.ai.azure.com/chat/completions'];

/** IA gratuita do GitHub (GitHub Models). No GitHub Actions, usa o token do próprio workflow. Tenta o endereço novo e, se ele não responder direito, o antigo. */
export async function pedirAoGitHub(token: string, modelo: string, prompt: string, fetchFn: Fetch = fetch): Promise<string> {
  const falhas: string[] = [];
  for (const endereco of ENDERECOS_DO_GITHUB_MODELS) {
    let resposta: Response;
    try {
      resposta = await fetchFn(endereco, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
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
    } catch (e) {
      const erro = e as Error & { cause?: { code?: string; message?: string } };
      falhas.push(`${new URL(endereco).host}: sem conexão (${erro.cause?.code ?? erro.cause?.message ?? erro.message})`);
      continue;
    }
    if (resposta.status === 429) throw new Error('limite gratuito do GitHub Models atingido por agora');
    const corpo = await resposta.text().catch(() => '');
    const trecho = corpo.replace(/\s+/g, ' ').slice(0, 120);
    if (resposta.status === 401 || resposta.status === 403) {
      falhas.push(`${new URL(endereco).host}: recusou o token (${resposta.status}; no workflow, confira a permissão "models: read") "${trecho}"`);
      continue;
    }
    if (!resposta.ok) {
      falhas.push(`${new URL(endereco).host}: respondeu ${resposta.status}${/model/i.test(corpo) ? ` (o modelo "${modelo}" existe?)` : ''} "${trecho}"`);
      continue;
    }
    try {
      const dados = JSON.parse(corpo) as { choices?: Array<{ message?: { content?: string } }> };
      return dados.choices?.[0]?.message?.content ?? '';
    } catch {
      falhas.push(`${new URL(endereco).host}: devolveu algo que não é JSON (${resposta.status}) "${trecho}"`);
    }
  }
  throw new Error(`GitHub Models indisponível — ${falhas.join(' | ')}`);
}

/** IA gratuita do Google (Gemini), pelo endereço compatível com o formato OpenAI. */
export async function pedirAoGemini(chave: string, modelo: string, prompt: string, fetchFn: Fetch = fetch, esperaMs = 4000): Promise<string> {
  // Erro 503/500 é falta de capacidade momentânea do Google: espera e tenta de novo (até 3 vezes).
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await pedirAoGeminiUmaVez(chave, modelo, prompt, fetchFn);
    } catch (e) {
      const passageiro = /respondeu (500|502|503|504)/.test((e as Error).message);
      if (!passageiro || tentativa >= 3) throw e;
      await new Promise((r) => setTimeout(r, esperaMs * tentativa));
    }
  }
}

async function pedirAoGeminiUmaVez(chave: string, modelo: string, prompt: string, fetchFn: Fetch): Promise<string> {
  let resposta: Response;
  try {
    resposta = await fetchFn('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: 'Você escreve em português do Brasil para um blog de ofertas. Segue as regras à risca e devolve somente o texto pedido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 700,
        reasoning_effort: 'none',
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    const erro = e as Error & { cause?: { code?: string; message?: string } };
    throw new Error(`Gemini sem conexão (${erro.cause?.code ?? erro.cause?.message ?? erro.message})`);
  }
  const corpo = await resposta.text().catch(() => '');
  const trecho = corpo.replace(/\s+/g, ' ').slice(0, 160);
  if (resposta.status === 429) throw new Error('limite gratuito do Gemini atingido por agora');
  if (resposta.status === 400 || resposta.status === 401 || resposta.status === 403) throw new Error(`o Gemini recusou (${resposta.status}): confira a chave GEMINI_API_KEY e o modelo "${modelo}" — "${trecho}"`);
  if (!resposta.ok) throw new Error(`Gemini respondeu ${resposta.status} "${trecho}"`);
  try {
    return (JSON.parse(corpo) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? '';
  } catch {
    throw new Error(`Gemini devolveu algo que não é JSON (${resposta.status}) "${trecho}"`);
  }
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
  if (b.ia === 'gemini') {
    if (!b.geminiChave) {
      avisos.push('BLOG_IA=gemini, mas falta o segredo GEMINI_API_KEY (chave grátis em aistudio.google.com).');
      return undefined;
    }
    return { modelo: b.geminiModelo, pausaMs: b.githubPausaMs, maxPorRodada: 25, pedir: async (prompt) => {
        try {
          return await pedirAoGemini(b.geminiChave, b.geminiModelo, prompt, fetchFn);
        } catch (e) {
          // Se o modelo principal está sobrecarregado ou saiu do ar, tenta o reserva antes de desistir.
          if (!b.geminiReserva || b.geminiReserva === b.geminiModelo || /recusou/.test((e as Error).message)) throw e;
          return await pedirAoGemini(b.geminiChave, b.geminiReserva, prompt, fetchFn);
        }
      } };
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
  return `Reunimos ${itens.length} ${tipo.nome} bem avaliados que apareceram nas lojas nos últimos dias (${listarLojas(itens)}). A lista é ordenada pela nota de quem comprou e pelo volume de vendas, e cada produto mostra a data em que o preço foi visto.`;
}

function diaMenos(agora: Date, dias: number): string {
  return diaDe(new Date(agora.getTime() - dias * 86_400_000));
}

/** Imagem 1200x630 usada na pré-visualização (WhatsApp, Facebook, X...) das páginas que não têm foto própria. */
async function gravarImagemPadrao(pasta: string, nome: string): Promise<boolean> {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const marca = nome.replace(/[&<>"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif">
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6336c"/><stop offset="1" stop-color="#6d1033"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#f)"/>
<rect x="90" y="90" width="110" height="110" rx="28" fill="#ffffff"/><path d="M118 152l32-32h32v32l-32 32z" fill="#d6336c"/><circle cx="170" cy="130" r="8" fill="#ffffff"/>
<text x="90" y="330" font-size="92" font-weight="700" fill="#ffffff">${marca}</text>
<text x="90" y="420" font-size="44" fill="#ffe3ec">Guias de compra e ofertas do dia,</text>
<text x="90" y="480" font-size="44" fill="#ffe3ec">com nota, vendas e histórico de preço.</text>
</svg>`;
    writeFileSync(join(pasta, 'og-padrao.png'), Buffer.from(new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Sans' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng()));
    return true;
  } catch {
    return false;
  }
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
  // A lista publicada é o ponto de partida: quem já está nela só sai se aparecer alguém claramente melhor.
  const guiasPublicados = new Map<string, string[]>();
  for (const salvo of banco.guiasSalvos()) {
    const g = paraGuia(salvo);
    if (g) guiasPublicados.set(g.tipo.slug, g.dados.itens.map(chaveDoProduto));
  }
  for (const { tipo: slug } of banco.tiposComProdutos(DIAS_DOS_VETERANOS_NO_GUIA, agora)) {
    const tipo = TIPOS_DE_GUIA.find((t) => t.slug === slug);
    if (!tipo) continue;
    const itens = escolherParaGuia(banco.produtosDoGuia(slug, DIAS_DOS_VETERANOS_NO_GUIA, 120, agora), tipo, {
      anteriores: guiasPublicados.get(slug) ?? [],
      agora: agora.getTime(),
      diasDosDesafiantes: DIAS_DE_VALIDADE_NO_GUIA,
    });
    if (itens.length === 0) continue;
    // Sem nenhum preço recente, o guia publicado fica como está (não vale dizer "atualizado agora").
    if (!itens.some((i) => agora.getTime() - i.vistoEm <= DIAS_DE_VALIDADE_NO_GUIA * 86_400_000)) continue;
    guiaRascunhos.push({ tipo, arquivo: `melhores-${slug}.html`, titulo: tituloDoGuia(tipo, itens.length, ano), itens });
  }

  // 2. A IA escreve o que ainda não foi escrito. Qualquer falha só desliga a IA nesta rodada.
  let escritor = rascunhos.length || guiaRascunhos.length ? await prepararEscritor(config, fetchFn, resultado.avisos) : undefined;
  let pedidos = 0;
  let avisouLimite = false;
  const escrever = async (chave: string, validadeEmDias: number, prompt: () => string): Promise<string | undefined> => {
    if (b.ia === 'nenhuma') return undefined;
    const salvo = banco.textoSalvo(chave, validadeEmDias, agora);
    if (salvo && terminaBem(salvo)) return salvo; // texto antigo cortado no meio é refeito
    if (!escritor) return salvo && terminaBem(salvo) ? salvo : undefined;
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
  if (b.url && (await gravarImagemPadrao(b.pasta, b.nome))) site.imagemPadrao = `${b.url}/og-padrao.png`;
  const gravar = (arquivo: string, html: string) => {
    writeFileSync(join(b.pasta, arquivo), html, 'utf8');
    resultado.paginas.push(arquivo);
  };
  for (const post of posts) gravar(post.arquivo, paginaDoPost(site, post));
  for (const guia of guias) gravar(guia.arquivo, paginaDoGuia(site, guia));
  if (guias.length) gravar('guias.html', paginaDosGuias(site));
  for (const tema of temas) gravar(`categoria-${tema}.html`, paginaDoTema(site, tema));
  gravar('arquivo.html', paginaDoArquivo(site));
  gravar('sobre.html', paginaSobre(site));
  gravar('privacidade.html', paginaPrivacidade(site));
  gravar('index.html', paginaInicial(site));
  gravar('404.html', pagina404(site));

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
