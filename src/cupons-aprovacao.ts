import { chaveDoCupom, cupomVigente, type Cupom } from './cupons.ts';
import type { Banco } from './db.ts';
import { diaDe, horaDe } from './db.ts';

/**
 * Cupons com a SUA aprovação. O robô garimpa cupons do Mercado Livre (páginas públicas do Promobit, com as travas de sempre) e, em vez de
 * postar sozinho, manda cada um para o seu Telegram privado com dois botões: ✅ Postar e ❌ Ignorar. Você confere no app da loja (5
 * segundos) e só o que você aprova vai para o canal e o WhatsApp. Nada é publicado sem o seu toque. Liga com CUPONS_APROVACAO=1.
 */
export const INTERVALO_DO_GARIMPO_HORAS = 3;
export const MAXIMO_DE_CANDIDATOS_POR_DIA = 4;

type Fetch = typeof fetch;

const dataCurta = (d?: string) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');

/** O texto do cupom para você conferir antes de aprovar. */
export function textoDoCandidato(c: Cupom): string {
  return [
    '🎟️ Cupom achado no Mercado Livre',
    '',
    c.titulo,
    ...(c.codigo ? [`Código: ${c.codigo}`] : ['Sem código: é só ativar na página']),
    ...(c.validoAte ? [`Vale até: ${dataCurta(c.validoAte)}`] : []),
    ...(c.detalhe ? [`Regras: ${c.detalhe}`] : []),
    '',
    '👉 Confira no app do Mercado Livre se funciona antes de aprovar.',
    'Só vai para o canal e o WhatsApp se você tocar em Postar.',
  ].join('\n');
}

/**
 * Garimpa e manda ao dono os cupons novos (no máximo MAXIMO_DE_CANDIDATOS_POR_DIA por dia, e o garimpo roda a cada
 * INTERVALO_DO_GARIMPO_HORAS horas). Devolve quantos candidatos enviou. Nunca lança erro.
 */
export async function enviarCandidatosDeCupom(
  banco: Banco,
  env: Record<string, string | undefined>,
  token: string,
  ligado: boolean,
  garimpar: () => Promise<Cupom[]>,
  agora: Date,
  fetchFn: Fetch = fetch,
): Promise<number> {
  const chat = String(env.TELEGRAM_COMANDOS_CHAT ?? '').trim();
  if (!ligado || !token || !/^-?\d{5,}$/.test(chat)) return 0;
  const janela = `cupons:garimpo:${diaDe(agora)}:${Math.floor(horaDe(agora) / INTERVALO_DO_GARIMPO_HORAS)}`;
  if (banco.textoSalvo(janela, 1, agora)) return 0;
  try {
    banco.salvarTexto(janela, '1', agora);
    let enviados = 0;
    for (const cupom of await garimpar()) {
      if (banco.candidatosDeHoje(agora) + enviados >= MAXIMO_DE_CANDIDATOS_POR_DIA) break;
      const chave = chaveDoCupom(cupom);
      // Já visto antes (aprovado, recusado ou pendente) ou já postado: não pergunta de novo.
      if (banco.ultimoPostDeCupom(chave) !== undefined) continue;
      const id = banco.novoCandidatoDeCupom(chave, JSON.stringify(cupom), agora);
      if (id === undefined) continue;
      const r = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: textoDoCandidato(cupom), reply_markup: { inline_keyboard: [[{ text: '✅ Postar', callback_data: `cp:ok:${id}` }, { text: '❌ Ignorar', callback_data: `cp:no:${id}` }]] } }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => undefined);
      if (r?.ok) enviados++;
      else banco.decidirCandidatoDeCupom(id, 'ignorado'); // não chegou até você: não fica pendente invisível
    }
    return enviados;
  } catch {
    return 0;
  }
}

/** Os cupons que você aprovou e ainda valem: entram na fila de postagem junto com os do cupons.json. */
export function cuponsAprovados(banco: Banco, agora: Date): Cupom[] {
  const saida: Cupom[] = [];
  for (const json of banco.candidatosDeCupom('aprovado')) {
    try {
      const c = JSON.parse(json) as Cupom;
      if (c && typeof c.link === 'string' && c.link.startsWith('https://') && cupomVigente(c, agora)) saida.push(c);
    } catch {
      // linha estragada: ignora
    }
  }
  return saida;
}
