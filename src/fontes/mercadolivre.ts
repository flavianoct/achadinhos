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

/**
 * Mercado Livre pela página pública de ofertas.
 * A API oficial (pesquisa, mais vendidos, produtos) responde 403 para apps comuns, então o robô lê
 * a mesma página de ofertas que qualquer visitante vê: título, preço, preço antigo, foto, nota e vendas.
 */
export class FonteMercadoLivre implements Fonte {
  nome = 'mercadolivre' as const;
  private mattWord: string;
  private mattTool: string;
  private paginas: number;
  private intervaloMs: number;
  private fetchFn: Fetch;

  constructor(opcoes: { mattWord: string; mattTool: string; paginas?: number; intervaloMs?: number }, fetchFn: Fetch = fetch) {
    this.mattWord = opcoes.mattWord;
    this.mattTool = opcoes.mattTool;
    this.paginas = Math.max(1, opcoes.paginas ?? 3);
    this.intervaloMs = opcoes.intervaloMs ?? 1500;
    this.fetchFn = fetchFn;
  }

  private async baixar(pagina: number): Promise<string> {
    const url = pagina <= 1 ? `${SITE}/ofertas` : `${SITE}/ofertas?page=${pagina}`;
    const resposta = await this.fetchFn(url, {
      headers: { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!resposta.ok) throw new Error(`o site respondeu ${resposta.status}`);
    return resposta.text();
  }

  async coletar(): Promise<Oferta[]> {
    const vistos = new Map<string, Oferta>();
    let ultimoErro = '';
    let paginasLidas = 0;
    for (let pagina = 1; pagina <= this.paginas; pagina++) {
      if (pagina > 1) await pausa(this.intervaloMs);
      try {
        const cartoes = extrairCartoesML(await this.baixar(pagina));
        if (cartoes.length === 0) {
          ultimoErro = 'a página abriu, mas sem ofertas legíveis (o site pode ter mudado ou barrado o acesso)';
          break;
        }
        paginasLidas++;
        for (const c of cartoes) {
          const oferta = converterCartaoML(c, this.mattWord, this.mattTool);
          if (oferta && !vistos.has(oferta.idProduto)) vistos.set(oferta.idProduto, oferta);
        }
      } catch (e) {
        ultimoErro = (e as Error).message;
        break;
      }
    }
    if (paginasLidas === 0) throw new Error(`Mercado Livre: não consegui ler a página de ofertas (${ultimoErro}).`);
    return [...vistos.values()];
  }
}
