import { CATEGORIAS } from './categoria.ts';
import type { Config } from './config.ts';

/** O canal geral aceita este nicho? GERAL_NICHOS (vazio = todos) menos GERAL_SEM_NICHOS. */
export function geralAceita(categoria: string, config: Config): boolean {
  const { geralNichos, geralSem } = config.rotas;
  if (geralSem.includes(categoria)) return false;
  return geralNichos.length === 0 || geralNichos.includes(categoria);
}

/**
 * Para onde vai uma oferta no Telegram: o canal do nicho dela, se houver rota; senão o canal geral,
 * se o filtro do geral aceitar o nicho. Com ROTAS_TAMBEM_NO_GERAL=1 a oferta de um nicho com rota também
 * sai no geral (se o filtro aceitar). Lista vazia = a oferta não vai para canal nenhum.
 * O primeiro da lista é o destino principal (é o que fica registrado no histórico).
 */
export function destinosDaOferta(categoria: string, config: Config): string[] {
  const geral = config.telegram.chatId;
  const noGeral = geralAceita(categoria, config);
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
