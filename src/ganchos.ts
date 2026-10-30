import { formatarVendas } from './mensagem.ts';
import { posicaoDaMusica } from './musicas.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * Os ganchos de texto dos Reels: a frase grande dos primeiros 1,5 segundo, que faz a pessoa parar e ver até o fim. Cinco formatos giram
 * (um por Reel, sem repetir em seguida) para a gente comparar qual rende mais alcance. Só vale o que os dados provam: nada de preço em
 * reais, "exclusivo" ou "o mais barato".
 */
export type TipoDeFrase = 'pergunta' | 'prova' | 'curiosidade' | 'lista' | 'escolha';

export interface GanchoDeTexto {
  /** O formato, para registrar no log e comparar o alcance depois. */
  tipo: TipoDeFrase;
  /** Até 2 linhas curtas, em maiúsculas. */
  linhas: string[];
}

/** A pergunta de identificação, por nicho ("você também procura isso?"). */
const PERGUNTAS: Record<string, string[]> = {
  moda: ['PROCURANDO UM', 'LOOK ASSIM?'],
  tech: ['AINDA SEM', 'ESSE GADGET?'],
  games: ['SEU SETUP', 'PEDE ISSO?'],
  casa: ['SUA CASA', 'PRECISA DISSO?'],
  beleza: ['VOCÊ JÁ', 'CONHECE ISSO?'],
};
const PERGUNTA_GERAL = ['VOCÊ TAMBÉM', 'PROCURA ISSO?'];

const CURIOSIDADES = [
  ['OLHA O QUE EU', 'ACHEI HOJE'],
  ['SALVA ESSE', 'ACHADO'],
  ['VOCÊ PRECISA', 'VER ISSO'],
];

/** A prova com número, só quando os dados dão base (vendas a partir de mil ou nota 4,5 e acima). */
export function provaDoGancho(o: OfertaAvaliada): string[] | undefined {
  if (o.vendas && o.vendas >= 1000) return [formatarVendas(o.vendas).toUpperCase(), 'VENDIDOS. POR QUÊ?'];
  if (o.nota && o.nota >= 4.5) return [`NOTA ${o.nota.toFixed(1).replace('.', ',')}`, 'NAS AVALIAÇÕES'];
  return undefined;
}

/**
 * Escolhe o gancho do Reel. `itens` é a quantidade de produtos (1 no destaque, 3 nos achados): "lista" e "escolha" só fazem sentido com
 * vários. O formato gira com a chave do Reel (data e ordem), então Reels seguidos usam formatos diferentes.
 */
export function ganchoDoReel(ofertas: OfertaAvaliada[], chave: string): GanchoDeTexto {
  const o = ofertas[0]!;
  const varios = ofertas.length > 1;
  const opcoes: GanchoDeTexto[] = [
    { tipo: 'pergunta', linhas: PERGUNTAS[o.categoria] ?? PERGUNTA_GERAL },
    { tipo: 'curiosidade', linhas: CURIOSIDADES[posicaoDaMusica(`${chave}-c`, CURIOSIDADES.length)]! },
  ];
  const prova = provaDoGancho(o);
  if (prova) opcoes.push({ tipo: 'prova', linhas: prova });
  if (varios) {
    opcoes.push({ tipo: 'lista', linhas: [`${ofertas.length} ACHADOS`, 'DE HOJE'] });
    opcoes.push({ tipo: 'escolha', linhas: ['QUAL VOCÊ', 'LEVARIA?'] });
  }
  return opcoes[posicaoDaMusica(chave, opcoes.length)]!;
}
