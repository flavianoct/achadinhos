import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { formatarPreco, formatarVendas } from './mensagem.ts';
import type { OfertaAvaliada } from './types.ts';

type Fetch = typeof fetch;

/** Produto visto há mais tempo que isso sai do blog (o preço pode ter mudado). */
const HORAS_DE_VALIDADE = 36;
const DIAS_DO_GRAFICO = 30;
/** O texto de um produto é reaproveitado por este tempo antes de ser reescrito. */
const DIAS_DO_TEXTO_DE_PRODUTO = 14;
/** A abertura e o fechamento de um post com os mesmos produtos são reaproveitados por este tempo. */
const DIAS_DO_TEXTO_DE_POST = 3;
/** Teto de textos novos por rodada, para a geração não demorar demais. O que faltar entra na rodada seguinte. */
const MAX_TEXTOS_POR_RODADA = 30;

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
  paginas: string[];
  produtos: number;
  /** Quantos textos a IA escreveu nesta rodada (os já escritos antes são reaproveitados). */
  textosDeIA: number;
  /** Modelo usado, quando a IA está ligada e respondeu. */
  modeloDeIA?: string;
  avisos: string[];
  publicacao?: string;
}

interface Pagina {
  arquivo: string;
  titulo: string;
  rotulo: string;
  itens: OfertaAvaliada[];
  tema: string;
}

/** Textos de um post. O que a IA não escreveu fica undefined e a página usa o texto padrão (ou nada). */
interface TextosDoPost {
  intro: string;
  fim?: string;
  porProduto: Map<string, string>;
  temIA: boolean;
}

/** Tamanho da lista: Top 10, Top 5 ou Top 3. Com menos de 3 produtos, a página não é criada. */
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

function dataPorExtenso(agora: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(agora).replace(',', ' às');
}

