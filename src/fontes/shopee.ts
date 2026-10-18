import type { CategoriaDaShopee } from '../nichos.ts';
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

/**
 * Buscas usadas em rodízio quando nenhuma é configurada (SHOPEE_PALAVRAS vazio e sem TEMA): sem elas a coleta só vê o topo do ranking
 * de afiliados, sempre os mesmos ~100 produtos (293 distintos em 4 dias). Uma ou duas por rodada trazem mais variedade a cada meia hora.
 */
/**
 * As buscas de cada nicho. Cada nicho tem as suas, para todos serem alimentados (e não só os que dominam o ranking de vendas).
 * O dono pode trocar tudo por SHOPEE_PALAVRAS (ou TEMA).
 */
export const BUSCAS_POR_NICHO: Record<string, string[]> = {
  tech: ['fone bluetooth', 'smartwatch', 'caixa de som bluetooth', 'carregador', 'power bank', 'suporte celular'],
  casa: ['air fryer', 'garrafa térmica', 'organizador', 'panela', 'luminária', 'ventilador', 'jogo de lençol'],
  games: ['cadeira gamer', 'mouse gamer', 'teclado gamer', 'headset gamer', 'controle ps4'],
  beleza: ['secador de cabelo', 'chapinha', 'perfume', 'skincare', 'kit maquiagem'],
  moda: ['tênis', 'mochila', 'bolsa feminina', 'relógio masculino', 'óculos de sol', 'relógio feminino', 'chinelo', 'tênis casual'],
  esporte: ['creatina', 'whey protein', 'halter', 'tapete yoga', 'garrafa academia'],
  pet: ['ração cachorro', 'cama para cachorro', 'arranhador para gato', 'coleira peitoral cachorro', 'comedouro bebedouro pet', 'brinquedo para cachorro'],
  bebe: ['carrinho de bebê', 'mamadeira', 'kit enxoval bebê', 'babá eletrônica', 'brinquedo educativo'],
  ferramentas: ['furadeira', 'parafusadeira', 'kit ferramentas', 'trena a laser', 'lanterna recarregável'],
};

/** As buscas dos nichos intercaladas (a 1ª de cada nicho, depois a 2ª de cada...), para o rodízio visitar todos os nichos com a mesma frequência. */
export function buscasIntercaladas(soNichos: string[] = []): string[] {
  const nichos = Object.entries(BUSCAS_POR_NICHO).filter(([n]) => !soNichos.length || soNichos.includes(n)).map(([, termos]) => termos);
  if (!nichos.length) return [];
  const maior = Math.max(...nichos.map((n) => n.length));
  const lista: string[] = [];
  for (let i = 0; i < maior; i++) for (const termos of nichos) if (termos[i]) lista.push(termos[i]!);
  return lista;
}

export const BUSCAS_PADRAO = buscasIntercaladas();

/** Rodízio: quais buscas ler neste turno (o robô roda a cada ~30 minutos). Com `porRodada` 0, nenhuma. */
export function buscasDoTurno(palavras: string[], porRodada: number, turno: number): string[] {
  if (porRodada <= 0 || palavras.length === 0) return [];
  const n = Math.min(porRodada, palavras.length);
  return Array.from({ length: n }, (_, j) => palavras[(turno * n + j) % palavras.length]!);
}

/**
 * As buscas do turno. Com palavras do dono (SHOPEE_PALAVRAS ou TEMA), só elas, em rodízio. Sem elas: o rodízio de todos os nichos e,
 * além dele, `buscasDeNicho` buscas dos nichos que têm canal ou grupo próprio (em rodízio entre eles), para esses canais nunca ficarem sem oferta.
 */
export function planoDeBuscas(palavrasDoDono: string[], porRodada: number, nichosPrioritarios: string[], buscasDeNicho: number, turno: number, nichosAtivos: string[] = []): string[] {
  const base = buscasDoTurno(palavrasDoDono.length ? palavrasDoDono : nichosAtivos.length ? buscasIntercaladas(nichosAtivos) : BUSCAS_PADRAO, porRodada, turno);
  if (palavrasDoDono.length || buscasDeNicho <= 0) return base;
  const nichos = nichosPrioritarios.filter((n) => BUSCAS_POR_NICHO[n]?.length && (!nichosAtivos.length || nichosAtivos.includes(n)));
  const extras: string[] = [];
  for (let j = 0; j < buscasDeNicho && nichos.length; j++) {
    const passo = turno * buscasDeNicho + j;
    const termos = BUSCAS_POR_NICHO[nichos[passo % nichos.length]!]!;
    const termo = termos[Math.floor(passo / nichos.length) % termos.length]!;
    if (!base.includes(termo) && !extras.includes(termo)) extras.push(termo);
  }
  return [...base, ...extras];
}

