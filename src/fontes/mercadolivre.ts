import type { Fonte, Oferta } from '../types.ts';

type Fetch = typeof fetch;

const SITE = 'https://www.mercadolivre.com.br';
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Coloca os seus parâmetros de afiliado (matt_word e matt_tool) no link do produto.
 * O Mercado Livre não tem API oficial para gerar link de afiliado; esses dois valores
 * vêm de um link gerado por você no painel. Confira no painel se os cliques estão sendo
 * contados antes de confiar neste formato.
 */
export function linkAfiliadoML(url: string, mattWord: string, mattTool: string): string {
  const u = new URL(url);
  u.hash = '';
  u.searchParams.set('matt_word', mattWord);
  u.searchParams.set('matt_tool', mattTool);
  return u.toString();
}

/** "+100mil vendidos" -> 100000, "+50 vendidos" -> 50. */
function lerVendas(texto: string | undefined): number | undefined {
  const m = /\+?\s*([\d.,]+)\s*(mil|mi)?\s*vendid/i.exec(texto ?? '');
  if (!m) return undefined;
  const n = Number((m[1] as string).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return undefined;
  const fator = !m[2] ? 1 : m[2].toLowerCase() === 'mil' ? 1_000 : 1_000_000;
  return Math.round(n * fator);
}

/** Procura, dentro do cartão, um componente pelo tipo (title, price, review_compacted...). */
function componente(cartao: any, tipo: string): any {
  return (cartao.components ?? []).find((c: any) => c?.type === tipo);
}

/** Converte um cartão da página de ofertas do Mercado Livre. Devolve undefined se faltar título, preço ou link. */
export function converterCartaoML(cartao: any, mattWord: string, mattTool: string): Oferta | undefined {
  const meta = cartao?.metadata;
  const id = String(meta?.product_id ?? meta?.id ?? '');
  const titulo = componente(cartao, 'title')?.title?.text;
  const dadosDePreco = componente(cartao, 'price')?.price;
  const preco = Number(dadosDePreco?.current_price?.value);
  if (!id || !titulo || !meta?.url || !Number.isFinite(preco) || preco <= 0) return undefined;

  const anterior = Number(dadosDePreco?.price_labels?.[0]?.values?.find((v: any) => v?.price)?.price?.value);
  const precoOriginal = Number.isFinite(anterior) && anterior > preco ? anterior : undefined;
  const desconto = precoOriginal ? Math.round((1 - preco / precoOriginal) * 100) : undefined;

  const avaliacao = componente(cartao, 'review_compacted')?.review_compacted;
  const rotulos: any[] = (avaliacao?.values ?? []).filter((v: any) => v?.type === 'label');
  const nota = Number(String(rotulos[0]?.label?.text ?? '').replace(',', '.'));
  const vendas = lerVendas(rotulos[1]?.label?.text) ?? lerVendas(avaliacao?.alt_text);

  const fotoId: string | undefined = cartao.pictures?.pictures?.[0]?.id;
  const loja: string | undefined = componente(cartao, 'seller')?.seller?.values?.find((v: any) => v?.key === 'label')?.label?.text;
  const frete = JSON.stringify(componente(cartao, 'shipping_v2') ?? '');

  const url = String(meta.url).startsWith('http') ? String(meta.url) : `https://${meta.url}`;
  return {
    loja: 'mercadolivre',
    idProduto: id,
    titulo: String(titulo),
    preco,
    precoOriginal,
    desconto,
    imagem: fotoId ? `https://http2.mlstatic.com/D_Q_NP_2X_${fotoId}-AB.webp` : undefined,
    link: linkAfiliadoML(url, mattWord, mattTool),
    nota: Number.isFinite(nota) && nota > 0 && nota <= 5 ? nota : undefined,
    vendas,
    nomeLoja: loja,
    freteGratis: /gr[aá]tis/i.test(frete) ? true : undefined,
  };
}

/** Lê o JSON que a página de ofertas traz embutido e devolve os cartões de produto. */
export function extrairCartoesML(html: string): any[] {
  const script = /<script[^>]*id="__NORDIC_RENDERING_CTX__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) return [];
  const ini = script.indexOf('{');
  const fim = script.indexOf('};_n.ctx.r.');
  if (ini < 0 || fim < 0) return [];
  let dados: any;
  try {
    dados = JSON.parse(script.slice(ini, fim + 1));
  } catch {
    return [];
  }
  const cartoes: any[] = [];
  const percorrer = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (o.metadata?.id && o.pictures && Array.isArray(o.components)) {
      cartoes.push(o);
      return;
    }
    for (const k of Object.keys(o)) percorrer(o[k]);
  };
  percorrer(dados);
  return cartoes;
}

/** O rodízio de categorias avança um passo a cada turno (o robô roda mais ou menos a cada 25 minutos). */
const TURNO_MS = 25 * 60_000;

/**
 * Quais páginas de categoria ler neste turno. Percorre a lista em rodízio; a cada volta completa
 * alterna entre a 1ª e a 2ª página, para ir mais fundo sem pedir mais páginas por rodada.
 */
export function categoriasDoTurno(categorias: string[], quantas: number, turno: number): Array<{ categoria: string; pagina: number }> {
  const validas = categorias.filter((c) => /^MLB\d+$/.test(c));
  if (validas.length === 0 || quantas <= 0) return [];
  const escolhidas: Array<{ categoria: string; pagina: number }> = [];
  for (let j = 0; j < Math.min(quantas, validas.length); j++) {
    const i = turno * quantas + j;
    escolhidas.push({ categoria: validas[i % validas.length]!, pagina: (Math.floor(i / validas.length) % 2) + 1 });
  }
  return escolhidas;
}

