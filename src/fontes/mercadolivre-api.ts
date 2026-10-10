import type { Oferta } from '../types.ts';
import { linkAfiliadoML } from './mercadolivre.ts';

type Fetch = typeof fetch;

const API = 'https://api.mercadolibre.com';
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O nome do catálogo vem cheio de listas de modelos ("iPhone X Xr 11 12 13 14 15 16..."): tira as sequências de números soltos e corta em 110 caracteres, numa palavra inteira. */
export function semListaDeModelos(titulo: string): string {
  return titulo.replace(/\s+/g, ' ').replace(/(?:\s(?:[A-Za-z]{1,2}\s)?\d{1,2}){4,}/g, ' ').replace(/\s+/g, ' ').trim();
}

export function limparTituloML(titulo: string): string {
  const t = semListaDeModelos(titulo);
  if (t.length <= 110) return t;
  const corte = t.slice(0, 110);
  return corte.slice(0, Math.max(corte.lastIndexOf(' '), 60)).replace(/[\s,;:\-–]+$/, '');
}

/** Erro da API com o código HTTP, para o resumo da rodada mostrar o motivo exato. */
export class ErroApiML extends Error {}

/** Teto de pedidos à API por rodada (o robô roda a cada ~30 minutos; a API tem limite de requisições). */
const MAXIMO_DE_PEDIDOS = 500;

interface Diagnostico {
  ultimoErro: string;
  formatos: Set<string>;
  falhas: Map<string, number>;
}

/**
 * Mercado Livre pela API oficial (caminho principal da coleta; a página de ofertas, que o site barra com captcha, é a reserva).
 * Usa o app do DevCenter (ML_CLIENT_ID e ML_CLIENT_SECRET, Secrets do GitHub): troca as chaves por um token e lê
 * os 20 mais vendidos de cada categoria e subcategoria (/highlights), o produto de catálogo (/products) e o anúncio
 * vencedor (/products/{id}/items). Só lê dados públicos; não precisa de nenhuma permissão de vendedor.
 *
 * O diagnóstico de 10/10/2026 mostrou que o token do app NÃO lê anúncios: /items, /items?ids= e /reviews respondem 403.
 * Por isso nota e vendas só vêm se algum dia essa permissão existir; o robô tenta uma vez por rodada e, no primeiro
 * 401/403, para de pedir esse recurso (economiza dezenas de pedidos). A busca /sites/MLB/search também dá 403;
 * o tema usa /products/search, que funciona.
 */
export class FonteMercadoLivreApi {
  private token?: string;
  private fetchFn: Fetch;
  private pausaMs: number;
  private opcoes: { clientId: string; clientSecret: string; mattWord: string; mattTool: string; categorias: string[]; porRodada?: number };
  private pedidos = 0;
  /** Recursos que já responderam 401/403 nesta rodada: não adianta pedir de novo. */
  private negados = new Set<string>();
  private limiteAtingido = false;
  private categoriasExpandidas?: string[];

  constructor(opcoes: { clientId: string; clientSecret: string; mattWord: string; mattTool: string; categorias: string[]; porRodada?: number }, fetchFn: Fetch = fetch, pausaMs = 250) {
    this.opcoes = opcoes;
    this.fetchFn = fetchFn;
    this.pausaMs = pausaMs;
  }

  private async pedir(caminho: string, init: RequestInit = {}): Promise<any> {
    if (++this.pedidos > MAXIMO_DE_PEDIDOS) {
      this.limiteAtingido = true;
      throw new ErroApiML(`429 limite de ${MAXIMO_DE_PEDIDOS} pedidos por rodada atingido`);
    }
    let r = await this.fetchFn(`${API}${caminho}`, { ...init, signal: AbortSignal.timeout(30_000) });
    // 429 = limite por Client ID e por endpoint (documentação do Mercado Livre): espera um pouco, com variação, e tenta uma vez de novo.
    if (r.status === 429 && this.pausaMs > 0) {
      await pausa(this.pausaMs * 8 + Math.random() * this.pausaMs * 8);
      r = await this.fetchFn(`${API}${caminho}`, { ...init, signal: AbortSignal.timeout(30_000) });
    }
    const texto = await r.text();
    if (r.status === 429) this.limiteAtingido = true;
    if (!r.ok) throw new ErroApiML(`${r.status} em ${caminho.split('?')[0]}${texto ? ` (${texto.slice(0, 120).replace(/\s+/g, ' ')})` : ''}`);
    try {
      return JSON.parse(texto);
    } catch {
      throw new ErroApiML(`resposta inválida em ${caminho.split('?')[0]}`);
    }
  }

