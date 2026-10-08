/**
 * Avisos do robô para o DONO, mostrados só no painel (painel.html). Nada vai para o Telegram, para o blog nem para o WhatsApp:
 * seguidores nunca recebem estas mensagens.
 */

/** Um problema que o dono precisa saber. A chave identifica o problema para contar há quanto tempo ele existe. */
export interface Alerta {
  chave: string;
  texto: string;
  /** "erro" = algo parou de funcionar; "aviso" = vale olhar, mas o robô segue. */
  nivel: 'erro' | 'aviso';
}

/** Um aviso que não é visto há mais que isto (horas) é considerado resolvido. */
export const HORAS_PARA_RESOLVER = 3;

/** Quantos dias um aviso resolvido continua aparecendo no painel. */
export const DIAS_DE_HISTORICO_DOS_AVISOS = 7;

/** Chave estável para um texto de aviso: números e datas mudam a cada rodada e não podem criar um aviso novo toda vez. */
export function chaveDoAviso(prefixo: string, texto: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^a-z#]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${prefixo}:${base}`;
}
