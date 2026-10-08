import type { Config } from './config.ts';
import { diaDe, horaDe } from './db.ts';

/**
 * Convite discreto para os canais: de vez em quando (por padrão uma vez por dia, ao meio-dia) o robô manda uma mensagem curta
 * dizendo onde mais as pessoas podem receber as ofertas (canal e grupo do WhatsApp, Telegram, Instagram), para cada um escolher
 * o que prefere. Nada de repetir em toda oferta.
 */
export interface Convite {
  /** Mesmo id o dia todo: o enviador de WhatsApp só manda uma vez. */
  id: string;
  dia: string;
  /** Hora do convite no dia (ms): o enviador descarta mensagem com mais de 3 horas, então o convite não sai atrasado. */
  criadoEm: number;
  texto: string;
}

/** Quantas horas depois da hora do convite ele ainda pode sair. */
export const HORAS_DE_VALIDADE_DO_CONVITE = 3;

/** Os caminhos que o convite mostra, na ordem. Só entram os que estão configurados. */
export function linksDoConvite(config: Config): Array<{ emoji: string; rotulo: string; link: string }> {
  const grupo = config.whatsapp.destinos.find((d) => /chat\.whatsapp\.com\//i.test(d));
  const canal = config.blog.whatsappLink || config.whatsapp.destinos.find((d) => /whatsapp\.com\/channel\//i.test(d)) || '';
  return [
    { emoji: '📢', rotulo: 'Canal do WhatsApp', link: canal },
    { emoji: '👥', rotulo: 'Grupo do WhatsApp', link: grupo ?? '' },
    { emoji: '✈️', rotulo: 'Telegram', link: config.blog.telegramLink },
    { emoji: '📸', rotulo: 'Instagram', link: config.blog.instagramLink },
  ].filter((l) => /^https:\/\//.test(l.link));
}

/** Texto curto e sem insistência. Vazio quando há menos de dois caminhos (não há o que escolher). */
export function textoDoConvite(config: Config): string {
  const links = linksDoConvite(config);
  if (links.length < 2) return '';
  return ['Se preferir receber de outro jeito, a gente também está por aqui:', '', ...links.map((l) => `${l.emoji} ${l.rotulo}: ${l.link}`)].join('\n');
}

/** O convite de hoje, se hoje for dia de convite e já estiver na hora (e ainda dentro da validade). */
export function conviteDeHoje(config: Config, agora: Date): Convite | undefined {
  const c = config.convite;
  if (!c.ativo) return undefined;
  const dia = diaDe(agora);
  const hora = horaDe(agora);
  if (hora < c.hora || hora >= Math.min(config.ritmo.horaFim, c.hora + HORAS_DE_VALIDADE_DO_CONVITE)) return undefined;
  // "A cada N dias": conta os dias desde 1970 no horário de Brasília, para o ritmo não depender de quando o robô começou.
  const numeroDoDia = Math.floor(Date.parse(`${dia}T00:00:00-03:00`) / 86_400_000);
  if (numeroDoDia % Math.max(1, c.aCadaDias) !== 0) return undefined;
  const texto = textoDoConvite(config);
  if (!texto) return undefined;
  return { id: `convite:${dia}`, dia, criadoEm: Date.parse(`${dia}T${String(c.hora).padStart(2, '0')}:00:00-03:00`), texto };
}
