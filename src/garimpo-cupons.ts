import type { Config } from './config.ts';
import { diaDe } from './db.ts';
import { linkAfiliadoML } from './fontes/mercadolivre.ts';
import { FonteShopee } from './fontes/shopee.ts';
import type { Cupom } from './cupons.ts';
import { chaveDoCupom } from './cupons.ts';

/**
 * Garimpo de cupons. Nem o Mercado Livre nem a Shopee têm API de cupom para afiliado, então o robô lê as páginas públicas de cupons
 * do Promobit (os dados vêm estruturados dentro da página) e só aproveita o que passa em travas bem rígidas, porque cupom inválido
 * no canal queima a confiança. O link do post é sempre o SEU de afiliado, nunca o do site de onde o cupom veio.
 */

type Loja = Cupom['loja'];

const PAGINAS: Record<Loja, string> = {
  mercadolivre: 'https://www.promobit.com.br/cupons/loja/mercado-livre/',
  shopee: 'https://www.promobit.com.br/cupons/loja/shopee/',
};

/** Página de cupons da própria loja, para onde o seu link de afiliado leva. */
const PAGINA_DE_CUPONS_ML = 'https://www.mercadolivre.com.br/cupons';

/** Um cupom como o site o publica, antes das travas. */
export interface CupomBruto {
  loja: Loja;
  codigo: string;
  titulo: string;
  instrucoes: string;
  /** AAAA-MM-DD, se o cupom tem validade. */
  validoAte?: string;
  /** Dia em que foi publicado (AAAA-MM-DD). */
  publicadoEm?: string;
  verificado: boolean;
  aprovado: boolean;
}

/** Códigos que os sites de cupom inventam para preencher a página: não são cupom de verdade. */
const CODIGOS_GENERICOS = new Set(
  ['desconto', 'economia', 'oferta', 'ofertas', 'cupom', 'promo', 'promocao', 'frete', 'gratis', 'aqui', 'link', 'ativar', 'resgate', 'resgatenolink', 'pegueaqui', 'diretonolink', 'cupomliberado', 'offaqui', 'descontoaqui', 'economiatotal', 'ofertasja'],
);

const BENEFICIO = /R\$\s?\d|\d+\s?%/;

/** Quantos cupons do garimpo entram por loja (os mais recentes): evita encher o canal de cupons parecidos com o mesmo link. */
export const MAXIMO_POR_LOJA = 4;