/**
 * As categorias da Shopee lidas neste turno (`productCatId`, os mais vendidos de cada uma). O rodízio intercala os nichos (a 1ª categoria de cada
 * nicho, depois a 2ª...), para todos serem lidos com a mesma frequência, e os nichos com canal ou grupo próprio ganham `extras` categorias a mais por rodada.
 */
export function planoDeCategorias(categorias: CategoriaDaShopee[], porRodada: number, nichosPrioritarios: string[], extras: number, turno: number): CategoriaDaShopee[] {
  if (!categorias.length || (porRodada <= 0 && extras <= 0)) return [];
  const grupos = new Map<string, CategoriaDaShopee[]>();
  for (const c of categorias) grupos.set(c.nicho, [...(grupos.get(c.nicho) ?? []), c]);
  const maior = Math.max(...[...grupos.values()].map((g) => g.length));
  const intercaladas: CategoriaDaShopee[] = [];
  for (let i = 0; i < maior; i++) for (const g of grupos.values()) if (g[i]) intercaladas.push(g[i]!);
  const n = Math.min(Math.max(0, porRodada), intercaladas.length);
  const base = Array.from({ length: n }, (_, j) => intercaladas[(turno * n + j) % intercaladas.length]!);
  const prioritarias = intercaladas.filter((c) => nichosPrioritarios.includes(c.nicho));
  const adicionais: CategoriaDaShopee[] = [];
  for (let j = 0; j < extras && prioritarias.length; j++) {
    const c = prioritarias[(turno * extras + j) % prioritarias.length]!;
    if (!base.some((b) => b.id === c.id) && !adicionais.some((b) => b.id === c.id)) adicionais.push(c);
  }
  return [...base, ...adicionais];
}

export class FonteShopee implements Fonte {
  nome = 'shopee' as const;
  private appId: string;
  private secret: string;
  private palavras: string[];
  private paginas: number;
  private buscasPorRodada: number;
  private nichosPrioritarios: string[];
  private buscasDeNicho: number;
  private categorias: CategoriaDaShopee[];
  private categoriasPorRodada: number;
  private categoriasDeNicho: number;
  private nichosAtivos: string[];
  private agora: () => number;
  private fetchFn: Fetch;

