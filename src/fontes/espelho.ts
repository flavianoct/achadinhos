import type { Fonte, Oferta } from '../types.ts';
import { expandirLink, idDoProdutoML, limparLinkML, mesmoProduto, produtoDaVitrineML, type Afiliados } from './promobit.ts';
import { linkAfiliadoML } from './mercadolivre.ts';

type Fetch = typeof fetch;

/**
 * Espelho de grupos de WhatsApp (ideia do modo "Espelho" do pega-oferta). O enviador na VPS escuta os grupos de ofertas em que o
 * número já está e publica na branch "espelho" (espelho.json) as mensagens com UM produto do ML e preço claro. Aqui o robô lê esse
 * arquivo, descobre qual é o produto (o link do concorrente leva à vitrine de afiliado dele; só lemos qual produto é) e monta o
 * link limpo com o SEU código. O link do concorrente nunca é postado. Só Mercado Livre; a Amazon segue fora.
 */

const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const CABECALHOS = { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9' };
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Um item como o enviador o publica. */
export interface ItemEspelho {
  id: string;
  criadoEm: number;
  grupo?: string;
  titulo: string;
  preco: number;
  precoOriginal?: number;
  link: string;
  /** Endereço da foto (raw.githubusercontent.com), quando a mensagem tinha foto. */
  imagem?: string;
}

/** Valida o JSON do espelho: ignora item com campo faltando em vez de derrubar a coleta. */
export function lerEspelho(json: unknown): ItemEspelho[] {
  const lista = (json as { itens?: unknown[] } | undefined)?.itens;
  if (!Array.isArray(lista)) return [];
  const itens: ItemEspelho[] = [];
  for (const i of lista as Array<Record<string, unknown>>) {
    if (!i || typeof i.id !== 'string' || typeof i.titulo !== 'string' || typeof i.link !== 'string') continue;
    const preco = Number(i.preco);
    const criadoEm = Number(i.criadoEm);
    if (!Number.isFinite(preco) || preco <= 0 || !Number.isFinite(criadoEm)) continue;
    const antigo = Number(i.precoOriginal);
    itens.push({
      id: i.id,
      criadoEm,
      titulo: i.titulo,
      preco,
      precoOriginal: Number.isFinite(antigo) && antigo > preco ? antigo : undefined,
      link: i.link,
      imagem: typeof i.imagem === 'string' && i.imagem.startsWith('https://') ? i.imagem : undefined,
    });
  }
  return itens;
}

/**
 * Monta a Oferta do robô. `linkDoProduto` é o endereço do produto no ML (já descoberto); `precoNaLoja`, o preço da vitrine do ML,
 * que vale mais que o da mensagem do grupo. Se os dois preços diferem demais, a mensagem estava velha ou errada: descarta.
 */
export function converterItemEspelho(item: ItemEspelho, linkDoProduto: string, afiliados: Afiliados, precoNaLoja?: number): Oferta | undefined {
  if (!afiliados.mercadolivre) return undefined;
  const idProduto = idDoProdutoML(linkDoProduto);
  if (!idProduto) return undefined;
  const preco = Math.round((precoNaLoja ?? item.preco) * 100) / 100;
  if (precoNaLoja && Math.abs(precoNaLoja - item.preco) / precoNaLoja > 0.3) return undefined;
  const precoOriginal = item.precoOriginal && item.precoOriginal > preco ? item.precoOriginal : undefined;
  return {
    loja: 'mercadolivre',
    idProduto,
    titulo: item.titulo.replace(/\s+/g, ' ').trim(),
    preco,
    precoOriginal,
    desconto: precoOriginal ? Math.round((1 - preco / precoOriginal) * 100) : undefined,
    imagem: item.imagem,
    link: linkAfiliadoML(limparLinkML(linkDoProduto), afiliados.mercadolivre.mattWord, afiliados.mercadolivre.mattTool),
    nomeLoja: 'Mercado Livre',
  };
}

export interface OpcoesEspelho {
  /** Endereço do espelho.json (raw.githubusercontent.com/DONO/REPO/espelho/espelho.json). */
  url: string;
  afiliados: Afiliados;
  maximo?: number;
  idadeMaximaMin?: number;
  intervaloMs?: number;
  agora?: number;
}

export interface ColetaEspelho {
  ofertas: Oferta[];
  lidos: number;
  semProduto: number;
  erro?: string;
  conferencia: Array<{ mensagem: string; ml?: string; link?: string }>;
}

export async function coletarEspelho(opcoes: OpcoesEspelho, fetchFn: Fetch = fetch): Promise<ColetaEspelho> {
  const r: ColetaEspelho = { ofertas: [], lidos: 0, semProduto: 0, conferencia: [] };
  if (!opcoes.afiliados.mercadolivre?.mattWord || !opcoes.afiliados.mercadolivre.mattTool) {
    r.erro = 'sem ML_MATT_WORD/ML_MATT_TOOL para montar o link';
    return r;
  }
  let itens: ItemEspelho[];
  try {
    const resp = await fetchFn(`${opcoes.url}?t=${Date.now()}`, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } });
    if (resp.status === 404) {
      r.erro = 'o espelho ainda não publicou nada (branch espelho não existe)';
      return r;
    }
    if (!resp.ok) throw new Error(`o GitHub respondeu ${resp.status}`);
    itens = lerEspelho(await resp.json());
  } catch (e) {
    r.erro = (e as Error).message;
    return r;
  }
  const agora = opcoes.agora ?? Date.now();
  const idade = (opcoes.idadeMaximaMin ?? 180) * 60_000;
  const recentes = itens.filter((i) => agora - i.criadoEm <= idade).sort((a, b) => b.criadoEm - a.criadoEm).slice(0, Math.max(0, opcoes.maximo ?? 15));
  r.lidos = recentes.length;
  const intervalo = opcoes.intervaloMs ?? 1500;
  const vistos = new Set<string>();
  let n = 0;
  for (const item of recentes) {
    if (n++) await pausa(intervalo);
    let produto: string | undefined;
    let precoNaLoja: number | undefined;
    let tituloML: string | undefined;
    try {
      const final = await expandirLink(item.link, fetchFn);
      produto = final;
      // O link de quem divulgou leva à vitrine dele (/social/...): lê qual é o produto em destaque e o preço atual.
      if (final && new URL(final).pathname.startsWith('/social/')) {
        const v = await fetchFn(final, { headers: CABECALHOS, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
        const p = v.ok ? produtoDaVitrineML(await v.text(), item.titulo) : undefined;
        produto = p && mesmoProduto(item.titulo, p.titulo) ? p.url : undefined;
        precoNaLoja = p?.preco;
        tituloML = p?.titulo;
      }
    } catch {
      produto = undefined;
    }
    const oferta = produto ? converterItemEspelho(item, produto, opcoes.afiliados, precoNaLoja) : undefined;
    r.conferencia.push({ mensagem: item.titulo, ml: tituloML, link: oferta?.link });
    if (!oferta) {
      r.semProduto++;
      continue;
    }
    const chave = oferta.idProduto;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    r.ofertas.push(oferta);
  }
  if (!r.ofertas.length) r.erro = r.lidos ? `li ${r.lidos} itens do espelho, mas nenhum produto foi identificado` : 'nenhum item novo no espelho';
  return r;
}

/** A fonte "espelho": liga com ESPELHO_ATIVO (independe de ML_ATIVO). */
export class FonteEspelho implements Fonte {
  nome = 'espelho' as const;
  private opcoes: OpcoesEspelho;
  private fetchFn: Fetch;
  private aviso?: string;

  constructor(opcoes: OpcoesEspelho, fetchFn: Fetch = fetch) {
    this.opcoes = opcoes;
    this.fetchFn = fetchFn;
  }

  avisoDaColeta(): string | undefined {
    return this.aviso;
  }

  async coletar(): Promise<Oferta[]> {
    this.aviso = undefined;
    const r = await coletarEspelho(this.opcoes, this.fetchFn);
    console.log(`[espelho] ${r.lidos} itens recentes, ${r.ofertas.length} com link de afiliado, ${r.semProduto} sem produto identificado.`);
    // Sem item novo não é falha: o grupo pode estar quieto. Só erro de verdade derruba a coleta.
    if (!r.ofertas.length && r.erro && !/nenhum item novo/.test(r.erro)) throw new Error(r.erro);
    return r.ofertas;
  }
}