/** Texto sem tags HTML nem espaços repetidos. */
function limpar(s: unknown): string {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê os cupons de dentro da página (o bloco __NEXT_DATA__). Devolve undefined se a página mudou de formato. */
export function lerPaginaDeCupons(html: string, loja: Loja): CupomBruto[] | undefined {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return undefined;
  let lista: unknown;
  try {
    lista = JSON.parse(m[1]!)?.props?.pageProps?.serverCoupons?.coupons;
  } catch {
    return undefined;
  }
  if (!Array.isArray(lista)) return undefined;
  const dia = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
  return lista.map((c: any) => ({
    loja,
    codigo: limpar(c?.couponCode),
    titulo: limpar(c?.couponTitle),
    instrucoes: limpar(c?.couponInstructions),
    validoAte: dia(c?.couponUntil),
    publicadoEm: dia(c?.couponPublished),
    verificado: c?.couponVerified === true || c?.couponVerified === 1,
    aprovado: String(c?.couponStatusName ?? '').toUpperCase() === 'APPROVED',
  }));
}

/** Código que parece de verdade: letras e números, 5 a 20 caracteres, e que não é uma palavra solta. */
export function codigoPlausivel(codigo: string): boolean {
  if (!/^[A-Za-z0-9]{5,20}$/.test(codigo)) return false;
  return !CODIGOS_GENERICOS.has(codigo.toLowerCase());
}

/** "O momento chegou: Aplique cupom e ganhe R$20 OFF" vira "Aplique cupom e ganhe R$20 OFF" (tira a chamada antes dos dois-pontos). */
export function tituloDoGarimpo(titulo: string): string {
  const i = titulo.indexOf(':');
  const depois = i > 0 ? titulo.slice(i + 1).trim() : '';
  const base = depois && BENEFICIO.test(depois) ? depois : titulo;
  const t = base.replace(/\s*\.\s*$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function motivoDeRejeicao(c: CupomBruto, hoje: string): string | undefined {
  if (!c.aprovado) return 'não aprovado pelo site';
  if (!c.titulo || !BENEFICIO.test(c.titulo)) return 'sem benefício concreto no título';
  if (/cashback/i.test(c.titulo)) return 'cashback não é cupom';
  if (c.validoAte && c.validoAte < hoje) return 'vencido';
  const comCodigo = c.codigo !== '' && /[A-Za-z0-9]{4,}/.test(c.codigo) && !/\s/.test(c.codigo);
  if (comCodigo) {
    // Cupom com código: só vale o que o site marcou como verificado e que não tem cara de código inventado.
    if (!codigoPlausivel(c.codigo)) return 'código genérico';
    if (!c.verificado) return 'código não verificado';
    return undefined;
  }
  // Cupom de "ativar na página": sem data de validade não dá para saber se ainda vale.
  if (!c.validoAte) return 'sem validade';
  return undefined;
}

export interface OpcoesDoGarimpo {
  /** Palavras que descartam o cupom (no código ou no título). */
  bloquear: string[];
  linkMercadoLivre?: string;
  linkShopee?: string;
}

/** Aplica as travas e devolve só os cupons confiáveis, já com o link de afiliado seu. */
export function filtrarCuponsConfiaveis(brutos: CupomBruto[], agora: Date, opcoes: OpcoesDoGarimpo): { cupons: Cupom[]; descartados: number } {
  const hoje = diaDe(agora);
  const bloqueio = opcoes.bloquear.map((b) => b.toLowerCase()).filter(Boolean);
  const vistos = new Set<string>();
  const aceitos: Array<{ cupom: Cupom; publicadoEm: string }> = [];
  let descartados = 0;
  for (const c of brutos) {
    const link = c.loja === 'mercadolivre' ? opcoes.linkMercadoLivre : opcoes.linkShopee;
    const alvo = `${c.codigo} ${c.titulo}`.toLowerCase();
    if (!link || motivoDeRejeicao(c, hoje) || bloqueio.some((b) => alvo.includes(b))) {
      descartados++;
      continue;
    }
    const detalhe = c.instrucoes.length > 160 ? `${c.instrucoes.slice(0, 157).trimEnd()}...` : c.instrucoes;
    const cupom: Cupom = {
      loja: c.loja,
      titulo: tituloDoGarimpo(c.titulo),
      link,
      ...(codigoPlausivel(c.codigo) ? { codigo: c.codigo.toUpperCase() } : {}),
      ...(detalhe ? { detalhe } : {}),
      ...(c.validoAte ? { validoAte: c.validoAte } : {}),
    };
    const chave = chaveDoCupom(cupom);
    if (vistos.has(chave)) {
      descartados++;
      continue;
    }
    vistos.add(chave);
    aceitos.push({ cupom, publicadoEm: c.publicadoEm ?? '' });
  }
  // Os mais recentes de cada loja, até o máximo.
  const porLoja = new Map<Loja, number>();
  const cupons: Cupom[] = [];
  for (const { cupom } of aceitos.sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm))) {
    const n = porLoja.get(cupom.loja) ?? 0;
    if (n >= MAXIMO_POR_LOJA) {
      descartados++;
      continue;
    }
    porLoja.set(cupom.loja, n + 1);
    cupons.push(cupom);
  }
  return { cupons, descartados };
}

/** Os links de afiliado que o garimpo usa. O do Mercado Livre sai dos seus parâmetros (matt_word e matt_tool); o da Shopee você informa em CUPONS_LINK_SHOPEE. */
export function opcoesDoGarimpo(config: Config): OpcoesDoGarimpo {
  const { mattWord, mattTool } = config.ml;
  return {
    bloquear: config.cupons.bloquear,
    ...(mattWord && mattTool ? { linkMercadoLivre: linkAfiliadoML(PAGINA_DE_CUPONS_ML, mattWord, mattTool) } : {}),
    ...(config.cupons.linkShopee ? { linkShopee: config.cupons.linkShopee } : {}),
  };
}

/** Gera o seu link de afiliado da Shopee para uma página, pela API de afiliados (a mesma das ofertas). */
export async function gerarLinkShopee(config: Config, fetchFn: typeof fetch): Promise<string> {
  const fonte = new FonteShopee({ appId: config.shopee.appId, secret: config.shopee.secret }, fetchFn);
  const url = JSON.stringify(config.cupons.paginaShopee);
  const dados = await fonte.consultar(`mutation { generateShortLink(input: { originUrl: ${url}, subIds: ["cupons"] }) { shortLink } }`);
  const link = String(dados?.generateShortLink?.shortLink ?? '');
  if (!/^https:\/\//.test(link)) throw new Error('a Shopee não devolveu o link de afiliado');
  return link;
}

export interface ResultadoDoGarimpo {
  cupons: Cupom[];
  /** Problemas para mostrar só no painel do dono. */
  avisos: string[];
}

/** Busca os cupons das lojas ligadas (e escolhidas em CUPONS_LOJAS) e devolve só os confiáveis. Nunca lança: falha vira aviso. */
export async function garimparCupons(config: Config, agora: Date, fetchFn: typeof fetch = fetch): Promise<ResultadoDoGarimpo> {
  const resultado: ResultadoDoGarimpo = { cupons: [], avisos: [] };
  const opcoes = opcoesDoGarimpo(config);
  // Sem CUPONS_LINK_SHOPEE, o robô gera o link de afiliado sozinho com as chaves da Shopee que ele já usa.
  const quer = (l: Loja) => config.cupons.lojas.includes(l);
  if (quer('shopee') && config.shopee.ativo && !opcoes.linkShopee && config.shopee.appId && config.shopee.secret) {
    try {
      opcoes.linkShopee = await gerarLinkShopee(config, fetchFn);
    } catch (e) {
      resultado.avisos.push(`Garimpo de cupons da Shopee parado: não consegui gerar o seu link de afiliado (${(e as Error).message}). Se quiser, coloque um link seu em CUPONS_LINK_SHOPEE.`);
    }
  }
  const lojas: Loja[] = [];
  if (config.ml.ativo && quer('mercadolivre')) lojas.push('mercadolivre');
  if (config.shopee.ativo && quer('shopee')) lojas.push('shopee');
  for (const loja of lojas) {
    const link = loja === 'mercadolivre' ? opcoes.linkMercadoLivre : opcoes.linkShopee;
    if (!link) {
      if (loja === 'shopee') { if (!resultado.avisos.some((a) => a.includes('Shopee'))) resultado.avisos.push('Garimpo de cupons da Shopee parado: faltam as chaves da Shopee (SHOPEE_APP_ID e SHOPEE_SECRET) ou um link seu em CUPONS_LINK_SHOPEE.'); }
      else resultado.avisos.push('Garimpo de cupons do Mercado Livre parado: faltam ML_MATT_WORD e ML_MATT_TOOL.');
      continue;
    }
    try {
      const r = await fetchFn(PAGINAS[loja], { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MataPrecoBot/1.0)', accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
      const brutos = lerPaginaDeCupons(await r.text(), loja);
      if (!brutos) throw new Error('a página mudou de formato e não consegui ler os cupons');
      const { cupons } = filtrarCuponsConfiaveis(brutos, agora, opcoes);
      resultado.cupons.push(...cupons);
    } catch (e) {
      resultado.avisos.push(`Garimpo de cupons (${loja === 'mercadolivre' ? 'Mercado Livre' : 'Shopee'}): ${(e as Error).message}`);
    }
  }
  return resultado;
}
