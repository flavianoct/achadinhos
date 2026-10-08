import { createHash } from 'node:crypto';
import type { Fonte, Oferta } from '../types.ts';

type Fetch = typeof fetch;

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

const ERROS_CONHECIDOS: Record<number, string> = {
  10020: 'assinatura inválida: confira SHOPEE_APP_ID e SHOPEE_SECRET e o relógio do computador',
  10030: 'limite de requisições atingido: aumente MINUTOS_ENTRE_COLETAS ou reduza SHOPEE_PAGINAS',
  10035: 'sua conta ainda não tem acesso à API: solicite a liberação no painel de afiliados',
  11001: 'parâmetro inválido na consulta',
};

const CAMPOS = `
  nodes {
    itemId productName offerLink productLink imageUrl
    priceMin priceMax priceDiscountRate sales ratingStar
    commissionRate shopName
  }
  pageInfo { page limit hasNextPage }
`;

/** Assinatura exigida pela Shopee: SHA256(AppId + Timestamp + Payload + Secret). */
export function assinarShopee(appId: string, secret: string, timestamp: number, payload: string): string {
  return createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`).digest('hex');
}

export function cabecalhoShopee(appId: string, secret: string, timestamp: number, payload: string): string {
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinarShopee(appId, secret, timestamp, payload)}`;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Converte um item da API da Shopee para o nosso formato. Devolve undefined se faltar o essencial. */
export function converterItemShopee(item: any): Oferta | undefined {
  const preco = num(item?.priceMin);
  const link = item?.offerLink;
  if (!item?.itemId || !item?.productName || !link || preco === undefined) return undefined;

  // A API informa o percentual de desconto da página do produto, mas não o preço "de": calculamos o "de" a partir dele (preço / (1 - desconto)),
  // que é o mesmo número que a página mostra riscado. Descontos fora de 5% a 90% são ignorados (dado estranho).
  const desconto = num(item.priceDiscountRate);
  const precoOriginal = desconto !== undefined && desconto >= 5 && desconto <= 90 ? Math.round((preco / (1 - desconto / 100)) * 100) / 100 : undefined;

  return {
    loja: 'shopee',
    idProduto: String(item.itemId),
    titulo: String(item.productName),
    preco,
    precoOriginal,
    desconto,
    imagem: item.imageUrl || undefined,
    link: String(link),
    nota: num(item.ratingStar),
    vendas: num(item.sales),
    comissao: num(item.commissionRate),
    nomeLoja: item.shopName || undefined,
  };
}

export class FonteShopee implements Fonte {
  nome = 'shopee' as const;
  private appId: string;
  private secret: string;
  private palavras: string[];
  private paginas: number;
  private fetchFn: Fetch;

  constructor(opcoes: { appId: string; secret: string; palavras?: string[]; paginas?: number }, fetchFn: Fetch = fetch) {
    this.appId = opcoes.appId;
    this.secret = opcoes.secret;
    this.palavras = opcoes.palavras ?? [];
    this.paginas = Math.max(1, opcoes.paginas ?? 2);
    this.fetchFn = fetchFn;
  }

  async consultar(query: string): Promise<any> {
    const payload = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000);
    const resposta = await this.fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: cabecalhoShopee(this.appId, this.secret, timestamp, payload),
      },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
    const dados = (await resposta.json().catch(() => undefined)) as any;
    if (!dados) throw new Error(`Shopee respondeu ${resposta.status} sem conteúdo legível`);
    if (dados.errors?.length) {
      const erro = dados.errors[0];
      const codigo = Number(erro.extensions?.code);
      throw new Error(`Shopee: ${ERROS_CONHECIDOS[codigo] ?? erro.message ?? 'erro desconhecido'} (código ${codigo || '?'})`);
    }
    return dados.data;
  }

  private async pagina(args: string): Promise<{ itens: any[]; temMais: boolean }> {
    const dados = await this.consultar(`{ productOfferV2(${args}) { ${CAMPOS} } }`);
    const r = dados?.productOfferV2;
    return { itens: r?.nodes ?? [], temMais: Boolean(r?.pageInfo?.hasNextPage) };
  }

  async coletar(): Promise<Oferta[]> {
    const vistos = new Map<string, Oferta>();
    const guardar = (itens: any[]) => {
      for (const item of itens) {
        const o = converterItemShopee(item);
        if (o && !vistos.has(o.idProduto)) vistos.set(o.idProduto, o);
      }
    };

    // listType 2 = produtos com melhor desempenho no programa de afiliados.
    for (let p = 1; p <= this.paginas; p++) {
      const { itens, temMais } = await this.pagina(`listType: 2, page: ${p}, limit: 50`);
      guardar(itens);
      if (!temMais) break;
    }
    // Buscas por palavra-chave, ordenadas pelos mais vendidos (sortType 2).
    for (const palavra of this.palavras) {
      const { itens } = await this.pagina(`keyword: ${JSON.stringify(palavra)}, sortType: 2, page: 1, limit: 50`);
      guardar(itens);
    }
    const lista = [...vistos.values()];
    // Resumo para o log da rodada: o que a API trouxe.
    console.log(`[shopee] ofertas: ${lista.length}; com desconto: ${lista.filter((o) => o.desconto).length}; com nota: ${lista.filter((o) => o.nota).length}; com vendas: ${lista.filter((o) => o.vendas).length}`);
    return lista;
  }
}
