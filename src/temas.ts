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
const PONTOS_PADRAO = 'pet=44,bebe=48,ferramentas=48,games=52';

export const TEMAS_DO_DIA: Record<string, TemaDoDia> = {
  vestidos: {
    nome: 'Dia dos vestidos, blusinhas e calças femininas',
    ajustes: {
      TEMA: 'vestido,blusa,blusinha,cropped,macacao,macaquinho,saia,camisola,body,calca,saia',
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
  blackfriday: {
    nome: 'Esquenta Black Friday: games, eletrônicos, acessórios, moda feminina e ferramentas',
    ajustes: {
      // Sem filtro de palavras (TEMA): o robô segue postando de tudo, mas estes nichos ganham meta maior hoje e cortes de qualidade mais baixos,
      // para entrarem mais ofertas deles. O pet segue com a meta de 2 por hora (34 no dia).
      NICHO_MINIMOS: 'pet=34,games=14,tech=50,moda=40,ferramentas=22',
      NICHO_PONTOS_MINIMOS: `${PONTOS_PADRAO.replace('ferramentas=48', 'ferramentas=44').replace('games=52', 'games=46')},moda=45,tech=52`,
      // Moda feminina vende pouco por anúncio, então o corte de vendas e de pontos cai só hoje.
      SHOPEE_VENDAS_MINIMAS: '300',
      VENDAS_MINIMAS: '40',
      CUPONS_POR_DIA: '6',
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

/** Temas criados por comando no Telegram: { nome: { nome, palavras } }. JSON inválido ou fora do formato vira "nenhum" (nunca derruba a rodada). */
export function lerTemasExtras(json: string | undefined): Record<string, { nome: string; palavras: string[] }> {
  const saida: Record<string, { nome: string; palavras: string[] }> = {};
  try {
    const lido = JSON.parse(json || '{}') as Record<string, { nome?: unknown; palavras?: unknown }>;
    for (const [chave, t] of Object.entries(lido)) {
      if (!/^[a-z0-9]{1,20}$/.test(chave) || chave in TEMAS_DO_DIA || !Array.isArray(t?.palavras)) continue;
      const palavras = t.palavras.filter((p): p is string => typeof p === 'string' && /^[a-z0-9 ]{3,24}$/.test(p)).slice(0, 30);
      if (palavras.length) saida[chave] = { nome: typeof t.nome === 'string' ? t.nome.slice(0, 60) : `Dia: ${chave}`, palavras };
    }
  } catch {
    // JSON ruim: ignora
  }
  return saida;
}

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
  const extra = lerTemasExtras(env.TEMAS_EXTRAS)[chave];
  const tema = TEMAS_DO_DIA[chave] ?? (extra ? { nome: extra.nome, ajustes: { TEMA: extra.palavras.join(',') } } : undefined);
  const ehHoje = datas(env.TEMA_DO_DIA_DATA).includes(diaDe(agora)) || diasDaSemana(env.TEMA_DO_DIA_SEMANA).includes(diaDaSemanaDeHoje(agora));
  if (!tema || !ehHoje) return undefined;
  return { chave, tema };
}

/** O ajustes.env de hoje: o de sempre, com os ajustes do tema do dia por cima (quando há tema hoje). */
export function aplicarTemaDoDia<E extends Record<string, string | undefined>>(env: E, agora: Date): E {
  const hoje = temaDeHoje(env, agora);
  return hoje ? { ...env, ...hoje.tema.ajustes } : env;
}
