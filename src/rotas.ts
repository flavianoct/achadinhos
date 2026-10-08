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
