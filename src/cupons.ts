import { escaparHtml } from './mensagem.ts';
import { diaDe } from './db.ts';

/** Um cupom cadastrado por você no arquivo cupons.json. */
export interface Cupom {
  loja: 'mercadolivre' | 'shopee';
  /** Código para digitar no carrinho. Vazio quando o cupom é só ativar na página (cupom de "clique para ativar"). */
  codigo?: string;
  /** Resumo curto: "R$ 30 OFF em compras acima de R$ 200". */
  titulo: string;
  /** Regras: categorias, primeira compra, limite de uso. */
  detalhe?: string;
  /** Seu link de afiliado para a página do cupom ou da loja. */
  link: string;
  /** Último dia de validade, AAAA-MM-DD (vale até o fim desse dia, no horário de Brasília). */
  validoAte?: string;
}

const NOME_DA_LOJA: Record<Cupom['loja'], string> = { mercadolivre: 'Mercado Livre', shopee: 'Shopee' };

/** Endereços aceitos por loja. Evita link errado ou de outra loja no canal. */
const SITES: Record<Cupom['loja'], RegExp> = {
  mercadolivre: /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|meli\.la)$/i,
  shopee: /(^|\.)(shopee\.com\.br|shp\.ee)$/i,
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface CuponsLidos {
  cupons: Cupom[];
  /** Problemas encontrados, um por linha, para o resumo da rodada. Cupom com problema é ignorado. */
  avisos: string[];
}

/** Lê e valida o texto do cupons.json. Nunca lança: erro de formato vira aviso. */
export function lerCupons(texto: string): CuponsLidos {
  const resultado: CuponsLidos = { cupons: [], avisos: [] };
  if (!texto.trim()) return resultado;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (e) {
    resultado.avisos.push(`cupons.json não é um JSON válido (${(e as Error).message}).`);
    return resultado;
  }
  if (!Array.isArray(bruto)) {
    resultado.avisos.push('cupons.json precisa ser uma lista: [ { ... }, { ... } ].');
    return resultado;
  }
  bruto.forEach((item: any, i) => {
    const nome = `cupom ${i + 1}`;
    const loja = String(item?.loja ?? '').trim().toLowerCase();
    if (loja !== 'mercadolivre' && loja !== 'shopee') return void resultado.avisos.push(`${nome}: "loja" precisa ser "mercadolivre" ou "shopee".`);
    const titulo = String(item?.titulo ?? '').replace(/\s+/g, ' ').trim();
    if (!titulo) return void resultado.avisos.push(`${nome}: falta o "titulo".`);
    let host = '';
    try {
      const url = new URL(String(item?.link ?? ''));
      if (url.protocol !== 'https:') throw new Error('sem https');
      host = url.hostname;
    } catch {
      return void resultado.avisos.push(`${nome} (${titulo}): "link" precisa ser um endereço https completo.`);
    }
    if (!SITES[loja].test(host)) return void resultado.avisos.push(`${nome} (${titulo}): o link (${host}) não é do ${NOME_DA_LOJA[loja]}.`);
    const validoAte = item?.validoAte ? String(item.validoAte).trim() : undefined;
    if (validoAte && (!DATA.test(validoAte) || Number.isNaN(Date.parse(`${validoAte}T12:00:00Z`)))) {
      return void resultado.avisos.push(`${nome} (${titulo}): "validoAte" precisa ser uma data AAAA-MM-DD.`);
    }
    const codigo = String(item?.codigo ?? '').trim();
    const detalhe = String(item?.detalhe ?? '').replace(/\s+/g, ' ').trim();
    resultado.cupons.push({ loja, titulo, link: String(item.link).trim(), ...(codigo ? { codigo } : {}), ...(detalhe ? { detalhe } : {}), ...(validoAte ? { validoAte } : {}) });
  });
  return resultado;
}

/** Cupom sem data vale sempre; com data, vale até o fim desse dia em Brasília. */
export function cupomVigente(c: Cupom, agora: Date): boolean {
  return !c.validoAte || diaDe(agora) <= c.validoAte;
}

/** Identifica o cupom no histórico: loja, código e título. Mudar o título ou o código conta como cupom novo. */
export function chaveDoCupom(c: Cupom): string {
  return `${c.loja}|${(c.codigo ?? '').toUpperCase()}|${c.titulo.toLowerCase()}`;
}

function dataBr(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

/** Dias inteiros até o fim da validade (0 = vence hoje). */
export function diasParaVencer(c: Cupom, agora: Date): number | undefined {
  if (!c.validoAte) return undefined;
  return Math.round((Date.parse(`${c.validoAte}T12:00:00Z`) - Date.parse(`${diaDe(agora)}T12:00:00Z`)) / 86_400_000);
}

/** Texto do post (HTML do Telegram). */
export function montarMensagemCupom(c: Cupom, agora: Date = new Date()): string {
  const linhas: string[] = [];
  linhas.push(`🎟️ <b>CUPOM ${NOME_DA_LOJA[c.loja].toUpperCase()}</b>`);
  linhas.push('');
  linhas.push(`💥 <b>${escaparHtml(c.titulo)}</b>`);
  if (c.codigo) linhas.push(`🔑 Código: <code>${escaparHtml(c.codigo)}</code>`);
  else linhas.push('🔑 Sem código: é só ativar o cupom na página.');
  if (c.detalhe) linhas.push(`📌 ${escaparHtml(c.detalhe)}`);
  if (c.validoAte) {
    const dias = diasParaVencer(c, agora);
    linhas.push(dias === 0 ? '⏰ <b>Vence hoje!</b>' : `⏰ Válido até ${dataBr(c.validoAte)}`);
  }
  linhas.push('');
  linhas.push(`👉 ${escaparHtml(c.link)}`);
  linhas.push('');
  linhas.push('<i>Cupom sujeito a regras e a disponibilidade da loja.</i>');
  return linhas.join('\n');
}

/**
 * Escolhe o próximo cupom a postar: só os vigentes; nunca postado primeiro; depois os que já
 * passaram o intervalo de repetição, o que vence antes ganhando.
 */
export function escolherCupom(cupons: Cupom[], ultimoPost: (chave: string) => number | undefined, repetirDias: number, agora: Date): Cupom | undefined {
  const t = agora.getTime();
  const candidatos = cupons
    .filter((c) => cupomVigente(c, agora))
    .map((c) => ({ c, ultimo: ultimoPost(chaveDoCupom(c)) }))
    .filter(({ ultimo }) => ultimo === undefined || t - ultimo >= repetirDias * 86_400_000);
  candidatos.sort((a, b) => {
    if ((a.ultimo === undefined) !== (b.ultimo === undefined)) return a.ultimo === undefined ? -1 : 1;
    return (diasParaVencer(a.c, agora) ?? 9999) - (diasParaVencer(b.c, agora) ?? 9999);
  });
  return candidatos[0]?.c;
}
