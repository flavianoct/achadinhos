import type { Alerta } from './alertas.ts';
import type { Banco } from './db.ts';
import { diaDe, horaDe } from './db.ts';
import { Telegram } from './telegram.ts';

/**
 * Resumos e alertas no seu Telegram privado (o mesmo chat dos comandos, TELEGRAM_COMANDOS_CHAT). Só MANDA mensagem: nada aqui muda o
 * robô. Três tipos:
 *  - os números do Instagram (alcance, salvamentos, melhor Reel), uma vez por dia, quando o relatório fica pronto;
 *  - o resumo do dia (ofertas por loja, WhatsApp, Instagram), uma vez por dia, a partir das 21h;
 *  - alertas do que parou ou vale olhar (token vencendo, permissão faltando, Reel agendado que não saiu), cada um uma vez por dia.
 * Desliga com TELEGRAM_RESUMOS=0. Sem TELEGRAM_COMANDOS_CHAT não manda nada. Qualquer erro é engolido: a rodada nunca depende disto.
 */
export const HORA_DO_RESUMO = 21;
/** Alertas que valem uma mensagem (além de todo alerta de nível "erro"). */
const IMPORTANTES = /agendado|token|venceu|vence|expira|permiss|recusou|desconect/i;

const inicioDoDia = (agora: Date) => Date.parse(`${diaDe(agora)}T00:00:00-03:00`);

/** Quantos posts de cada tipo saíram hoje. */
export function numerosDoDia(banco: Banco, agora: Date): { ofertas: number; porLoja: Record<string, number>; whatsapp: number; instagram: Record<string, number>; stories: number } {
  const dia = diaDe(agora);
  const desde = inicioDoDia(agora);
  const um = <T>(sql: string, ...args: Array<string | number>) => banco.consultar<T>(sql, ...args);
  const porLoja: Record<string, number> = {};
  for (const l of um<{ loja: string; n: number }>(`SELECT loja, COUNT(*) AS n FROM postados WHERE dia = ? GROUP BY loja`, dia)) porLoja[l.loja] = Number(l.n);
  const instagram: Record<string, number> = {};
  for (const l of um<{ tipo: string; n: number }>(`SELECT tipo, COUNT(*) AS n FROM instagram_midias WHERE publicado_em >= ? GROUP BY tipo`, desde)) instagram[l.tipo] = Number(l.n);
  return {
    ofertas: Object.values(porLoja).reduce((a, b) => a + b, 0),
    porLoja,
    whatsapp: Number(um<{ n: number }>(`SELECT COUNT(*) AS n FROM whatsapp_saida WHERE criado_em >= ?`, desde)[0]?.n ?? 0),
    instagram,
    stories: Number(um<{ n: number }>(`SELECT COUNT(*) AS n FROM social_saida WHERE ig_story_em >= ?`, desde)[0]?.n ?? 0),
  };
}

const NOME_DA_LOJA: Record<string, string> = { mercadolivre: 'Mercado Livre', shopee: 'Shopee' };
const NOME_DO_TIPO: Record<string, string> = { feed: 'feed', reel: 'Reels', carrossel: 'carrossel' };

/** O texto do resumo do dia. */
export function textoDoResumo(banco: Banco, agora: Date): string {
  const n = numerosDoDia(banco, agora);
  const lojas = Object.entries(n.porLoja).map(([l, q]) => `${NOME_DA_LOJA[l] ?? l} ${q}`).join(' · ');
  const ig = Object.entries(n.instagram).map(([t, q]) => `${q} ${NOME_DO_TIPO[t] ?? t}`);
  if (n.stories) ig.push(`${n.stories} stories`);
  return [
    `📊 Resumo de hoje (${diaDe(agora).split('-').reverse().slice(0, 2).join('/')})`,
    `🛒 Ofertas postadas: ${n.ofertas}${lojas ? ` (${lojas})` : ''}`,
    `💬 Mensagens na fila do WhatsApp: ${n.whatsapp}`,
    `📸 Instagram: ${ig.length ? ig.join(', ') : 'nada hoje'}`,
  ].join('\n');
}

type Fetch = typeof fetch;

/**
 * Manda ao dono o que for novo desta rodada. `relatorioDoInstagram`: as linhas do relatório de números (só existem 1 vez por dia).
 * Devolve quantas mensagens enviou. Nunca lança erro.
 */
export async function avisosNoTelegram(
  banco: Banco,
  env: Record<string, string | undefined>,
  token: string,
  avisos: Alerta[],
  relatorioDoInstagram: string[] | undefined,
  agora: Date,
  fetchFn: Fetch = fetch,
): Promise<number> {
  const chat = String(env.TELEGRAM_COMANDOS_CHAT ?? '').trim();
  if (!token || !/^-?\d{5,}$/.test(chat) || String(env.TELEGRAM_RESUMOS ?? '1').trim() === '0') return 0;
  const tg = new Telegram(token, chat, fetchFn);
  let enviadas = 0;
  const mandar = async (chave: string, texto: string): Promise<void> => {
    // Cada aviso uma vez por dia (o banco guarda a chave por 3 dias).
    if (banco.textoSalvo(`tg:${chave}:${diaDe(agora)}`, 1, agora)) return;
    try {
      await tg.publicarTexto(texto, chat);
      banco.salvarTexto(`tg:${chave}:${diaDe(agora)}`, '1', agora);
      enviadas++;
    } catch {
      // o Telegram pode estar fora do ar: tenta de novo na próxima rodada
    }
  };
  try {
    if (relatorioDoInstagram?.length) await mandar('numeros', ['📈 ' + (relatorioDoInstagram[0] ?? ''), ...relatorioDoInstagram.slice(1)].join('\n'));
    if (horaDe(agora) >= HORA_DO_RESUMO) await mandar('resumo', textoDoResumo(banco, agora));
    for (const a of avisos) {
      if (a.nivel !== 'erro' && !IMPORTANTES.test(a.texto)) continue;
      await mandar(`alerta:${a.chave}`, `${a.nivel === 'erro' ? '🚨' : '⚠️'} ${a.texto}`.slice(0, 900));
    }
  } catch {
    // nunca atrapalha a rodada
  }
  return enviadas;
}
