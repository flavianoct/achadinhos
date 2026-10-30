/**
 * Tema do dia: num dia marcado, o robô inteiro (coleta, Telegram, WhatsApp e Instagram) foca num assunto, como "dia dos vestidos".
 * Cada tema é um conjunto de ajustes prontos que sobrepõem os do ajustes.env SÓ naquele dia: na manhã seguinte tudo volta ao normal sozinho.
 * Para ligar: TEMA_DO_DIA=vestidos e o dia: TEMA_DO_DIA_SEMANA=sexta (todo ano, toda semana) e/ou TEMA_DO_DIA_DATA=2026-10-30 (datas avulsas).
 */
import { diaDe } from './db.ts';

export interface TemaDoDia {
  nome: string;
  /** Os ajustes do ajustes.env que o tema muda no dia (os mesmos nomes e formatos do arquivo). */
  ajustes: Record<string, string>;
}

/** Os pontos mínimos por nicho de sempre, para o tema poder baixar só o do nicho dele. */
const PONTOS_PADRAO = 'pet=48,bebe=48,ferramentas=48,games=52';

export const TEMAS_DO_DIA: Record<string, TemaDoDia> = {
  vestidos: {
    nome: 'Dia dos vestidos e blusinhas femininas',
    ajustes: {
      TEMA: 'vestido,blusa,blusinha,cropped,macacao,macaquinho,saia,camisola,body',
      // Roupa feminina vende pouco por anúncio: o corte de vendas e de pontos da moda cai só hoje.
      SHOPEE_VENDAS_MINIMAS: '200',
      VENDAS_MINIMAS: '30',
      NICHO_PONTOS_MINIMOS: `${PONTOS_PADRAO},moda=45`,
      // Moda sai também no feed e nos Stories (hoje é o assunto do dia), e os 3 Reels do dia são de roupa.
      INSTAGRAM_SO_NOS_REELS: '',
      INSTAGRAM_REELS_DE_ROUPA: '3',
      INSTAGRAM_NICHOS: 'moda',
      NICHO_MINIMOS: 'moda=30',
    },
  },
  tecnologia: {
    nome: 'Dia da tecnologia',
    ajustes: { TEMA: 'celular,smartphone,fone,notebook,tablet,smartwatch,caixa de som,carregador,power bank,monitor,teclado,mouse,tv', INSTAGRAM_NICHOS: 'tech' },
  },
  cozinha: {
    nome: 'Dia da casa e cozinha',
    ajustes: { TEMA: 'air fryer,fritadeira,panela,liquidificador,cafeteira,batedeira,sanduicheira,jogo de,pote,faca,organizador,cozinha', INSTAGRAM_NICHOS: 'casa' },
  },
  games: {
    nome: 'Dia dos games',
    ajustes: { TEMA: 'playstation,xbox,nintendo,controle,gamer,headset,mouse gamer,teclado gamer,console,joystick', INSTAGRAM_NICHOS: 'games' },
  },
};

/** Datas AAAA-MM-DD válidas de um texto separado por vírgula. */
function datas(texto: string | undefined): string[] {
  return (texto ?? '').split(',').map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

/** Dias da semana (0 = domingo) de um texto como "sexta" ou "segunda, quinta-feira"; aceita com ou sem acento e "-feira". */
function diasDaSemana(texto: string | undefined): number[] {
  return (texto ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-?feira$/, ''))
    .map((d) => DIAS_DA_SEMANA.indexOf(d))
    .filter((i) => i >= 0);
}

/** Dia da semana de hoje no horário de Brasília (0 = domingo). */
function diaDaSemanaDeHoje(agora: Date): number {
  const curto = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(agora);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(curto);
}

/** O tema que vale hoje (no horário de Brasília), ou undefined. Sem dia marcado (nem data nem dia da semana), nenhum tema vale: o tema nunca fica ligado por esquecimento. */
export function temaDeHoje(env: Record<string, string | undefined>, agora: Date): { chave: string; tema: TemaDoDia } | undefined {
  const chave = (env.TEMA_DO_DIA ?? '').trim().toLowerCase();
  const tema = TEMAS_DO_DIA[chave];
  const ehHoje = datas(env.TEMA_DO_DIA_DATA).includes(diaDe(agora)) || diasDaSemana(env.TEMA_DO_DIA_SEMANA).includes(diaDaSemanaDeHoje(agora));
  if (!tema || !ehHoje) return undefined;
  return { chave, tema };
}

/** O ajustes.env de hoje: o de sempre, com os ajustes do tema do dia por cima (quando há tema hoje). */
export function aplicarTemaDoDia<E extends Record<string, string | undefined>>(env: E, agora: Date): E {
  const hoje = temaDeHoje(env, agora);
  return hoje ? { ...env, ...hoje.tema.ajustes } : env;
}
