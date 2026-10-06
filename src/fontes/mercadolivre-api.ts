import type { Oferta } from '../types.ts';
import { linkAfiliadoML } from './mercadolivre.ts';

type Fetch = typeof fetch;

const API = 'https://api.mercadolibre.com';
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O nome do catálogo vem cheio de listas de modelos ("iPhone X Xr 11 12 13 14 15 16..."): tira as sequências de números soltos e corta em 110 caracteres, numa palavra inteira. */
export function limparTituloML(titulo: string): string {
  const t = titulo.replace(/\s+/g, ' ').replace(/(?:\s(?:[A-Za-z]{1,2}\s)?\d{1,2}){4,}/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= 110) return t;
  const corte = t.slice(0, 110);
  return corte.slice(0, Math.max(corte.lastIndexOf(' '), 60)).replace(/[\s,;:\-–]+$/, '');
}

/** Erro da API com o código HTTP, para o resumo da rodada mostrar o motivo exato. */
export class ErroApiML extends Error {}

/**
 * Mercado Livre pela API oficial (reserva da leitura da página, que o site às vezes barra com captcha).
 * Usa o app do DevCenter (ML_CLIENT_ID e ML_CLIENT_SECRET, Secrets do GitHub): troca as chaves por um token,
 * lê os 20 mais vendidos de cada categoria (/highlights), busca os detalhes dos itens (/items/bulk) e a nota (/reviews).
 * Só lê dados públicos; não precisa de nenhuma permissão de vendedor.
 */
export class FonteMercadoLivreApi {
  private token?: string;
  private fetchFn: Fetch;
  private pausaMs: number;
  private opcoes: { clientId: string; clientSecret: string; mattWord: string; mattTool: string; categorias: string[]; porRodada?: number };

  constructor(opcoes: { clientId: string; clientSecret: string; mattWord: string; mattTool: string; categorias: string[]; porRodada?: number }, fetchFn: Fetch = fetch, pausaMs = 250) {
    this.opcoes = opcoes;
    this.fetchFn = fetchFn;
    this.pausaMs = pausaMs;
  }