/**
 * Mercado Livre: a API oficial primeiro (FonteMercadoLivreApi) e, se ela falhar, a página pública de ofertas.
 * A API do app não lê anúncios (nota e vendas dão 403) nem a busca de anúncios, mas lê os mais vendidos, os produtos de catálogo e a busca
 * de produtos. A página traz título, preço, preço antigo, foto, nota e vendas, mas o site a barra com captcha desde 06/10/2026.
 * Parte das páginas da rodada vai para a vitrine geral e parte para as ofertas de uma categoria (em rodízio):
 * o total de pedidos é o mesmo, mas os guias ganham produtos que a vitrine geral não mostra.
 */
export class FonteMercadoLivre implements Fonte {
  nome = 'mercadolivre' as const;
  private mattWord: string;
  private mattTool: string;
  private paginas: number;
  private categorias: string[];
  private paginasDeCategoria: number;
  private intervaloMs: number;
  private agora: () => number;
  private fetchFn: Fetch;
  private reserva?: { coletar(): Promise<Oferta[]>; buscar?(palavras: string[]): Promise<Oferta[]> };
  private tema: string[];
  private aviso?: string;

  constructor(
    opcoes: { mattWord: string; mattTool: string; paginas?: number; categorias?: string[]; paginasDeCategoria?: number; intervaloMs?: number; agora?: () => number; reserva?: { coletar(): Promise<Oferta[]>; buscar?(palavras: string[]): Promise<Oferta[]> }; tema?: string[] },
    fetchFn: Fetch = fetch,
  ) {
    this.mattWord = opcoes.mattWord;
    this.mattTool = opcoes.mattTool;
    this.paginas = Math.max(1, opcoes.paginas ?? 3);
    this.categorias = opcoes.categorias ?? [];
    this.paginasDeCategoria = Math.max(0, opcoes.paginasDeCategoria ?? 0);
    this.intervaloMs = opcoes.intervaloMs ?? 1500;
    this.agora = opcoes.agora ?? Date.now;
    this.fetchFn = fetchFn;
    this.reserva = opcoes.reserva;
    this.tema = opcoes.tema ?? [];
  }

  private async baixar(url: string): Promise<string> {
    const resposta = await this.fetchFn(url, {
      headers: { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!resposta.ok) throw new Error(`o site respondeu ${resposta.status}`);
    return resposta.text();
  }

  avisoDaColeta(): string | undefined {
    return this.aviso;
  }

  /**
   * A API oficial é o caminho principal (documentada, sem captcha); a página pública de ofertas só entra se a API falhar.
   * Sem as chaves da API (ML_CLIENT_ID e ML_CLIENT_SECRET), lê só a página.
   */
  async coletar(): Promise<Oferta[]> {
    this.aviso = undefined;
    // Com tema, tenta primeiro a busca por palavra pela API; se ela não trouxer nada, segue para a coleta normal (que o filtro do tema limpa depois).
    if (this.tema.length && this.reserva?.buscar) {
      try {
        return await this.reserva.buscar(this.tema);
      } catch {
        // cai na coleta normal
      }
    }
    if (!this.reserva) return this.coletarDaPagina();
    try {
      return await this.reserva.coletar();
    } catch (eApi) {
      // A API falhou: tenta a página, mas o motivo da API não pode sumir (é por ele que o volume cai).
      try {
        const ofertas = await this.coletarDaPagina();
        this.aviso = `A API do Mercado Livre falhou (${(eApi as Error).message}); a coleta usou a página de ofertas.`;
        console.log(`[ml] ${this.aviso}`);
        return ofertas;
      } catch (ePagina) {
        throw new Error(`API do Mercado Livre: ${(eApi as Error).message} Página: ${(ePagina as Error).message}`);
      }
    }
  }

  protected async coletarDaPagina(): Promise<Oferta[]> {
    const vistos = new Map<string, Oferta>();
    const guardar = (cartoes: any[]) => {
      for (const c of cartoes) {
        const oferta = converterCartaoML(c, this.mattWord, this.mattTool);
        if (oferta && !vistos.has(oferta.idProduto)) vistos.set(oferta.idProduto, oferta);
      }
    };

    // As páginas de categoria saem do mesmo total: nunca mais pedidos por rodada do que ML_PAGINAS.
    const deCategoria = categoriasDoTurno(this.categorias, Math.min(this.paginasDeCategoria, this.paginas - 1), Math.floor(this.agora() / TURNO_MS));
    const gerais = this.paginas - deCategoria.length;

    let ultimoErro = '';
    let paginasLidas = 0;
    for (let pagina = 1; pagina <= gerais; pagina++) {
      if (pagina > 1) await pausa(this.intervaloMs);
      try {
        const cartoes = extrairCartoesML(await this.baixar(pagina <= 1 ? `${SITE}/ofertas` : `${SITE}/ofertas?page=${pagina}`));
        if (cartoes.length === 0) {
          ultimoErro = 'a página abriu, mas sem ofertas legíveis (o site pode ter mudado ou barrado o acesso)';
          break;
        }
        paginasLidas++;
        guardar(cartoes);
      } catch (e) {
        ultimoErro = (e as Error).message;
        break;
      }
    }
    if (paginasLidas === 0) throw new Error(`Mercado Livre: não consegui ler a página de ofertas (${ultimoErro}).`);

    // Categoria que falha ou vem vazia não derruba a rodada; mas, se o site barrou, não insiste nas seguintes.
    for (const { categoria, pagina } of deCategoria) {
      await pausa(this.intervaloMs);
      try {
        const cartoes = extrairCartoesML(await this.baixar(`${SITE}/ofertas?category=${categoria}${pagina > 1 ? `&page=${pagina}` : ''}`));
        if (cartoes.length === 0) break;
        guardar(cartoes);
      } catch {
        break;
      }
    }
    return [...vistos.values()];
  }
}