  private async autenticar(): Promise<string> {
    if (this.token) return this.token;
    const corpo = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.opcoes.clientId, client_secret: this.opcoes.clientSecret });
    const r = await this.pedir('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: corpo });
    if (!r?.access_token) throw new ErroApiML('o Mercado Livre não devolveu o token do app');
    this.token = String(r.access_token);
    return this.token;
  }

  private async autorizado(caminho: string): Promise<any> {
    return this.pedir(caminho, { headers: { authorization: `Bearer ${await this.autenticar()}`, accept: 'application/json' } });
  }

  /**
   * As categorias do rodízio: cada categoria configurada e as suas subcategorias (lidas de /categories/{id}, 1 pedido por categoria).
   * A ordem é estável (categoria, depois as filhas), então o rodízio percorre tudo ao longo do dia. Se /categories falhar, vale só a lista configurada.
   */
  private async categoriasDoRodizio(): Promise<string[]> {
    if (this.categoriasExpandidas) return this.categoriasExpandidas;
    const lista: string[] = [];
    for (const pai of this.opcoes.categorias.filter((c) => /^MLB\d+$/.test(c))) {
      lista.push(pai);
      try {
        const cat = await this.autorizado(`/categories/${pai}`);
        for (const filha of Array.isArray(cat?.children_categories) ? cat.children_categories : []) if (/^MLB\d+$/.test(String(filha?.id))) lista.push(String(filha.id));
      } catch (e) {
        if (/^(40[13]|429)/.test((e as Error).message)) break;
      }
    }
    this.categoriasExpandidas = [...new Set(lista)];
    return this.categoriasExpandidas;
  }

  /** As categorias do turno: um rodízio pequeno (a API tem limite de pedidos). */
  private async categoriasDoTurno(turno: number): Promise<string[]> {
    const todas = await this.categoriasDoRodizio();
    const n = Math.min(this.opcoes.porRodada ?? 6, todas.length);
    return Array.from({ length: n }, (_, j) => todas[(turno * n + j) % todas.length]!);
  }

  private novoDiagnostico(): Diagnostico {
    return { ultimoErro: '', formatos: new Set(), falhas: new Map() };
  }

  /** Um complemento (nota, vendas) que falhou: conta com o código HTTP; no 401/403 não pede mais esse recurso nesta rodada. */
  private falhou(rotulo: string, e: unknown, d: Diagnostico): void {
    const codigo = /^(\d{3})/.exec((e as Error).message)?.[1] ?? 'erro';
    const chave = `${rotulo} ${codigo}`;
    d.falhas.set(chave, (d.falhas.get(chave) ?? 0) + 1);
    if (codigo === '401' || codigo === '403') this.negados.add(rotulo);
  }

  /**
   * Monta a oferta de um produto de catálogo: o preço vem do anúncio vencedor (buy_box_winner) ou do primeiro anúncio da lista do produto.
   * Nota e vendas são complementos: se a API não der (hoje responde 403), a oferta segue sem eles.
   */
  private async resolverProduto(idProduto: string, d: Diagnostico): Promise<Oferta | undefined> {
    let p = await this.autorizado(`/products/${idProduto}`);
    // Produto "pai" (com variações) não tem vencedor próprio: usa a primeira variação que tiver.
    if (!Number.isFinite(Number(p?.buy_box_winner?.price))) {
      for (const filho of (Array.isArray(p?.children_ids) ? p.children_ids : []).slice(0, 3)) {
        try {
          const v = await this.autorizado(`/products/${filho}`);
          if (Number.isFinite(Number(v?.buy_box_winner?.price))) {
            p = { ...v, name: v?.name ?? p?.name, pictures: v?.pictures?.length ? v.pictures : p?.pictures };
            break;
          }
        } catch (e) {
          d.ultimoErro = (e as Error).message;
        }
      }
    }
    let vencedor = p?.buy_box_winner;
    if (!Number.isFinite(Number(vencedor?.price))) {
      try {
        vencedor = (await this.autorizado(`/products/${idProduto}/items?limit=1`))?.results?.[0];
      } catch (e) {
        d.ultimoErro = (e as Error).message;
      }
    }
    const oferta = this.converterProduto(p, vencedor, /^MLB\d+$/.test(String(p?.id ?? '')) ? String(p.id) : idProduto);
    if (!oferta) {
      d.formatos.add(`produto sem preço (campos: ${Object.keys(p ?? {}).slice(0, 10).join(',')}${vencedor ? `; vencedor: ${Object.keys(vencedor).slice(0, 8).join(',')}` : '; sem vencedor'})`);
      return undefined;
    }
    const itemId = String(vencedor?.item_id ?? vencedor?.id ?? '');
    if (/^MLB\d+$/.test(itemId)) {
      if (!this.negados.has('anúncio') && !this.limiteAtingido) {
        try {
          const vendidos = Number((await this.autorizado(`/items/${itemId}?attributes=sold_quantity`))?.sold_quantity);
          if (Number.isFinite(vendidos) && vendidos > 0) oferta.vendas = vendidos;
        } catch (e) {
          this.falhou('anúncio', e, d);
        }
      }
      if (!this.negados.has('avaliações') && !this.limiteAtingido) {
        try {
          const media = Number((await this.autorizado(`/reviews/item/${itemId}`))?.rating_average);
          if (Number.isFinite(media) && media > 0 && media <= 5) oferta.nota = Math.round(media * 10) / 10;
        } catch (e) {
          this.falhou('avaliações', e, d);
        }
      }
    }
    return oferta;
  }

  async coletar(turno = Math.floor(Date.now() / (25 * 60_000))): Promise<Oferta[]> {
    if (!this.opcoes.clientId || !this.opcoes.clientSecret) throw new ErroApiML('faltam os Secrets ML_CLIENT_ID e ML_CLIENT_SECRET');
    const ofertas = new Map<string, Oferta>();
    const ignorados = new Map<string, number>();
    const d = this.novoDiagnostico();
    const jaPedidos = new Set<string>();
    let vistosNoRanking = 0;
    const categoriasLidas: string[] = [];
    this.pedidos = 0;
    this.limiteAtingido = false;
    for (const categoria of await this.categoriasDoTurno(turno)) {
      if (this.limiteAtingido) break;
      const produtos: string[] = [];
      try {
        const destaque = await this.autorizado(`/highlights/MLB/category/${categoria}`);
        categoriasLidas.push(categoria);
        for (const c of destaque?.content ?? []) {
          if (c?.id) vistosNoRanking++;
          if (c?.type === 'PRODUCT' && /^MLB\d+$/.test(String(c.id))) produtos.push(String(c.id));
          else ignorados.set(String(c?.type), (ignorados.get(String(c?.type)) ?? 0) + 1);
        }
      } catch (e) {
        d.ultimoErro = (e as Error).message;
        if (/^40[13]/.test(d.ultimoErro) || this.limiteAtingido) break; // sem permissão ou sem cota: insistir nas outras categorias não muda nada
        continue;
      }
      // Produto de catálogo (PRODUCT). Subcategorias repetem produtos da categoria-mãe: cada produto é pedido uma vez por rodada.
      for (const idProduto of [...new Set(produtos)].slice(0, 20)) {
        if (jaPedidos.has(idProduto) || this.limiteAtingido) continue;
        jaPedidos.add(idProduto);
        await pausa(this.pausaMs);
        try {
          const oferta = await this.resolverProduto(idProduto, d);
          if (oferta && !ofertas.has(oferta.idProduto)) ofertas.set(oferta.idProduto, oferta);
        } catch (e) {
          d.ultimoErro = (e as Error).message;
        }
      }
    }
    const lista = [...ofertas.values()];
    // Resumo do que a API trouxe, para o log da rodada mostrar o que existe (e o que falta) sem adivinhar.
    console.log(`[ml-api] categorias: ${categoriasLidas.join(',') || 'nenhuma'}; ranking: ${vistosNoRanking} produtos; ofertas: ${lista.length}; com preço antigo: ${lista.filter((o) => o.precoOriginal).length}; com nota: ${lista.filter((o) => o.nota).length}; com vendas: ${lista.filter((o) => o.vendas).length}; com frete grátis: ${lista.filter((o) => o.freteGratis).length}; pedidos: ${this.pedidos}${this.limiteAtingido ? ' (parou por limite)' : ''}; falhas dos complementos: ${[...d.falhas].map(([k, n]) => `${k} x${n}`).join(', ') || 'nenhuma'}`);
    if (lista.length === 0) {
      const tipos = [...ignorados].map(([t, n]) => `${n} do tipo ${t}`).join(', ');
      throw new ErroApiML(`API do Mercado Livre sem ofertas${d.ultimoErro ? `: ${d.ultimoErro}` : ''}${tipos ? ` (itens que a API devolveu em outro formato: ${tipos})` : ''}${d.formatos.size ? ` [${[...d.formatos].slice(0, 2).join('; ')}]` : ''}`);
    }
    return lista;
  }

  /**
   * Busca por palavra (o tema do dia): pesquisa cada palavra entre os produtos de catálogo (/products/search; a busca de anúncios
   * /sites/MLB/search responde 403 para o app) e monta a oferta de cada resultado. Se a API recusar a busca, o erro sobe e quem
   * chamou volta para a leitura normal da página de ofertas.
   */
  async buscar(palavras: string[]): Promise<Oferta[]> {
    if (!this.opcoes.clientId || !this.opcoes.clientSecret) throw new ErroApiML('faltam os Secrets ML_CLIENT_ID e ML_CLIENT_SECRET');
    const ofertas = new Map<string, Oferta>();
    const d = this.novoDiagnostico();
    this.pedidos = 0;
    this.limiteAtingido = false;
    for (const palavra of palavras.slice(0, 4)) {
      if (this.limiteAtingido) break;
      let ids: string[] = [];
      try {
        const r = await this.autorizado(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(palavra)}&limit=20`);
        ids = (Array.isArray(r?.results) ? r.results : []).map((x: any) => String(x?.id ?? '')).filter((id: string) => /^MLB\d+$/.test(id));
      } catch (e) {
        d.ultimoErro = (e as Error).message;
        if (/^40[13]/.test(d.ultimoErro) || this.limiteAtingido) break;
        continue;
      }
      for (const id of [...new Set(ids)].slice(0, 12)) {
        if (this.limiteAtingido) break;
        await pausa(this.pausaMs);
        try {
          const oferta = await this.resolverProduto(id, d);
          if (oferta && !ofertas.has(oferta.idProduto)) ofertas.set(oferta.idProduto, oferta);
        } catch (e) {
          d.ultimoErro = (e as Error).message;
        }
      }
    }
    console.log(`[ml-api] busca por tema: ${palavras.slice(0, 4).join(', ')}; ofertas: ${ofertas.size}; pedidos: ${this.pedidos}; falhas dos complementos: ${[...d.falhas].map(([k, n]) => `${k} x${n}`).join(', ') || 'nenhuma'}`);
    if (ofertas.size === 0) throw new ErroApiML(`a busca por tema não trouxe anúncios${d.ultimoErro ? `: ${d.ultimoErro}` : ''}`);
    return [...ofertas.values()];
  }

  /** Monta a oferta a partir do produto de catálogo e do anúncio que o vende (o vencedor). */
  private converterProduto(p: any, vencedor: any, idProduto: string): Oferta | undefined {
    const preco = Number(vencedor?.price);
    const titulo = limparTituloML(String(p?.name ?? p?.title ?? ''));
    if (!titulo || !Number.isFinite(preco) || preco <= 0) return undefined;
    if (vencedor?.condition && vencedor.condition !== 'new') return undefined;
    const original = Number(vencedor?.original_price);
    const precoOriginal = Number.isFinite(original) && original > preco ? original : undefined;
    const foto = String(p?.pictures?.[0]?.url ?? p?.pictures?.[0]?.secure_url ?? '').replace(/^http:/, 'https:');
    const permalink = /^https:\/\//.test(String(p?.permalink ?? '')) ? String(p.permalink) : `https://www.mercadolivre.com.br/p/${idProduto}`;
    return {
      loja: 'mercadolivre',
      // O mesmo identificador que a leitura da página usa (o do produto), para a oferta não repetir quando a página voltar.
      idProduto,
      titulo,
      preco,
      precoOriginal,
      desconto: precoOriginal ? Math.round((1 - preco / precoOriginal) * 100) : undefined,
      imagem: foto || undefined,
      link: linkAfiliadoML(permalink, this.opcoes.mattWord, this.opcoes.mattTool),
      freteGratis: vencedor?.shipping?.free_shipping ? true : undefined,
      maisVendido: true,
    };
  }
}