  constructor(opcoes: { appId: string; secret: string; palavras?: string[]; paginas?: number; buscasPorRodada?: number; nichosPrioritarios?: string[]; buscasDeNicho?: number; categorias?: CategoriaDaShopee[]; categoriasPorRodada?: number; categoriasDeNicho?: number; nichosAtivos?: string[]; agora?: () => number }, fetchFn: Fetch = fetch) {
    this.appId = opcoes.appId;
    this.secret = opcoes.secret;
    this.palavras = opcoes.palavras ?? [];
    this.paginas = Math.max(1, opcoes.paginas ?? 2);
    this.buscasPorRodada = opcoes.buscasPorRodada ?? 2;
    this.nichosPrioritarios = opcoes.nichosPrioritarios ?? [];
    this.buscasDeNicho = opcoes.buscasDeNicho ?? 0;
    this.categorias = opcoes.categorias ?? [];
    this.categoriasPorRodada = opcoes.categoriasPorRodada ?? 0;
    this.categoriasDeNicho = opcoes.categoriasDeNicho ?? 0;
    this.nichosAtivos = opcoes.nichosAtivos ?? [];
    this.agora = opcoes.agora ?? Date.now;
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

    const turno = Math.floor(this.agora() / (25 * 60_000));
    // Com NICHOS_ATIVOS, o robô puxa só esses nichos: o ranking geral de afiliados mistura todos, então fica de fora.
    const restrito = this.nichosAtivos.length > 0;
    let ultimoErro: Error | undefined;

    // listType 2 = produtos com melhor desempenho no programa de afiliados.
    if (!restrito) {
      for (let p = 1; p <= this.paginas; p++) {
        const { itens, temMais } = await this.pagina(`listType: 2, page: ${p}, limit: 50`);
        guardar(itens);
        if (!temMais) break;
      }
    }

    // Por categoria (productCatId), ordenadas pelos mais vendidos (sortType 2): é o que separa a coleta por nicho.
    const categorias = planoDeCategorias(this.categorias, this.categoriasPorRodada, this.nichosPrioritarios, this.categoriasDeNicho, turno);
    const resumoDasCategorias: string[] = [];
    const semResultado = new Set<string>();
    for (const c of categorias) {
      try {
        const { itens } = await this.pagina(`productCatId: ${c.id}, sortType: 2, page: 1, limit: 50`);
        guardar(itens);
        resumoDasCategorias.push(`${c.nome}=${itens.length}`);
        if (!itens.length) semResultado.add(c.nicho);
      } catch (e) {
        ultimoErro = e as Error;
        semResultado.add(c.nicho);
        resumoDasCategorias.push(`${c.nome}=erro`);
        console.log(`[shopee] categoria "${c.nome}" (${c.id}) falhou: ${(e as Error).message}`);
      }
    }

    // Nenhuma categoria trouxe produto: tenta a consulta sem ordenação (a combinação pode ser o problema) e anota no log quais ids a Shopee
    // usa de verdade nas categorias de um produto, para a lista em nichos.ts poder ser corrigida. Só diagnóstico: nunca derruba a rodada.
    if (categorias.length && categorias.every((c) => resumoDasCategorias.includes(`${c.nome}=0`))) {
      try {
        const c = categorias[0]!;
        const { itens } = await this.pagina(`productCatId: ${c.id}, page: 1, limit: 50`);
        guardar(itens);
        console.log(`[shopee] diagnóstico: "${c.nome}" sem ordenação trouxe ${itens.length} produtos`);
        const termo = BUSCAS_POR_NICHO[c.nicho]?.[0];
        if (termo) {
          const d = await this.consultar(`{ productOfferV2(keyword: ${JSON.stringify(termo)}, sortType: 2, page: 1, limit: 3) { nodes { itemId productCatIds } } }`);
          console.log(`[shopee] diagnóstico: ids de categoria dos produtos de "${termo}": ${JSON.stringify((d?.productOfferV2?.nodes ?? []).map((n: any) => n.productCatIds))}`);
        }
      } catch (e) {
        console.log(`[shopee] diagnóstico das categorias falhou: ${(e as Error).message}`);
      }
    }

    // Buscas por palavra-chave, ordenadas pelos mais vendidos (sortType 2).
    // Com buscas configuradas (ou tema), usa as configuradas em rodízio; sem nenhuma, a lista padrão. Falha de uma busca não derruba a rodada.
    const buscas = planoDeBuscas(this.palavras, this.buscasPorRodada, this.nichosPrioritarios, this.buscasDeNicho, turno, this.nichosAtivos);
    // Plano B: categoria que veio vazia (ou o id não vale) é substituída por uma busca por palavra do mesmo nicho.
    for (const nicho of semResultado) {
      const termos = BUSCAS_POR_NICHO[nicho];
      const termo = termos?.[turno % (termos?.length || 1)];
      if (termo && !buscas.includes(termo)) buscas.push(termo);
    }
    for (const palavra of buscas) {
      try {
        const { itens } = await this.pagina(`keyword: ${JSON.stringify(palavra)}, sortType: 2, page: 1, limit: 50`);
        guardar(itens);
      } catch (e) {
        if (vistos.size === 0) throw e;
        console.log(`[shopee] busca "${palavra}" falhou: ${(e as Error).message}`);
        break;
      }
    }
    if (vistos.size === 0 && ultimoErro) throw ultimoErro;
    const lista = [...vistos.values()];
    // Resumo para o log da rodada: o que a API trouxe.
    console.log(`[shopee] categorias: ${resumoDasCategorias.join(', ') || 'nenhuma'}; buscas: ${buscas.join(', ') || 'nenhuma'}; ofertas: ${lista.length}; com desconto: ${lista.filter((o) => o.desconto).length}; com nota: ${lista.filter((o) => o.nota).length}; com vendas: ${lista.filter((o) => o.vendas).length}`);
    return lista;
  }
}