function listarLojas(itens: OfertaAvaliada[]): string {
  const nomes = [...new Set(itens.map((i) => NOME_DA_LOJA[i.loja] ?? i.loja))];
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

const idDe = (o: OfertaAvaliada) => `${o.loja}:${o.idProduto}`;

function introPadrao(p: Pagina): string {
  return `Selecionamos ${p.itens.length} ofertas de ${p.tema} encontradas hoje em ${listarLojas(p.itens)}. A lista é refeita automaticamente várias vezes ao dia e leva em conta o desconto, a avaliação de quem comprou e o nosso próprio histórico de preços.`;
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

function cartao(o: OfertaAvaliada, posicao: number, texto: string | undefined, banco: Banco, agora: Date): string {
  const loja = NOME_DA_LOJA[o.loja] ?? o.loja;
  const imagem = urlSegura(o.imagem);
  const selos: string[] = [];
  if (o.desconto && o.desconto > 0) selos.push(`<span class="selo destaque">-${Math.round(o.desconto)}%</span>`);
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
    <p class="social">${esc(social.join(' · '))}</p>
    ${texto ? `<p class="analise">${esc(texto)}</p>` : ''}
    ${graficoDePreco(banco.historicoDiario(o.loja, o.idProduto, DIAS_DO_GRAFICO, agora))}
    <a class="botao" href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">Ver oferta na ${esc(loja)}</a>
  </div>
</li>`;
}

function montarPagina(p: Pagina, todas: Pagina[], textos: TextosDoPost, config: Config, banco: Banco, agora: Date): string {
  const b = config.blog;
  const data = dataPorExtenso(agora);
  const tituloCompleto = `${p.titulo} (${data.split(' ')[0]}) | ${b.nome}`;
  const descricao = `${p.titulo}: ${p.itens.slice(0, 3).map((i) => i.titulo.slice(0, 50)).join('; ')}. Atualizado em ${data}.`.slice(0, 300);
  const canonica = b.url ? `${b.url}/${p.arquivo === 'index.html' ? '' : p.arquivo}` : '';
  const imagemOg = urlSegura(p.itens[0]?.imagem);

  const dadosEstruturados = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: p.titulo,
    numberOfItems: p.itens.length,
    itemListElement: p.itens.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.titulo, url: o.link })),
  };
  const nav = todas.map((t) => `<a href="${t.arquivo}"${t.arquivo === p.arquivo ? ' aria-current="page"' : ''}>${esc(t.rotulo)}</a>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloCompleto)}</title>
<meta name="description" content="${esc(descricao)}">
${canonica ? `<link rel="canonical" href="${esc(canonica)}">` : ''}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.titulo)}">
<meta property="og:description" content="${esc(descricao)}">
${canonica ? `<meta property="og:url" content="${esc(canonica)}">` : ''}
${imagemOg ? `<meta property="og:image" content="${esc(imagemOg)}">` : ''}
<link rel="stylesheet" href="estilo.css">
<script type="application/ld+json">${JSON.stringify(dadosEstruturados).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header>
  <a class="marca" href="index.html">${esc(b.nome)}</a>
  <nav aria-label="Categorias">${nav}</nav>
</header>
<main>
  <article>
  <h1>${esc(p.titulo)}</h1>
  <p class="data">Atualizado em <time datetime="${agora.toISOString()}">${esc(data)}</time></p>
  <p class="intro">${esc(textos.intro)}</p>
  <ol class="lista">
${p.itens.map((o, i) => cartao(o, i + 1, textos.porProduto.get(idDe(o)), banco, agora)).join('\n')}
  </ol>
  ${textos.fim ? `<section class="fim"><h2>Como escolher</h2><p>${esc(textos.fim)}</p></section>` : ''}
  </article>
  ${b.telegramLink && urlSegura(b.telegramLink) ? `<p class="chamada">Quer receber as ofertas na hora? <a href="${esc(b.telegramLink)}" target="_blank" rel="noopener">Entre no nosso canal do Telegram</a>.</p>` : ''}
</main>
<footer>
  <p><strong>Aviso:</strong> este site participa de programas de afiliados. Ao comprar pelos links, podemos receber uma comissão, sem custo extra para você.</p>
  <p>Preços conferidos em ${esc(data)}. Eles podem mudar a qualquer momento; vale o preço mostrado na loja.</p>
  ${textos.temIA ? '<p>Os textos desta página são escritos por inteligência artificial a partir do nome e dos dados de cada produto. Confira os detalhes na página da loja antes de comprar.</p>' : ''}
</footer>
</body>
</html>
`;
}

const ESTILO = `:root{--fundo:#f6f7f9;--cartao:#fff;--texto:#16181d;--suave:#5b6370;--borda:#e2e5ea;--cor:#d6336c;--cor-texto:#fff;--ok:#0a7d4f}
@media (prefers-color-scheme:dark){:root{--fundo:#111318;--cartao:#1a1d24;--texto:#eceef2;--suave:#a0a7b4;--borda:#2a2e38;--cor:#f06595;--cor-texto:#111318;--ok:#51cf8a}}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header,main,footer{max-width:820px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.marca{font-weight:800;font-size:1.25rem;color:var(--texto);text-decoration:none}
nav{display:flex;flex-wrap:wrap;gap:6px}
nav a{padding:4px 10px;border:1px solid var(--borda);border-radius:999px;color:var(--suave);text-decoration:none;font-size:.875rem}
nav a[aria-current]{background:var(--texto);color:var(--fundo);border-color:var(--texto)}
h1{font-size:1.75rem;line-height:1.2;margin:8px 0 4px}
.data{color:var(--suave);margin:0 0 12px;font-size:.875rem}
.intro{margin:0 0 20px}
.lista{list-style:none;margin:0;padding:0;display:grid;gap:12px}
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
.fim{margin:24px 0 0}
.fim h2{font-size:1.25rem;margin:0 0 6px}
.fim p{margin:0}
.chamada{margin:24px 0 0;padding:14px;border:1px dashed var(--borda);border-radius:12px}
a{color:var(--cor)}
footer{color:var(--suave);font-size:.8125rem;border-top:1px solid var(--borda);margin-top:24px}
@media (max-width:520px){.cartao{flex-direction:column}.cartao img{width:100%;height:180px}.semimagem{display:none}}
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

async function pedirAoOllama(url: string, modelo: string, prompt: string, fetchFn: Fetch): Promise<string> {
  const resposta = await fetchFn(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, prompt, stream: false, options: { temperature: 0.6, num_predict: 260 } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resposta.ok) throw new Error(`Ollama respondeu ${resposta.status}`);
  return ((await resposta.json()) as { response?: string }).response ?? '';
}

const REGRAS_DE_ESCRITA = `Regras:
- De 2 a 3 frases, em português do Brasil, tom direto e útil.
- Baseie-se somente no que está escrito abaixo. Não invente especificações, medidas, materiais nem recursos.
- Não cite preços, percentuais de desconto nem prazos.
- Sem títulos, sem listas, sem emojis, sem aspas. Devolva só o parágrafo.`;

function listaParaPrompt(p: Pagina): string {
  return p.itens.map((o, i) => `${i + 1}. ${o.titulo.slice(0, 90)}`).join('\n');
}

function promptDaIntro(p: Pagina): string {
  return `Você escreve para um blog brasileiro de ofertas. Escreva a introdução do post "${p.titulo}".

${REGRAS_DE_ESCRITA}

Produtos do post:
${listaParaPrompt(p)}`;
}

function promptDoFim(p: Pagina): string {
  return `Você escreve para um blog brasileiro de ofertas. Escreva o parágrafo final do post "${p.titulo}", com uma dica prática de como escolher entre os produtos da lista.

${REGRAS_DE_ESCRITA}

Produtos do post:
${listaParaPrompt(p)}`;
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

// ───────────── publicação ─────────────

function rodar(comando: string, args: string[]): Promise<{ codigo: number; saida: string }> {
  return new Promise((resolve) => {
    execFile(comando, args, { timeout: 120_000, windowsHide: true }, (erro, stdout, stderr) => {
      const codigo = erro ? (typeof (erro as any).code === 'number' ? (erro as any).code : 1) : 0;
      resolve({ codigo, saida: `${stdout}${stderr}`.trim() });
    });
  });
}

/**
 * Publica a pasta do blog com Git (GitHub Pages, Cloudflare Pages etc.).
 * A pasta precisa ser um repositório próprio, já ligado ao remoto.
 */
export async function publicarComGit(pasta: string, mensagem: string): Promise<string> {
  if (!existsSync(join(pasta, '.git'))) {
    throw new Error(`A pasta "${pasta}" ainda não é um repositório Git. Veja o passo "Publicar o blog" no LEIA-ME.`);
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

/**
 * Monta os posts "Top N" a partir dos produtos guardados pelo robô e grava o site na pasta do blog.
 * Com a IA ligada, ela escreve a abertura, um parágrafo por produto e o fechamento de cada post.
 */
export async function gerarBlog(banco: Banco, config: Config, agora: Date = new Date(), fetchFn: Fetch = fetch): Promise<ResultadoDoBlog> {
  const b = config.blog;
  const resultado: ResultadoDoBlog = { gerou: false, pasta: b.pasta, paginas: [], produtos: 0, textosDeIA: 0, avisos: [] };
  const valido = (o: OfertaAvaliada) => Boolean(urlSegura(o.link));

  const paginas: Pagina[] = [];
  const gerais = banco.melhoresProdutos({ horas: HORAS_DE_VALIDADE, limite: 40 }, agora).filter(valido);
  const nGeral = tamanhoDoTop(gerais.length);
  if (nGeral === 0) {
    resultado.avisos.push('Ainda não há ofertas recentes suficientes (mínimo de 3). O blog anterior foi mantido.');
    return resultado;
  }
  paginas.push({ arquivo: 'index.html', titulo: `Top ${nGeral} ofertas de hoje`, rotulo: 'Todas', itens: gerais.slice(0, nGeral), tema: 'várias categorias' });

  for (const { categoria } of banco.categoriasRecentes(HORAS_DE_VALIDADE, agora)) {
    if (!/^[a-z0-9-]+$/.test(categoria)) continue;
    const itens = banco.melhoresProdutos({ horas: HORAS_DE_VALIDADE, limite: 20, categoria }, agora).filter(valido);
    const n = tamanhoDoTop(itens.length);
    if (n === 0) continue;
    const nome = NOME_DA_CATEGORIA[categoria] ?? categoria;
    paginas.push({ arquivo: `ofertas-${categoria}.html`, titulo: `Top ${n} ofertas de ${nome} hoje`, rotulo: nome, itens: itens.slice(0, n), tema: nome });
  }

  // Prepara a IA. Qualquer falha aqui só desliga a IA nesta rodada; o blog sai do mesmo jeito.
  let modelo: string | undefined;
  if (b.ia === 'ollama') {
    try {
      modelo = b.ollamaModelo || (await modelosDoOllama(b.ollamaUrl, fetchFn))[0];
      if (!modelo) resultado.avisos.push('O Ollama não tem nenhum modelo instalado. Baixe um (ex.: ollama pull llama3.1) e gere de novo.');
    } catch (e) {
      resultado.avisos.push(`IA indisponível (${(e as Error).message}): o Ollama está aberto? Usei o texto padrão.`);
    }
  }
  let restantes = MAX_TEXTOS_POR_RODADA;
  let avisouLimite = false;

  /** Texto salvo, se ainda valer; senão pede à IA e guarda. undefined = sem texto de IA para este trecho. */
  const escrever = async (chave: string, validadeEmDias: number, prompt: () => string): Promise<string | undefined> => {
    if (b.ia !== 'ollama') return undefined;
    const salvo = banco.textoSalvo(chave, validadeEmDias, agora);
    if (salvo) return salvo;
    if (!modelo) return undefined;
    if (restantes <= 0) {
      if (!avisouLimite) resultado.avisos.push(`A IA escreveu ${MAX_TEXTOS_POR_RODADA} textos nesta rodada; os que faltam entram na próxima.`);
      avisouLimite = true;
      return undefined;
    }
    restantes--;
    try {
      const texto = limparTextoDeIA(await pedirAoOllama(b.ollamaUrl, modelo, prompt(), fetchFn));
      if (!texto) return undefined;
      banco.salvarTexto(chave, texto, agora);
      resultado.textosDeIA++;
      resultado.modeloDeIA = modelo;
      return texto;
    } catch (e) {
      // Sem o Ollama no ar, o blog sai com o texto padrão. Não insiste no resto desta rodada.
      resultado.avisos.push(`IA indisponível (${(e as Error).message}); usei o texto padrão.`);
      modelo = undefined;
      return undefined;
    }
  };

  mkdirSync(b.pasta, { recursive: true });

  for (const p of paginas) {
    // A abertura e o fechamento valem enquanto o post tiver os mesmos produtos; mudou a lista, a IA reescreve.
    const lista = createHash('sha1').update(p.itens.map(idDe).sort().join('|')).digest('hex').slice(0, 12);
    const introDeIA = await escrever(`post:${p.arquivo}:${lista}:intro`, DIAS_DO_TEXTO_DE_POST, () => promptDaIntro(p));
    const porProduto = new Map<string, string>();
    for (const o of p.itens) {
      const texto = await escrever(`produto:${idDe(o)}`, DIAS_DO_TEXTO_DE_PRODUTO, () => promptDoProduto(o));
      if (texto) porProduto.set(idDe(o), texto);
    }
    const fim = await escrever(`post:${p.arquivo}:${lista}:fim`, DIAS_DO_TEXTO_DE_POST, () => promptDoFim(p));
    const textos: TextosDoPost = { intro: introDeIA ?? introPadrao(p), fim, porProduto, temIA: Boolean(introDeIA || fim || porProduto.size) };

    writeFileSync(join(b.pasta, p.arquivo), montarPagina(p, paginas, textos, config, banco, agora), 'utf8');
    resultado.paginas.push(p.arquivo);
  }

  // Remove páginas de categorias que deixaram de ter ofertas, para não ficar oferta velha no ar.
  for (const arquivo of readdirSync(b.pasta)) {
    if (/^ofertas-[a-z0-9-]+\.html$/.test(arquivo) && !resultado.paginas.includes(arquivo)) unlinkSync(join(b.pasta, arquivo));
  }

  writeFileSync(join(b.pasta, 'estilo.css'), ESTILO, 'utf8');
  writeFileSync(join(b.pasta, '.nojekyll'), '', 'utf8');
  if (b.url) {
    const urls = paginas.map((p) => `  <url><loc>${esc(`${b.url}/${p.arquivo === 'index.html' ? '' : p.arquivo}`)}</loc><lastmod>${agora.toISOString()}</lastmod><changefreq>daily</changefreq></url>`);
    writeFileSync(join(b.pasta, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');
    writeFileSync(join(b.pasta, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${b.url}/sitemap.xml\n`, 'utf8');
  } else {
    resultado.avisos.push('BLOG_URL está vazio: o sitemap não foi criado. Preencha depois de publicar.');
  }

  resultado.gerou = true;
  resultado.produtos = new Set(paginas.flatMap((p) => p.itens.map(idDe))).size;

  if (b.publicar === 'git') {
    try {
      resultado.publicacao = await publicarComGit(b.pasta, `Atualiza ofertas (${dataPorExtenso(agora)})`);
    } catch (e) {
      resultado.avisos.push((e as Error).message);
    }
  }
  return resultado;
}
