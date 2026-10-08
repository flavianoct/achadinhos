import type { Config } from './config.ts';

/**
 * Para onde vai uma oferta no Telegram: o canal do nicho dela, se houver rota; senão o canal geral.
 * Com ROTAS_TAMBEM_NO_GERAL=1 a oferta de um nicho com rota também sai no canal geral.
 * O primeiro da lista é o destino principal (é o que fica registrado no histórico).
 */
export function destinosDaOferta(categoria: string, config: Config): string[] {
  const geral = config.telegram.chatId;
  const rota = config.rotas.porCategoria[categoria];
  if (!rota || rota === geral) return [geral];
  return config.rotas.tambemNoGeral ? [rota, geral] : [rota];
}
