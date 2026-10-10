/**
 * Calendário de datas especiais do varejo (10.10, 11.11, Black Friday, Dia das Mães...). O robô sabe todas sozinho, calcula as que mudam de
 * dia a cada ano (Páscoa, Dia das Mães, Black Friday...) e, em cada uma:
 *  - avisa o DONO no painel alguns dias antes (para colar o link da campanha e os cupons);
 *  - posta no Telegram um aviso na véspera, outro quando a data começa e outro nas últimas horas.
 * Os posts só trazem links que abrem de verdade: a página de ofertas do Mercado Livre com o seu código de afiliado e, para a Shopee, só
 * o link que o dono colocar em datas.json (um link gerado às cegas já mostrou "oferta expirada").
 */

export interface Campanha {
  /** Único por data e ano ("dupla-10-2026"). */
  id: string;
  nome: string;
  emoji: string;
  /** Primeiro e último dia, AAAA-MM-DD. */
  inicio: string;
  fim: string;
  /** Links do dono para esta data (opcionais). */
  mercadolivre?: string;
  shopee?: string;
}

export type FaseDaData = 'teaser' | 'comecou' | 'ultimas';

const dia = (d: Date) => d.toISOString().slice(0, 10);
const utc = (ano: number, mes: number, diaDoMes: number) => new Date(Date.UTC(ano, mes - 1, diaDoMes));
const somar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

/** O n-ésimo dia da semana (0 = domingo) de um mês. */
function enesimoDiaDaSemana(ano: number, mes: number, diaDaSemana: number, n: number): Date {
  const primeiro = utc(ano, mes, 1);
  const deslocamento = (diaDaSemana - primeiro.getUTCDay() + 7) % 7;
  return somar(primeiro, deslocamento + (n - 1) * 7);
}

