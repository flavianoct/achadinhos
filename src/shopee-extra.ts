import { FonteShopee } from './fontes/shopee.ts';

/**
 * Vendas (conversionReport) e campanhas (shopeeOfferV2) da API de afiliados da Shopee.
 *
 * A documentação pública não traz os nomes exatos de todos os campos, e pedir um campo que não existe derruba a consulta
 * inteira. Por isso a seleção é montada a partir do que a própria API diz ter (introspecção): de uma lista de campos
 * desejados, só entram os que existem.
 */

/** Campo desejado: `true` para um valor simples, ou outra árvore para um objeto. */
export type Desejo = { [campo: string]: true | Desejo };

type Consultar = (query: string) => Promise<any>;

const TIPO = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';

function nomeBase(t: any): string | undefined {
  while (t && !t.name) t = t.ofType;
  return t?.name;
}

/** Monta a seleção GraphQL de `tipo` com os campos de `desejo` que existem. Vazio se nenhum existir. */
export async function montarSelecao(consultar: Consultar, tipo: string, desejo: Desejo, cache = new Map<string, Map<string, string | undefined>>()): Promise<string> {
  let campos = cache.get(tipo);
  if (!campos) {
    const dados = await consultar(`{ __type(name: ${JSON.stringify(tipo)}) { fields { name type { ${TIPO} } } } }`);
    campos = new Map(((dados?.__type?.fields ?? []) as any[]).map((f) => [f.name as string, nomeBase(f.type)]));
    cache.set(tipo, campos);
  }
  const partes: string[] = [];
  for (const [nome, sub] of Object.entries(desejo)) {
    if (!campos.has(nome)) continue;
    if (sub === true) partes.push(nome);
    else {
      const filho = campos.get(nome);
      if (!filho) continue;
      const interno = await montarSelecao(consultar, filho, sub, cache);
      if (interno) partes.push(`${nome} { ${interno} }`);
    }
  }
  return partes.join(' ');
}

/** Tipo devolvido por uma consulta raiz (ex.: conversionReport → ConversionReportConnection). */
async function tipoDaConsulta(consultar: Consultar, consulta: string): Promise<string | undefined> {
  const dados = await consultar(`{ __schema { queryType { fields { name type { ${TIPO} } } } } }`);
  const campo = ((dados?.__schema?.queryType?.fields ?? []) as any[]).find((f) => f.name === consulta);
  return campo ? nomeBase(campo.type) : undefined;
}

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? undefined : n;
};

/** Segundos ou milissegundos → milissegundos. */
const emMs = (v: unknown): number | undefined => {
  const n = num(v);
  return n === undefined ? undefined : n < 1e12 ? n * 1000 : n;
};

/** Um item vendido, já com valor e comissão em reais. */
export interface ItemVendido {
  chave: string;
  compradoEm: number;
  itemId: string;
  nome: string;
  valor: number;
  comissao: number;
  status?: string;
  categoriaDaLoja?: string;
}

const DESEJO_VENDAS: Desejo = {
  nodes: {
    purchaseTime: true,
    conversionId: true,
    orders: {
      orderId: true,
      orderStatus: true,
      items: {
        itemId: true,
        itemName: true,
        itemPrice: true,
        qty: true,
        actualAmount: true,
        itemTotalCommission: true,
        itemCommission: true,
        displayItemStatus: true,
        globalCategoryLv1Name: true,
        categoryLv1Name: true,
        modelId: true,
      },
    },
  },
  pageInfo: { hasNextPage: true, scrollId: true },
};

/** Converte os nós do conversionReport em itens vendidos. Nó sem pedido ou item é ignorado. */
export function converterVendas(nodes: any[]): ItemVendido[] {
  const itens: ItemVendido[] = [];
  for (const n of nodes ?? []) {
    const compradoEm = emMs(n?.purchaseTime) ?? 0;
    for (const pedido of n?.orders ?? []) {
      (pedido?.items ?? []).forEach((it: any, i: number) => {
        const itemId = it?.itemId !== undefined && it?.itemId !== null ? String(it.itemId) : '';
        if (!itemId) return;
        const qtd = num(it.qty) ?? 1;
        const valor = num(it.actualAmount) ?? (num(it.itemPrice) ?? 0) * qtd;
        const comissao = num(it.itemTotalCommission) ?? num(it.itemCommission) ?? 0;
        itens.push({
          chave: `${n.conversionId ?? ''}:${pedido.orderId ?? ''}:${itemId}:${it.modelId ?? i}`,
          compradoEm,
          itemId,
          nome: String(it.itemName ?? ''),
          valor,
          comissao,
          status: it.displayItemStatus ?? pedido.orderStatus ?? undefined,
          categoriaDaLoja: it.globalCategoryLv1Name ?? it.categoryLv1Name ?? undefined,
        });
      });
    }
  }
  return itens;
}

