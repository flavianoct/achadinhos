import type { Fonte, Loja, Oferta } from '../types.ts';
import { extrairAsin, linkAfiliadoAmazon } from './amazon.ts';
import { linkAfiliadoML } from './mercadolivre.ts';

type Fetch = typeof fetch;

/**
 * Promobit como fonte EXTRA de ofertas do Mercado Livre (e da Amazon, quando ela for ligada). Ideia copiada do projeto pega-oferta.
 * O site do ML barra o nosso servidor por IP desde 06/10; o Promobit, não. A página de ofertas da loja Mercado Livre no Promobit
 * traz título, preço, preço "de" e foto já estruturados (bloco __NEXT_DATA__). O link do produto sai da página de redirecionamento
 * do Promobit (um link curto meli.la), que é expandido só até o primeiro endereço do ML, sem abrir a página do produto.
 * Depois, o link de afiliado do Promobit é trocado pelo SEU (matt_word e matt_tool). Oferta cujo link não deu para expandir é
 * descartada: sem o link limpo do ML, a venda iria para o Promobit e não para você.
 */

const SITE = 'https://www.promobit.com.br';
type LojaPromobit = Extract<Loja, 'mercadolivre' | 'amazon'>;
/** Domínio da loja como o Promobit escreve, e a página de ofertas dela. A página inicial (que mistura lojas) entra também. */
const LOJAS: Record<LojaPromobit, { dominio: string; pagina: string }> = {
  mercadolivre: { dominio: 'mercadolivre.com.br', pagina: `${SITE}/promocoes/loja/mercado-livre/` },
  amazon: { dominio: 'amazon.com.br', pagina: `${SITE}/promocoes/loja/amazon/` },
};
const PAGINA_INICIAL = `${SITE}/`;
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const CABECALHOS = { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html,application/xhtml+xml' };
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uma oferta como o Promobit a publica (só os campos que usamos). */
export interface OfertaPromobit {
  offerId: number;
  offerTitle: string;
  offerPrice: number;
  offerOldPrice?: number | null;
  offerDiscontPercentage?: number | null;
  offerPhoto?: string | null;
  offerSlug?: string;
  offerCoupon?: string | null;
  offerStatusName?: string;
  offerPriceType?: string;
  storeDomain?: string;
  storeName?: string;
}

/** Lê as ofertas de uma página do Promobit e devolve só as das lojas pedidas, com preço de produto. undefined = a página mudou de formato. */
export function extrairOfertasPromobit(html: string, lojas: LojaPromobit[] = ['mercadolivre']): OfertaPromobit[] | undefined {
  const dominios = new Set(lojas.map((l) => LOJAS[l].dominio));
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return undefined;
  let pp: any;
  try {
    pp = JSON.parse(m[1]!)?.props?.pageProps;
  } catch {
    return undefined;
  }
  if (!pp || typeof pp !== 'object') return undefined;
  const brutas: any[] = [
    ...(Array.isArray(pp.serverOffers?.offers) ? pp.serverOffers.offers : []),
    ...(Array.isArray(pp.serverFeaturedOffers) ? pp.serverFeaturedOffers : []),
    ...(Array.isArray(pp.sidebarFeaturedOffers) ? pp.sidebarFeaturedOffers : []),
    ...(Array.isArray(pp.store?.topOffers) ? pp.store.topOffers : []),
  ];
  const vistas = new Set<number>();
  const ofertas: OfertaPromobit[] = [];
  for (const o of brutas) {
    const id = Number(o?.offerId);
    const preco = Number(o?.offerPrice);
    if (!Number.isFinite(id) || vistas.has(id) || typeof o?.offerTitle !== 'string') continue;
    vistas.add(id);
    if (!dominios.has(String(o.storeDomain ?? '').toLowerCase())) continue;
    // Fora: cupom avulso (preço simbólico de R$ 0,01), chamada de grupo (FREE), oferta restrita/encerrada.
    if (!Number.isFinite(preco) || preco < 1) continue;
    if (/^cupom\b/i.test(o.offerTitle.trim())) continue;
    if (String(o.offerPriceType ?? '').toUpperCase() === 'FREE') continue;
    if (/RESTRICTED|FINISHED|EXPIRED|DELETED|REJECTED/i.test(String(o.offerStatusName ?? ''))) continue;
    ofertas.push({ ...o, offerId: id, offerPrice: preco });
  }
  return ofertas;
}

/** Foto da oferta no servidor de imagens do Promobit (o caminho vem relativo, como "/329733...png"). */
export function fotoPromobit(caminho: string | null | undefined): string | undefined {
  const c = String(caminho ?? '').trim();
  if (!c) return undefined;
  if (/^https:\/\//i.test(c)) return c;
  if (!/^\/[\w./-]+$/.test(c)) return undefined;
  return `https://i.promobit.com.br${c}`;
}

/** O link da loja escrito na página "Redirecionando para a loja" do Promobit (hoje um meli.la no ML; amzn.to ou amazon.com.br na Amazon). */
export function linkDoRedirecionamento(html: string): string | undefined {
  const m = /https?:\\?\/\\?\/(?:[\w-]+\.)*(?:meli\.la|mercadolivre\.com(?:\.br)?|mercadolibre\.com|amzn\.to|amazon\.com\.br|a\.co)\\?\/[^"'\s<>)]*/i.exec(html);
  return m ? m[0].replace(/\\\//g, '/') : undefined;
}

/** Endereço da loja já com o produto (não é encurtador): ML fora de /sec/, ou Amazon com ASIN. */
function ehEnderecoFinal(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (/(^|\.)amazon\.com\.br$/.test(host)) return extrairAsin(url) !== undefined;
    if (!/(^|\.)mercadolivre\.com\.br$/.test(host)) return false;
    return !u.pathname.startsWith('/sec/');
  } catch {
    return false;
  }
}

/** "MLB-1234-..." , "/p/MLB1234" ou "item_id:MLB1234" -> "MLB1234". */
export function idDoProdutoML(url: string): string | undefined {
  let alvo = url;
  try {
    alvo = decodeURIComponent(url);
  } catch {
    // segue com o texto cru
  }
  // Na página de catálogo com anúncio escolhido (/p/MLB1?pdp_filters=item_id:MLB2), o produto de catálogo é o que identifica.
  const m = /\/p\/(MLB)(\d{5,})/i.exec(alvo) ?? /\b(MLB)-?(\d{5,})/i.exec(alvo);
  return m ? `MLB${m[2]}` : undefined;
}

/** Tira do link os parâmetros de afiliado e de rastreio de quem divulgou antes (o Promobit), mantendo o que escolhe o produto. */
export function limparLinkML(url: string): string {
  const u = new URL(url);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) {
    if (/^(matt_|utm_|ref$|forceInApp$|tracking_id$|sid$|source$|reco_|c_id$|c_uid$|c_element|c_campaign|deal_print_id$|polycard_)/i.test(k)) u.searchParams.delete(k);
  }
  return u.toString();
}

/**
 * Segue os redirecionamentos do link curto (meli.la, mercadolivre.com/sec/) um a um, sem baixar a página final:
 * para no primeiro endereço do ML que já é o do produto. Encurtador que não responde vira undefined (a oferta é descartada).
 */
export async function expandirLink(url: string, fetchFn: Fetch = fetch, saltos = 5): Promise<string | undefined> {
  let atual = url;
  for (let i = 0; i <= saltos; i++) {
    if (ehEnderecoFinal(atual)) return atual;
    let resposta: Response;
    try {
      resposta = await fetchFn(atual, { method: 'GET', redirect: 'manual', headers: CABECALHOS, signal: AbortSignal.timeout(10_000) });
    } catch {
      return undefined;
    }
    const proximo = resposta.headers.get('location');
    // Alguns encurtadores respondem 200 com o destino dentro da página (meta refresh / script).
    if (!proximo) {
      if (resposta.status !== 200) return undefined;
      const destino = linkDoRedirecionamento(await resposta.text());
      if (!destino || destino === atual) return undefined;
      atual = destino;
      continue;
    }
    await resposta.body?.cancel().catch(() => {});
    atual = new URL(proximo, atual).toString();
  }
  return ehEnderecoFinal(atual) ? atual : undefined;
}

export interface Afiliados {
  mercadolivre?: { mattWord: string; mattTool: string };
  amazon?: { tag: string };
}

/** Monta a Oferta do robô a partir da oferta do Promobit e do link do produto na loja, já com o SEU código de afiliado. */
export function converterOfertaPromobit(o: OfertaPromobit, linkDaLoja: string, afiliados: Afiliados): Oferta | undefined {
  let loja: LojaPromobit;
  let idProduto: string | undefined;
  let link: string | undefined;
  if (/(^|\.)amazon\.com\.br$/i.test(new URL(linkDaLoja).hostname)) {
    if (!afiliados.amazon?.tag) return undefined;
    loja = 'amazon';
    idProduto = extrairAsin(linkDaLoja);
    link = linkAfiliadoAmazon(linkDaLoja, afiliados.amazon.tag);
  } else {
    if (!afiliados.mercadolivre) return undefined;
    loja = 'mercadolivre';
    idProduto = idDoProdutoML(linkDaLoja);
    link = linkAfiliadoML(limparLinkML(linkDaLoja), afiliados.mercadolivre.mattWord, afiliados.mercadolivre.mattTool);
  }
  if (!idProduto || !link) return undefined;
  const preco = Math.round(o.offerPrice * 100) / 100;
  const antigo = Number(o.offerOldPrice);
  const precoOriginal = Number.isFinite(antigo) && antigo > preco ? antigo : undefined;
  const desconto = precoOriginal ? Math.round((1 - preco / precoOriginal) * 100) : undefined;
  return {
    loja,
    idProduto,
    titulo: o.offerTitle.replace(/\s+/g, ' ').trim(),
    preco,
    precoOriginal,
    desconto,
    imagem: fotoPromobit(o.offerPhoto),
    link,
    nomeLoja: loja === 'amazon' ? 'Amazon' : 'Mercado Livre',
  };
}

export interface OpcoesPromobit {
  /** Lojas ligadas e o seu código de afiliado em cada uma. Loja sem código não é coletada. */
  afiliados: Afiliados;
  /** Quantas ofertas abrir por rodada (cada uma custa 2 ou 3 pedidos pequenos, nenhum à página do produto). */
  maximo?: number;
  intervaloMs?: number;
}

/** Resultado da coleta, com o motivo quando nada veio (vai para o aviso do painel). */
export interface ColetaPromobit {
  ofertas: Oferta[];
  lidas: number;
  semLink: number;
  erro?: string;
}

/** Lojas que a coleta vai buscar: só as que têm o código de afiliado. */
function lojasLigadas(afiliados: Afiliados): LojaPromobit[] {
  const lojas: LojaPromobit[] = [];
  if (afiliados.mercadolivre?.mattWord && afiliados.mercadolivre.mattTool) lojas.push('mercadolivre');
  if (afiliados.amazon?.tag) lojas.push('amazon');
  return lojas;
}

/** Coleta as ofertas no Promobit. Nunca lança erro: falha vira `erro` no resultado (o Promobit é só um a mais). */
export async function coletarPromobit(opcoes: OpcoesPromobit, fetchFn: Fetch = fetch): Promise<ColetaPromobit> {
  const lojas = lojasLigadas(opcoes.afiliados);
  const resultado: ColetaPromobit = { ofertas: [], lidas: 0, semLink: 0 };
  if (!lojas.length) {
    resultado.erro = 'nenhuma loja com código de afiliado para o Promobit';
    return resultado;
  }
  const maximo = Math.max(0, opcoes.maximo ?? 15);
  const intervalo = opcoes.intervaloMs ?? 300;
  const brutas = new Map<number, OfertaPromobit>();
  let erro: string | undefined;
  for (const pagina of [...lojas.map((l) => LOJAS[l].pagina), PAGINA_INICIAL]) {
    try {
      const r = await fetchFn(pagina, { headers: CABECALHOS, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`o Promobit respondeu ${r.status}`);
      const lista = extrairOfertasPromobit(await r.text(), lojas);
      if (!lista) throw new Error('a página do Promobit mudou de formato');
      for (const o of lista) if (!brutas.has(o.offerId)) brutas.set(o.offerId, o);
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  resultado.lidas = brutas.size;
  if (brutas.size === 0) {
    resultado.erro = erro ?? 'nenhuma oferta das lojas ligadas no Promobit';
    return resultado;
  }
  const vistos = new Set<string>();
  let abertas = 0;
  for (const o of brutas.values()) {
    if (abertas >= maximo) break;
    if (abertas++) await pausa(intervalo);
    let linkDaLoja: string | undefined;
    try {
      const r = await fetchFn(`${SITE}/Redirect/to/${o.offerId}/`, { headers: CABECALHOS, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      const destino = r.headers.get('location') ?? (r.status === 200 ? linkDoRedirecionamento(await r.text()) : undefined);
      if (destino) linkDaLoja = await expandirLink(destino, fetchFn);
    } catch {
      // sem link: a oferta é descartada abaixo
    }
    const oferta = linkDaLoja ? converterOfertaPromobit(o, linkDaLoja, opcoes.afiliados) : undefined;
    if (!oferta) {
      resultado.semLink++;
      continue;
    }
    const chave = `${oferta.loja}:${oferta.idProduto}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.ofertas.push(oferta);
  }
  if (!resultado.ofertas.length) resultado.erro = `li ${brutas.size} ofertas no Promobit, mas nenhum link de produto abriu`;
  return resultado;
}

/**
 * A fonte "promobit" do robô. Independe de ML_ATIVO (o ML segue pausado sem mexer em nada dele): liga com PROMOBIT_ATIVO.
 * A Amazon só entra se AMAZON_ATIVO estiver ligado e houver AMAZON_TAG.
 */
export class FontePromobit implements Fonte {
  nome = 'promobit' as const;
  private opcoes: OpcoesPromobit;
  private fetchFn: Fetch;
  private aviso?: string;

  constructor(opcoes: OpcoesPromobit, fetchFn: Fetch = fetch) {
    this.opcoes = opcoes;
    this.fetchFn = fetchFn;
  }

  avisoDaColeta(): string | undefined {
    return this.aviso;
  }

  async coletar(): Promise<Oferta[]> {
    this.aviso = undefined;
    const r = await coletarPromobit(this.opcoes, this.fetchFn);
    console.log(`[promobit] ${r.lidas} ofertas lidas, ${r.ofertas.length} com link de afiliado, ${r.semLink} sem link do produto.`);
    if (!r.ofertas.length) throw new Error(r.erro ?? 'nenhuma oferta');
    return r.ofertas;
  }
}
