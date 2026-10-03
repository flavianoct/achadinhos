import type { Fonte, Oferta } from '../types.ts';

type Fetch = typeof fetch;

const API = 'https://api.mercadolibre.com';
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

function imagemDe(dados: any): string | undefined {
  const url: string | undefined = dados?.pictures?.[0]?.secure_url ?? dados?.pictures?.[0]?.url ?? dados?.thumbnail;
  return url ? url.replace(/^http:/, 'https:') : undefined;
}

/** Junta os dados do produto de catálogo com a oferta vencedora (preço). */
export function converterProdutoML(produto: any, ofertaVencedora: any, mattWord: string, mattTool: string): Oferta | undefined {
  const preco = Number(ofertaVencedora?.price);
  if (!produto?.id || !produto?.name || !Number.isFinite(preco) || preco <= 0) return undefined;
  const original = Number(ofertaVencedora?.original_price);
  const base = produto.permalink || `https://www.mercadolivre.com.br/p/${produto.id}`;
  return {
    loja: 'mercadolivre',
    idProduto: String(produto.id),
    titulo: String(produto.name),
    preco,
    precoOriginal: Number.isFinite(original) && original > preco ? original : undefined,
    imagem: imagemDe(produto),
    link: linkAfiliadoML(base, mattWord, mattTool),
    freteGratis: ofertaVencedora?.shipping?.free_shipping === true ? true : undefined,
  };
}

/** Converte um anúncio comum (não catálogo). */
export function converterAnuncioML(item: any, mattWord: string, mattTool: string): Oferta | undefined {
  const preco = Number(item?.price);
  if (!item?.id || !item?.title || !item?.permalink || !Number.isFinite(preco) || preco <= 0) return undefined;
  const original = Number(item.original_price);
  return {
    loja: 'mercadolivre',
    idProduto: String(item.id),
    titulo: String(item.title),
    preco,
    precoOriginal: Number.isFinite(original) && original > preco ? original : undefined,
    imagem: imagemDe(item),
    link: linkAfiliadoML(item.permalink, mattWord, mattTool),
    vendas: Number.isFinite(Number(item.sold_quantity)) ? Number(item.sold_quantity) : undefined,
    freteGratis: item.shipping?.free_shipping === true ? true : undefined,
  };
}

export class FonteMercadoLivre implements Fonte {
  nome = 'mercadolivre' as const;
  private clientId: string;
  private clientSecret: string;
  private mattWord: string;
  private mattTool: string;
  private categorias: string[];
  private ultimaFalha = '';
  private porCategoria: number;
  private fetchFn: Fetch;
  private token?: { valor: string; expiraEm: number };
  /** Intervalo entre chamadas, para não sobrecarregar a API. */
  private intervaloMs: number;

  constructor(
    opcoes: { clientId: string; clientSecret: string; mattWord: string; mattTool: string; categorias: string[]; porCategoria?: number; intervaloMs?: number },
    fetchFn: Fetch = fetch,
  ) {
    this.clientId = opcoes.clientId;
    this.clientSecret = opcoes.clientSecret;
    this.mattWord = opcoes.mattWord;
    this.mattTool = opcoes.mattTool;
    this.categorias = opcoes.categorias;
    this.porCategoria = opcoes.porCategoria ?? 10;
    this.intervaloMs = opcoes.intervaloMs ?? 350;
    this.fetchFn = fetchFn;
  }

  private async obterToken(): Promise<string> {
    if (this.token && this.token.expiraEm > Date.now() + 60_000) return this.token.valor;
    const resposta = await this.fetchFn(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const dados = (await resposta.json().catch(() => ({}))) as any;
    if (!resposta.ok || !dados.access_token) {
      throw new Error(`Mercado Livre recusou o login do app (${resposta.status}): ${dados.message ?? dados.error ?? 'confira ML_CLIENT_ID e ML_CLIENT_SECRET'}`);
    }
    this.token = { valor: dados.access_token, expiraEm: Date.now() + Number(dados.expires_in ?? 21_600) * 1000 };
    return this.token.valor;
  }

  /** GET na API. Devolve undefined em 403/404 (item indisponível para o app), para a coleta seguir. */
  private async get(caminho: string): Promise<any | undefined> {
    const token = await this.obterToken();
    await pausa(this.intervaloMs);
    const resposta = await this.fetchFn(`${API}${caminho}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (resposta.status === 403 || resposta.status === 404) {
      const corpo = (await resposta.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      this.ultimaFalha = `${resposta.status} em ${caminho}: ${corpo}`;
      return undefined;
    }
    if (resposta.status === 429) throw new Error('Mercado Livre: limite de requisições atingido, tente um intervalo maior');
    if (!resposta.ok) throw new Error(`Mercado Livre respondeu ${resposta.status} em ${caminho}`);
    return resposta.json();
  }

  private async detalhar(entrada: { id: string; type?: string }): Promise<Oferta | undefined> {
    if (entrada.type === 'ITEM') {
      const item = await this.get(`/items/${entrada.id}`);
      return item ? converterAnuncioML(item, this.mattWord, this.mattTool) : undefined;
    }
    const produto = await this.get(`/products/${entrada.id}`);
    if (!produto) return undefined;
    let vencedora = produto.buy_box_winner;
    if (!vencedora?.price) {
      const lista = await this.get(`/products/${entrada.id}/items`);
      vencedora = lista?.results?.[0];
    }
    return converterProdutoML(produto, vencedora, this.mattWord, this.mattTool);
  }

  async coletar(): Promise<Oferta[]> {
    const vistos = new Map<string, Oferta>();
    let categoriasComErro = 0;
    for (const categoria of this.categorias) {
      // Mais vendidos da categoria: é a listagem que a API oficial ainda libera.
      const destaques = await this.get(`/highlights/MLB/category/${categoria}`);
      if (!destaques) {
        categoriasComErro++;
        continue;
      }
      const entradas: Array<{ id: string; type?: string }> = (destaques?.content ?? []).slice(0, this.porCategoria);
      for (const entrada of entradas) {
        if (!entrada?.id || vistos.has(entrada.id)) continue;
        const oferta = await this.detalhar(entrada);
        if (oferta) vistos.set(entrada.id, oferta);
      }
    }
    if (this.categorias.length > 0 && categoriasComErro === this.categorias.length) {
      throw new Error(`Mercado Livre: nenhuma categoria respondeu (403/404). O app pode não ter acesso a essa listagem. Última resposta: ${this.ultimaFalha}`);
    }
    return [...vistos.values()];
  }
}