/** Vendas dos últimos `dias` dias (no máximo 10 páginas de 500). */
export async function buscarVendas(fonte: FonteShopee, dias: number, agora: Date = new Date()): Promise<ItemVendido[]> {
  const consultar: Consultar = (q) => fonte.consultar(q);
  const tipo = await tipoDaConsulta(consultar, 'conversionReport');
  if (!tipo) throw new Error('a API da Shopee não tem conversionReport');
  const selecao = await montarSelecao(consultar, tipo, DESEJO_VENDAS);
  if (!selecao.includes('nodes')) throw new Error('conversionReport sem os campos esperados');
  const fim = Math.floor(agora.getTime() / 1000);
  const inicio = fim - dias * 86_400;
  const itens: ItemVendido[] = [];
  let scroll: string | undefined;
  for (let pagina = 0; pagina < 10; pagina++) {
    const args = [`purchaseTimeStart: ${inicio}`, `purchaseTimeEnd: ${fim}`, 'limit: 500', ...(scroll ? [`scrollId: ${JSON.stringify(scroll)}`] : [])];
    const dados = await consultar(`{ conversionReport(${args.join(', ')}) { ${selecao} } }`);
    const r = dados?.conversionReport;
    itens.push(...converterVendas(r?.nodes ?? []));
    scroll = r?.pageInfo?.scrollId || undefined;
    if (!r?.pageInfo?.hasNextPage || !scroll) break;
  }
  return itens;
}

/** Uma campanha da própria Shopee (página de ofertas com link de afiliado). */
export interface Campanha {
  id: string;
  nome: string;
  link: string;
  imagem?: string;
  comissao?: number;
  inicio?: number;
  fim?: number;
}

const DESEJO_CAMPANHAS: Desejo = {
  nodes: { offerName: true, offerLink: true, originalLink: true, imageUrl: true, commissionRate: true, periodStartTime: true, periodEndTime: true, collectionId: true, offerType: true },
};

export function converterCampanhas(nodes: any[]): Campanha[] {
  const lista: Campanha[] = [];
  for (const n of nodes ?? []) {
    const link = String(n?.offerLink ?? '');
    // Tira traços e pontuação soltos no começo e no fim ("- - Health" vira "Health").
    const nome = String(n?.offerName ?? '').replace(/\s+/g, ' ').replace(/^[\s\-–—|:.,_*#]+|[\s\-–—|:.,_*#]+$/g, '').trim();
    // Nome de verdade: pelo menos duas palavras com letras e 8 letras no total; senão é um rótulo interno da Shopee.
    const palavras = nome.split(' ').filter((p) => /\p{L}{2,}/u.test(p));
    const letras = (nome.match(/\p{L}/gu) ?? []).length;
    if (!/^https:\/\//.test(link) || palavras.length < 2 || letras < 8) continue;
    // offerType 2 = página de categoria (nome em inglês, ex. "- - Health"), não é campanha: fica de fora.
    if (Number(n?.offerType) === 2 || /-cat\.\d+/.test(String(n?.originalLink ?? ''))) continue;
    lista.push({
      id: String(n.collectionId ?? n.originalLink ?? link),
      nome,
      link,
      imagem: /^https:\/\//.test(String(n.imageUrl ?? '')) ? String(n.imageUrl) : undefined,
      comissao: num(n.commissionRate),
      inicio: emMs(n.periodStartTime),
      fim: emMs(n.periodEndTime),
    });
  }
  return lista;
}

/** Os nós como a Shopee devolve (para conferência). */
export async function buscarCampanhasBrutas(fonte: FonteShopee): Promise<any[]> {
  const consultar: Consultar = (q) => fonte.consultar(q);
  const tipo = await tipoDaConsulta(consultar, 'shopeeOfferV2');
  if (!tipo) throw new Error('a API da Shopee não tem shopeeOfferV2');
  const selecao = await montarSelecao(consultar, tipo, DESEJO_CAMPANHAS);
  if (!selecao.includes('offerLink')) throw new Error('shopeeOfferV2 sem o link da campanha');
  const dados = await consultar(`{ shopeeOfferV2(page: 1, limit: 30) { ${selecao} } }`);
  return dados?.shopeeOfferV2?.nodes ?? [];
}

export async function buscarCampanhas(fonte: FonteShopee): Promise<Campanha[]> {
  return converterCampanhas(await buscarCampanhasBrutas(fonte));
}

/** Campanha em vigor que ainda não saiu nos últimos dias; a de maior comissão primeiro. */
export function escolherCampanha(campanhas: Campanha[], ultimoPost: (id: string) => number | undefined, repetirDias: number, agora: Date): Campanha | undefined {
  const t = agora.getTime();
  return campanhas
    .filter((c) => (!c.inicio || c.inicio <= t) && (!c.fim || c.fim > t))
    .filter((c) => {
      const u = ultimoPost(c.id);
      return u === undefined || t - u >= repetirDias * 86_400_000;
    })
    .sort((a, b) => (b.comissao ?? 0) - (a.comissao ?? 0))[0];
}
