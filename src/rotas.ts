import { CATEGORIAS } from './categoria.ts';
import type { Config } from './config.ts';

/** O canal geral aceita este nicho? GERAL_NICHOS (vazio = todos) menos GERAL_SEM_NICHOS. */
export function geralAceita(categoria: string, config: Config): boolean {
  const { geralNichos, geralSem } = config.rotas;
  if (geralSem.includes(categoria)) return false;
  return geralNichos.length === 0 || geralNichos.includes(categoria);
}

/** Quantos anúncios por dia o canal geral aceita deste nicho (GERAL_LIMITES). 0 = sem limite; só vale para nicho com canal ou grupo próprio. */
export function limiteNoGeral(categoria: string, config: Config): number {
  return nichoTemDestinoProprio(categoria, config) ? (config.rotas.geralLimites[categoria] ?? 0) : 0;
}

/**
 * Quantos anúncios do nicho o geral já pode ter recebido a esta hora: a cota do dia cresce ao longo do dia (como a meta dos mínimos),
 * para os anúncios do nicho aparecerem no geral espalhados e não todos de manhã.
 */
export function cotaDoGeralAgora(limite: number, config: Config, hora: number): number {
  const { horaInicio, horaFim } = config.ritmo;
  const total = Math.max(1, horaFim - horaInicio);
  const passou = Math.min(total, Math.max(1, hora - horaInicio + 1));
  return Math.ceil((limite * passou) / total);
}

/**
 * Para onde vai uma oferta no Telegram: o canal do nicho dela, se houver rota; senão o canal geral,
 * se o filtro do geral aceitar o nicho. Com ROTAS_TAMBEM_NO_GERAL=1 a oferta de um nicho com rota também
 * sai no geral (se o filtro aceitar). Com `geralCheio` (o nicho já usou a cota de hoje no geral) ela vai só para o canal do nicho.
 * Lista vazia = a oferta não vai para canal nenhum.
 * O primeiro da lista é o destino principal (é o que fica registrado no histórico).
 */
export function destinosDaOferta(categoria: string, config: Config, geralCheio = false): string[] {
  const geral = config.telegram.chatId;
  const noGeral = geralAceita(categoria, config) && !geralCheio;
  const rota = config.rotas.porCategoria[categoria];
  if (!rota || rota === geral) return noGeral ? [geral] : [];
  return config.rotas.tambemNoGeral && noGeral ? [rota, geral] : [rota];
}

/** Limite do dia para o nicho: o próprio (NICHO_LIMITES) ou o de todos (NICHO_MAX_POR_DIA). 0 = sem limite. */
export function limiteDoNicho(categoria: string, config: Config): number {
  return config.rotas.limites[categoria] ?? config.rotas.limitePorDia;
}

/** Nichos que já postaram o limite de hoje. */
export function nichosNoLimite(postsHoje: Array<{ categoria: string; posts: number }>, config: Config): string[] {
  return postsHoje.filter((c) => {
    const limite = limiteDoNicho(c.categoria, config);
    return limite > 0 && c.posts >= limite;
  }).map((c) => c.categoria);
}

/** Algum grupo ou canal de WhatsApp é só deste nicho (WHATSAPP_ROTAS)? */
export function temWhatsappDoNicho(categoria: string, config: Config): boolean {
  return config.whatsapp.ativo && config.whatsapp.rotas.some((r) => r.nicho === categoria);
}

/** O nicho tem canal do Telegram ou grupo/canal de WhatsApp só dele? */
export function nichoTemDestinoProprio(categoria: string, config: Config): boolean {
  return Boolean(config.rotas.porCategoria[categoria]) || temWhatsappDoNicho(categoria, config);
}

/** Pontuação mínima para a oferta do nicho entrar na fila: a do nicho (NICHO_PONTOS_MINIMOS) ou a de todos (PONTOS_MINIMOS). */
export function pontosMinimosDoNicho(categoria: string, config: Config): number {
  return config.filtro.pontosPorNicho[categoria] ?? config.filtro.pontosMinimos;
}

/** Mínimo de posts por dia do nicho: o definido (NICHO_MINIMOS) ou, se tem destino próprio, o padrão (NICHO_MINIMO_PADRAO). */
export function minimoDoNicho(categoria: string, config: Config): number {
  return config.rotas.minimos[categoria] ?? (nichoTemDestinoProprio(categoria, config) ? config.rotas.minimoPadrao : 0);
}

/**
 * Nichos abaixo da meta de agora, do mais atrasado ao menos atrasado. A meta cresce ao longo do dia (o mínimo é distribuído entre
 * horaInicio e horaFim), para o nicho não gastar o mínimo todo de manhã nem ficar o dia sem postar.
 */
export function nichosAbaixoDaMeta(postsHoje: Array<{ categoria: string; posts: number }>, config: Config, hora: number): string[] {
  const { horaInicio, horaFim } = config.ritmo;
  const total = Math.max(1, horaFim - horaInicio);
  const passou = Math.min(total, Math.max(1, hora - horaInicio + 1));
  const feitos = new Map(postsHoje.map((p) => [p.categoria, p.posts]));
  return CATEGORIAS.map((categoria) => ({ categoria, falta: Math.ceil((minimoDoNicho(categoria, config) * passou) / total) - (feitos.get(categoria) ?? 0), minimo: minimoDoNicho(categoria, config) }))
    .filter((n) => n.minimo > 0 && n.falta > 0)
    .sort((a, b) => b.falta - a.falta)
    .map((n) => n.categoria);
}

/** Quantos posts recentes entram na conta da proporção entre as lojas. */
const POSTS_NA_PROPORCAO = 20;

/**
 * Qual loja evitar no próximo post. Sem LOJA_PROPORCAO, a da última oferta postada (as lojas se alternam). Com a proporção, a loja
 * que está acima da sua fatia nos últimos posts: assim o Mercado Livre (maior comissão) puxa a maior parte e a Shopee entra com a dela.
 */
export function lojaParaEvitar(recentes: string[], ultima: string | undefined, config: Config): string | undefined {
  const alvo = config.ritmo.proporcaoDasLojas;
  const lojas = Object.keys(alvo);
  if (lojas.length < 2 || !recentes.length) return ultima;
  const janela = recentes.slice(0, POSTS_NA_PROPORCAO);
  const soma = lojas.reduce((t, l) => t + alvo[l]!, 0);
  const excesso = lojas.map((l) => ({ l, dif: janela.filter((x) => x === l).length / janela.length - alvo[l]! / soma }));
  excesso.sort((a, b) => b.dif - a.dif);
  return excesso[0]!.dif > 0 ? excesso[0]!.l : excesso[excesso.length - 1]!.l === ultima ? undefined : ultima;
}
