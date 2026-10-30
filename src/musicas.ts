import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * As músicas dos Reels: faixas instrumentais de 30 segundos geradas no Fenaky (pasta musicas/), de estilos leves (pop, house, funk) para
 * não cansar. Cada Reel usa uma, em rodízio (uma por Reel do dia, sem repetir em seguida). Sem nenhuma faixa na pasta, o robô usa a trilha
 * sintetizada por código (src/musica.ts), como antes.
 */
export const PASTA_DAS_MUSICAS = 'musicas';

/** Os arquivos de música disponíveis, em ordem estável. */
export function musicasDisponiveis(raiz = process.cwd()): string[] {
  const pasta = join(raiz, PASTA_DAS_MUSICAS);
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((n) => /\.(mp3|wav|m4a)$/i.test(n)).sort();
}

/** Número estável do Reel: o mesmo Reel sempre usa a mesma faixa, e Reels em sequência (inclusive os do mesmo dia) giram entre elas. */
export function posicaoDaMusica(chave: string, total: number): number {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:-(\d+))?/.exec(chave);
  if (!m) {
    let h = 0;
    for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % total;
  }
  const dia = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
  const ordem = m[4] ? Number(m[4]) - 1 : 0;
  return (dia * 3 + ordem) % total;
}

/**
 * Escolhe a música do Reel e copia para a pasta public/ do Remotion (de onde ele lê). Devolve o nome do arquivo lá, ou undefined se não há
 * música (aí vale a trilha sintetizada).
 */
export function prepararMusica(chave: string, pastaDoRemotion: string, raiz = process.cwd()): string | undefined {
  const lista = musicasDisponiveis(raiz);
  if (!lista.length) return undefined;
  const arquivo = lista[posicaoDaMusica(chave, lista.length)]!;
  const destino = `musica-${arquivo}`;
  copyFileSync(join(raiz, PASTA_DAS_MUSICAS, arquivo), join(pastaDoRemotion, 'public', destino));
  return destino;
}
