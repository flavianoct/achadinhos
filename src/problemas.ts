import { normalizar } from './categoria.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * Vender a solução, não o produto: "Lençol que solta do colchão?" para o dedo; "Jogo de lençol 400 fios", não. Cada par problema → solução
 * só vale quando o TÍTULO do anúncio comprova a solução (o lençol só leva "solta do colchão?" se o título diz "elástico"): o robô nunca
 * promete o que o produto não diz que faz. Nada de saúde, emagrecimento ou resultado garantido.
 *
 * `produto` e `prova` são testados no título normalizado (minúsculo, sem acento). As linhas vão para o gancho do Reel (2 linhas curtas);
 * a resposta completa a legenda ("Lençol que solta do colchão? Esse tem elástico pra ficar no lugar.").
 */
export interface ParDeProblema {
  produto: RegExp;
  prova: RegExp;
  linhas: [string, string];
  resposta: string;
}

export const PROBLEMAS: ParDeProblema[] = [
  // Casa
  { produto: /\blencol\b|\blencois\b/, prova: /elastico/, linhas: ['LENÇOL QUE SOLTA', 'DO COLCHÃO?'], resposta: 'Esse tem elástico pra ficar no lugar.' },
  { produto: /protetor de colchao|capa de colchao/, prova: /impermeavel/, linhas: ['MEDO DE MANCHAR', 'O COLCHÃO?'], resposta: 'Esse protetor é impermeável.' },
  { produto: /cortina/, prova: /blackout/, linhas: ['CLARIDADE NÃO', 'TE DEIXA DORMIR?'], resposta: 'Cortina blackout segura a luz de fora.' },
  { produto: /tapete/, prova: /antiderrapante/, linhas: ['TAPETE QUE', 'ESCORREGA?'], resposta: 'Esse é antiderrapante.' },
  { produto: /garrafa|copo|caneca/, prova: /termic/, linhas: ['BEBIDA QUE', 'ESQUENTA RÁPIDO?'], resposta: 'Essa é térmica.' },
  { produto: /\bpotes?\b/, prova: /hermetic/, linhas: ['COMIDA ABERTA', 'MURCHANDO?'], resposta: 'Pote hermético: fecha e veda.' },
  { produto: /aspirador/, prova: /sem fio/, linhas: ['FIO ATRAPALHANDO', 'NA LIMPEZA?'], resposta: 'Esse aspirador é sem fio.' },
  { produto: /cabide/, prova: /veludo|antideslizante/, linhas: ['ROUPA CAINDO', 'DO CABIDE?'], resposta: 'Esse cabide é antideslizante.' },
  { produto: /air ?fryer|fritadeira/, prova: /sem oleo/, linhas: ['QUER FRITAR', 'SEM ÓLEO?'], resposta: 'Essa air fryer frita sem óleo.' },
  { produto: /organizador|organizadora/, prova: /gaveta|armario|geladeira|closet/, linhas: ['GAVETA', 'BAGUNÇADA?'], resposta: 'Esse organizador separa tudo.' },
  // Tecnologia
  { produto: /\bfones?\b|headphone|earbud/, prova: /cancelamento de ruido|\banc\b/, linhas: ['BARULHO TE', 'TIRA O FOCO?'], resposta: 'Esse fone tem cancelamento de ruído.' },
  { produto: /\bfones?\b|earbud/, prova: /prova d.?agua|a prova de agua|\bipx\d/, linhas: ['FONE QUE ESTRAGA', 'NO SUOR?'], resposta: 'Esse é resistente à água.' },
  { produto: /power ?bank|carregador portatil|bateria externa/, prova: /power ?bank|portatil|externa/, linhas: ['CELULAR MORRE', 'NA RUA?'], resposta: 'Carregador portátil pra levar na bolsa.' },
  { produto: /carregador/, prova: /turbo|rapido|fast|\d{2,3} ?w\b/, linhas: ['CELULAR DEMORA', 'PRA CARREGAR?'], resposta: 'Esse é carregador rápido.' },
  // "Cabo de aço" é de mochila e de ferramenta, não cabo de celular.
  { produto: /\bcabo\b(?! de aco)/, prova: /reforcad|nylon|tranca/, linhas: ['CABO QUE', 'QUEBRA TODO MÊS?'], resposta: 'Esse cabo é reforçado.' },
  { produto: /suporte/, prova: /celular/, linhas: ['CANSOU DE', 'SEGURAR O CELULAR?'], resposta: 'Esse suporte segura pra você.' },
  { produto: /camera/, prova: /wi-?fi|wifi/, linhas: ['QUER VER A CASA', 'DE LONGE?'], resposta: 'Câmera wi-fi: você vê pelo celular.' },
  { produto: /\bmouse\b/, prova: /sem fio|wireless/, linhas: ['FIO DO MOUSE', 'ATRAPALHA?'], resposta: 'Esse mouse é sem fio.' },
  // Games
  { produto: /controle|joystick/, prova: /sem fio|wireless|bluetooth/, linhas: ['FIO DO CONTROLE', 'ATRAPALHA?'], resposta: 'Esse controle é sem fio.' },
  { produto: /headset/, prova: /microfone/, linhas: ['NINGUÉM TE OUVE', 'NA PARTIDA?'], resposta: 'Headset com microfone.' },
  { produto: /mouse ?pad/, prova: /grande|extra|xxl|\bxl\b|90 ?x|80 ?x/, linhas: ['MOUSE SAINDO', 'DO MOUSEPAD?'], resposta: 'Esse mousepad é grandão.' },
  // Moda
  { produto: /\bcalcas?\b/, prova: /cintura alta/, linhas: ['CALÇA QUE FICA', 'DESCENDO?'], resposta: 'Essa é de cintura alta.' },
  { produto: /legging/, prova: /nao fica transparente|nao transparece|sem transparencia/, linhas: ['LEGGING QUE FICA', 'TRANSPARENTE?'], resposta: 'Essa não transparece.' },
  { produto: /vestido|saia/, prova: /com bolso|bolsos/, linhas: ['VESTIDO', 'SEM BOLSO?'], resposta: 'Esse tem bolso.' },
  { produto: /vestido|blusa|camisa|conjunto/, prova: /nao amassa|nao amarrota/, linhas: ['ROUPA QUE', 'AMASSA TODA?'], resposta: 'Esse tecido não amassa.' },
  { produto: /sutia/, prova: /sem aro/, linhas: ['SUTIÃ COM ARO', 'INCOMODA?'], resposta: 'Esse é sem aro.' },
  { produto: /bolsa|mochila/, prova: /impermeavel|prova d.?agua/, linhas: ['MEDO DE MOLHAR', 'NA CHUVA?'], resposta: 'Essa é impermeável.' },
];

/** Assuntos em que o robô nunca usa problema → solução (promessa de saúde ou de corpo). */
const PROIBIDOS = /emagrec|modelador|cinta|queima|detox|dor\b|dores|postura|celulite|estria|calvicie|queda de cabelo|remedio|suplemento/;

export interface ProblemaDoProduto {
  /** As 2 linhas do gancho do Reel. */
  linhas: [string, string];
  /** A pergunta em frase ("Lençol que solta do colchão?"). */
  pergunta: string;
  /** A resposta ("Esse tem elástico pra ficar no lugar."). */
  resposta: string;
}

/** O par problema → solução que o título do produto comprova, ou undefined (aí o post usa os ganchos de sempre). */
export function problemaDoProduto(o: Pick<OfertaAvaliada, 'titulo'>): ProblemaDoProduto | undefined {
  const t = normalizar(o.titulo);
  if (PROIBIDOS.test(t)) return undefined;
  const par = PROBLEMAS.find((p) => p.produto.test(t) && p.prova.test(t));
  if (!par) return undefined;
  const frase = par.linhas.join(' ').toLowerCase();
  return { linhas: par.linhas, pergunta: frase.charAt(0).toUpperCase() + frase.slice(1), resposta: par.resposta };
}