  private async pedir(caminho: string, init: RequestInit = {}): Promise<any> {
    const r = await this.fetchFn(`${API}${caminho}`, { ...init, signal: AbortSignal.timeout(30_000) });
    const texto = await r.text();
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

  /** As categorias do turno: um rodízio pequeno (a API tem limite de pedidos). */
  private categoriasDoTurno(turno: number): string[] {
    const validas = this.opcoes.categorias.filter((c) => /^MLB\d+$/.test(c));
    const n = Math.min(this.opcoes.porRodada ?? 2, validas.length);
    return Array.from({ length: n }, (_, j) => validas[(turno * n + j) % validas.length]!);
  }

  async coletar(turno = Math.floor(Date.now() / (25 * 60_000))): Promise<Oferta[]> {
    if (!this.opcoes.clientId || !this.opcoes.clientSecret) throw new ErroApiML('faltam os Secrets ML_CLIENT_ID e ML_CLIENT_SECRET');
    const ofertas = new Map<string, Oferta>();
    const ignorados = new Map<string, number>();
    const formatos = new Set<string>();
    let vistosNoRanking = 0;
    const falhas = new Map<string, number>();
    const falhou = (rotulo: string, e: unknown) => {
      const codigo = /^(\d{3})/.exec((e as Error).message)?.[1] ?? 'erro';
      falhas.set(` `, (falhas.get(` `) ?? 0) + 1);
    };
    let ultimoErro = '';
    for (const categoria of this.categoriasDoTurno(turno)) {
      let ids: string[] = [];
      const produtos: string[] = [];
      try {
        const destaque = await this.autorizado(`/highlights/MLB/category/${categoria}`);
        for (const c of destaque?.content ?? []) {
          if (c?.type === 'ITEM' && /^MLB\d+$/.test(String(c.id))) ids.push(String(c.id));
          else if (c?.type === 'PRODUCT' && /^MLB\d+$/.test(String(c.id))) produtos.push(String(c.id));
          if (c?.id) vistosNoRanking++;
          else ignorados.set(String(c?.type), (ignorados.get(String(c?.type)) ?? 0) + 1);
        }
      } catch (e) {
        ultimoErro = (e as Error).message;
        if (/^40[13]/.test(ultimoErro)) break; // sem permissão: insistir nas outras categorias não muda nada
        continue;
      }
      // Produto de catálogo (PRODUCT): o anúncio que vende é o "vencedor" (buy_box_winner); sem ele, o primeiro da lista de anúncios do produto.
      for (const idProduto of produtos.slice(0, 20)) {
        await pausa(this.pausaMs);
        try {
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
                ultimoErro = (e as Error).message;
              }
            }
          }
          // O preço vem do anúncio vencedor; sem ele, do primeiro anúncio da lista do produto.
          let vencedor = p?.buy_box_winner;
          if (!Number.isFinite(Number(vencedor?.price))) {
            try {
              vencedor = (await this.autorizado(`/products/${idProduto}/items?limit=1`))?.results?.[0];
            } catch (e) {
              ultimoErro = (e as Error).message;
            }
          }
          const oferta = this.converterProduto(p, vencedor, /^MLB\d+$/.test(String(p?.id ?? '')) ? String(p.id) : idProduto);
          if (!oferta) {
            formatos.add(`produto sem preço (campos: ${Object.keys(p ?? {}).slice(0, 10).join(',')}${vencedor ? `; vencedor: ${Object.keys(vencedor).slice(0, 8).join(',')}` : '; sem vencedor'})`);
            continue;
          }
          // Nota e vendas são complementos: se a API não der, a oferta segue sem eles.
          const itemId = String(vencedor?.item_id ?? vencedor?.id ?? '');
          if (/^MLB\d+$/.test(itemId)) {
            try {
              const vendidos = Number((await this.autorizado(`/items/${itemId}?attributes=sold_quantity`))?.sold_quantity);
              if (Number.isFinite(vendidos) && vendidos > 0) oferta.vendas = vendidos;
            } catch (e) {
              falhou('anúncio', e);
            }
            try {
              const media = Number((await this.autorizado(`/reviews/item/${itemId}`))?.rating_average);
              if (Number.isFinite(media) && media > 0 && media <= 5) oferta.nota = Math.round(media * 10) / 10;
            } catch (e) {
              falhou('avaliações', e);
            }
          }
          if (!ofertas.has(oferta.idProduto)) ofertas.set(oferta.idProduto, oferta);
        } catch (e) {
          ultimoErro = (e as Error).message;
        }
      }
      ids = [...new Set(ids)].slice(0, 20);
      if (ids.length === 0) continue;
      let itens: any[] = [];
      try {
        const r = await this.autorizado(`/items/bulk?ids=${ids.join(',')}`);
        const lista = Array.isArray(r) ? r : [];
        itens = lista.map((x) => x?.body ?? x).filter((b) => b && b.id);
        if (itens.length === 0 && lista.length) formatos.add(`anúncios sem dados (status ${lista[0]?.status_code ?? lista[0]?.code}; campos: ${Object.keys(lista[0]?.body ?? lista[0] ?? {}).slice(0, 6).join(',')})`);
      } catch (e) {
        ultimoErro = (e as Error).message;
        continue;
      }
      for (const b of itens) {
        const oferta = this.converter(b);
        if (!oferta) continue;
        await pausa(this.pausaMs);
        try {
          const rev = await this.autorizado(`/reviews/item/${oferta.idProduto}`);
          const media = Number(rev?.rating_average);
          if (Number.isFinite(media) && media > 0 && media <= 5) oferta.nota = Math.round(media * 10) / 10;
        } catch {
          // sem nota o produto só não passa no filtro de qualidade; a oferta continua valendo
        }
        if (!ofertas.has(oferta.idProduto)) ofertas.set(oferta.idProduto, oferta);
      }
    }
    const lista = [...ofertas.values()];
    // Resumo do que a API trouxe, para o log da rodada mostrar o que existe (e o que falta) sem adivinhar.
    console.log(`[ml-api] ranking: ${vistosNoRanking} produtos; ofertas: ${lista.length}; com preço antigo: ${lista.filter((o) => o.precoOriginal).length}; com nota: ${lista.filter((o) => o.nota).length}; com vendas: ${lista.filter((o) => o.vendas).length}; com frete grátis: ${lista.filter((o) => o.freteGratis).length}; falhas dos complementos: ${[...falhas].map(([k, n]) => ` x${n}`).join(', ') || 'nenhuma'}`);
    if (ofertas.size === 0) {
      const tipos = [...ignorados].map(([t, n]) => `${n} do tipo ${t}`).join(', ');
      throw new ErroApiML(`API do Mercado Livre sem ofertas${ultimoErro ? `: ${ultimoErro}` : ''}${tipos ? ` (itens que a API devolveu em outro formato: ${tipos})` : ''}${formatos.size ? ` [${[...formatos].slice(0, 2).join('; ')}]` : ''}`);
    }
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

  private converter(b: any): Oferta | undefined {
    if (b.status && b.status !== 'active') return undefined;
    if (b.condition && b.condition !== 'new') return undefined;
    const preco = Number(b.price);
    const permalink = String(b.permalink ?? '');
    if (!b.id || !b.title || !Number.isFinite(preco) || preco <= 0 || !/^https:\/\//.test(permalink)) return undefined;
    const original = Number(b.original_price);
    const precoOriginal = Number.isFinite(original) && original > preco ? original : undefined;
    const foto = String(b.pictures?.[0]?.secure_url ?? b.thumbnail ?? '').replace(/^http:/, 'https:');
    const vendidos = Number(b.sold_quantity);
    return {
      loja: 'mercadolivre',
      idProduto: String(b.id),
      titulo: String(b.title),
      preco,
      precoOriginal,
      desconto: precoOriginal ? Math.round((1 - preco / precoOriginal) * 100) : undefined,
      imagem: foto || undefined,
      link: linkAfiliadoML(permalink, this.opcoes.mattWord, this.opcoes.mattTool),
      vendas: Number.isFinite(vendidos) && vendidos > 0 ? vendidos : undefined,
      freteGratis: b.shipping?.free_shipping ? true : undefined,
    };
  }
}