/** Domingo de Páscoa (algoritmo gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes, diaDoMes);
}

/** Todas as datas de um ano. As de presente duram a semana que termina no dia; as demais, o próprio dia. */
export function campanhasDoAno(ano: number): Campanha[] {
  const lista: Campanha[] = [];
  const um = (id: string, nome: string, emoji: string, d: Date) => lista.push({ id: `${id}-${ano}`, nome, emoji, inicio: dia(d), fim: dia(d) });
  const semana = (id: string, nome: string, emoji: string, ate: Date) => lista.push({ id: `${id}-${ano}`, nome, emoji, inicio: dia(somar(ate, -6)), fim: dia(ate) });

  // Datas duplas (1.1 a 12.12): a Shopee faz campanha em todas, e o Mercado Livre nas maiores.
  for (let m = 1; m <= 12; m++) um(`dupla-${m}`, `${m}.${m}`, m >= 10 ? '🔥' : '🛍️', utc(ano, m, m));
  um('mulher', 'Dia da Mulher', '🌷', utc(ano, 3, 8));
  um('consumidor', 'Dia do Consumidor', '🛒', utc(ano, 3, 15));
  semana('pascoa', 'Semana da Páscoa', '🐰', pascoa(ano));
  semana('maes', 'Semana do Dia das Mães', '💐', enesimoDiaDaSemana(ano, 5, 0, 2));
  semana('namorados', 'Semana do Dia dos Namorados', '💘', utc(ano, 6, 12));
  semana('pais', 'Semana do Dia dos Pais', '👔', enesimoDiaDaSemana(ano, 8, 0, 2));
  um('cliente', 'Dia do Cliente', '🛒', utc(ano, 9, 15));
  semana('criancas', 'Semana do Dia das Crianças', '🧸', utc(ano, 10, 12));
  // Black Friday: a sexta depois do Dia de Ação de Graças (4ª quinta de novembro); a campanha vai até a Cyber Monday.
  const sextaNegra = somar(enesimoDiaDaSemana(ano, 11, 4, 4), 1);
  lista.push({ id: `blackfriday-${ano}`, nome: 'Black Friday e Cyber Monday', emoji: '🖤', inicio: dia(sextaNegra), fim: dia(somar(sextaNegra, 3)) });
  semana('natal', 'Semana do Natal', '🎄', utc(ano, 12, 25));
  return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Dias inteiros de `de` até `ate` (AAAA-MM-DD). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

// ───────────────────────── datas.json do dono ─────────────────────────

/** Uma data do dono: ajusta (se o início coincide com uma data do calendário) ou acrescenta uma campanha. */
export interface DataDoDono {
  nome?: string;
  emoji?: string;
  inicio: string;
  fim?: string;
  mercadolivre?: string;
  shopee?: string;
}

const SITES = {
  mercadolivre: /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|meli\.la)$/i,
  shopee: /(^|\.)(shopee\.com\.br|shp\.ee)$/i,
};
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function linkValido(valor: unknown, loja: 'mercadolivre' | 'shopee'): string | undefined | null {
  if (valor === undefined || valor === null || String(valor).trim() === '') return undefined;
  try {
    const url = new URL(String(valor).trim());
    return url.protocol === 'https:' && SITES[loja].test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Lê o datas.json. Nunca lança: erro vira aviso e a data com problema é ignorada. */
export function lerDatas(texto: string): { datas: DataDoDono[]; avisos: string[] } {
  const r: { datas: DataDoDono[]; avisos: string[] } = { datas: [], avisos: [] };
  if (!texto.trim()) return r;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (e) {
    r.avisos.push(`datas.json não é um JSON válido (${(e as Error).message}).`);
    return r;
  }
  if (!Array.isArray(bruto)) {
    r.avisos.push('datas.json precisa ser uma lista: [ { ... }, { ... } ].');
    return r;
  }
  bruto.forEach((item: any, i) => {
    const nome = `data ${i + 1}`;
    const inicio = String(item?.inicio ?? '').trim();
    if (!DATA.test(inicio) || Number.isNaN(Date.parse(`${inicio}T12:00:00Z`))) return void r.avisos.push(`${nome}: "inicio" precisa ser uma data AAAA-MM-DD.`);
    const fim = item?.fim ? String(item.fim).trim() : undefined;
    if (fim && (!DATA.test(fim) || fim < inicio)) return void r.avisos.push(`${nome} (${inicio}): "fim" precisa ser uma data AAAA-MM-DD igual ou depois do início.`);
    const ml = linkValido(item?.mercadolivre, 'mercadolivre');
    if (ml === null) return void r.avisos.push(`${nome} (${inicio}): "mercadolivre" precisa ser um link https do Mercado Livre.`);
    const sh = linkValido(item?.shopee, 'shopee');
    if (sh === null) return void r.avisos.push(`${nome} (${inicio}): "shopee" precisa ser um link https da Shopee.`);
    const nomeDaData = String(item?.nome ?? '').replace(/\s+/g, ' ').trim();
    const emoji = String(item?.emoji ?? '').trim();
    r.datas.push({ inicio, ...(fim ? { fim } : {}), ...(nomeDaData ? { nome: nomeDaData } : {}), ...(emoji ? { emoji } : {}), ...(ml ? { mercadolivre: ml } : {}), ...(sh ? { shopee: sh } : {}) });
  });
  return r;
}

/** O calendário de três anos (o anterior, o atual e o seguinte, para as viradas), com as datas do dono por cima. */
export function todasAsCampanhas(hoje: string, doDono: DataDoDono[] = []): Campanha[] {
  const ano = Number(hoje.slice(0, 4));
  const lista = [ano - 1, ano, ano + 1].flatMap((a) => campanhasDoAno(a));
  for (const d of doDono) {
    const igual = lista.find((c) => c.inicio === d.inicio);
    if (igual) {
      if (d.nome) igual.nome = d.nome;
      if (d.emoji) igual.emoji = d.emoji;
      if (d.fim) igual.fim = d.fim;
      if (d.mercadolivre) igual.mercadolivre = d.mercadolivre;
      if (d.shopee) igual.shopee = d.shopee;
    } else {
      lista.push({ id: `dono-${d.inicio}`, nome: d.nome ?? 'Data especial', emoji: d.emoji ?? '🎯', inicio: d.inicio, fim: d.fim ?? d.inicio, ...(d.mercadolivre ? { mercadolivre: d.mercadolivre } : {}), ...(d.shopee ? { shopee: d.shopee } : {}) });
    }
  }
  return lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// ───────────────────────── Quando e o que postar ─────────────────────────

/** Hora (Brasília) a partir da qual cada aviso pode sair. */
export const HORA_DO_TEASER = 18;
export const HORA_DA_ABERTURA = 9;
export const HORA_DAS_ULTIMAS = 20;

/** As fases que estão na hora para esta campanha, hoje. A véspera sai à noite; a abertura só no primeiro dia; as últimas horas no último. */
export function fasesDevidas(c: Campanha, hoje: string, hora: number): FaseDaData[] {
  const fases: FaseDaData[] = [];
  if (diasEntre(hoje, c.inicio) === 1 && hora >= HORA_DO_TEASER) fases.push('teaser');
  if (hoje === c.inicio && hora >= HORA_DA_ABERTURA) fases.push('comecou');
  if (hoje === c.fim && hora >= HORA_DAS_ULTIMAS) fases.push('ultimas');
  return fases;
}

/** Chave para não repetir um aviso: um por campanha e fase. */
export const chaveDaFase = (c: Campanha, fase: FaseDaData) => `data:${c.id}:${fase}`;

export interface LinksDaData {
  mercadolivre?: string;
  shopee?: string;
}

/** O texto do aviso (texto simples; nunca preço nem estoque inventado). */
export function textoDaData(c: Campanha, fase: FaseDaData, links: LinksDaData): string {
  const umDia = c.inicio === c.fim;
  const linhas: string[] = [];
  if (fase === 'teaser') {
    linhas.push(`${c.emoji} ${umDia ? `Amanhã é ${c.nome}!` : `${c.nome} começa amanhã!`}`);
    linhas.push('As lojas costumam soltar ofertas e cupons nessa data. Quem está no canal vê tudo primeiro.');
    linhas.push('🔔 Deixe as notificações ligadas por aqui.');
    return linhas.join('\n');
  }
  if (fase === 'comecou') {
    linhas.push(`${c.emoji} ${umDia ? `Hoje é ${c.nome}!` : `Começou: ${c.nome}!`}`);
    linhas.push('Dia de caçar ofertas e cupons nas lojas. Os melhores achados saem aqui no canal, um por um.');
  } else {
    linhas.push(`⏳ Últimas horas de ${c.nome}!`);
    linhas.push('O que vale a pena já saiu aqui no canal: role para cima e confira.');
  }
  const links2: string[] = [];
  if (links.mercadolivre) links2.push(`🛒 Mercado Livre: ${links.mercadolivre}`);
  if (links.shopee) links2.push(`🛍️ Shopee: ${links.shopee}`);
  if (links2.length) linhas.push('', '👇 Confira nas lojas:', ...links2);
  return linhas.join('\n');
}

/** Lembretes para o dono (só no painel): a data está chegando, falta o link ou o cupom. */
export function lembretesDoDono(campanhas: Campanha[], hoje: string, diasDeAviso: number): Array<{ chave: string; texto: string }> {
  if (diasDeAviso <= 0) return [];
  return campanhas
    .map((c) => ({ c, falta: diasEntre(hoje, c.inicio) }))
    .filter(({ falta }) => falta >= 1 && falta <= diasDeAviso)
    .map(({ c, falta }) => ({
      chave: `data:lembrete:${c.id}`,
      texto: `${c.emoji} ${c.nome} ${falta === 1 ? 'começa amanhã' : `começa em ${falta} dias`}. O robô posta o aviso na véspera e o link das lojas no dia. Se você tem o link oficial da campanha (Mercado Livre ou Shopee) ou cupons, coloque em datas.json e cupons.json até lá.`,
    }));
}
