import type { Config } from './config.ts';
import { diaDe } from './db.ts';

/**
 * Convites para os canais: algumas vezes por dia (CONVITES_POR_DIA), em horários sorteados a cada dia dentro do horário de postagem,
 * o robô manda uma mensagem curta e variada explicando as vantagens do canal. No Telegram, convida para o canal e o grupo do WhatsApp;
 * no WhatsApp, convida para o canal do Telegram. Cada mensagem tem a saudação da hora (bom dia, boa tarde, boa noite) e um jeito
 * diferente de dizer a mesma coisa, para não virar propaganda repetida. Só vale o que o robô realmente faz (filtro, histórico, cupons).
 */
export type Plataforma = 'telegram' | 'whatsapp';

export interface Convite {
  /** Único por dia e por horário: o enviador de WhatsApp só manda uma vez cada um. */
  id: string;
  dia: string;
  /** Número do convite no dia (0, 1, 2...). */
  numero: number;
  /** Hora sorteada do convite (ms): o enviador descarta mensagem com mais de 3 horas, então ele não sai atrasado. */
  criadoEm: number;
  /** Texto para o canal do Telegram (convida para o WhatsApp). Vazio se não há link do WhatsApp configurado. */
  textoTelegram: string;
  /** Texto para o WhatsApp (convida para o Telegram). Vazio se não há link do Telegram configurado. */
  textoWhatsapp: string;
}

/** Quantas horas depois da hora sorteada o convite ainda pode sair. */
export const HORAS_DE_VALIDADE_DO_CONVITE = 3;
/** Máximo de convites por dia, qualquer que seja o ajuste (mais que isso vira spam). */
export const MAXIMO_DE_CONVITES_POR_DIA = 6;

interface Variante {
  /** Primeira frase, depois da saudação. */
  gancho: string;
  /** Uma terceira vantagem, curta, por plataforma de destino (as duas primeiras são sempre as mesmas). */
  extra: { telegram: string; whatsapp: string };
}

/** As vantagens que abrem toda mensagem: são o principal do canal. */
const PRINCIPAIS: Record<Plataforma, string[]> = {
  telegram: ['Ninguém vê o seu número', 'Não incomoda como grupo: sem conversa, só as ofertas'],
  whatsapp: ['Não incomoda como grupo: sem conversa, só as ofertas', 'Você entra e sai quando quiser'],
};

/** As variantes: ganchos curtos e uma terceira vantagem diferente cada. Escolhidas ao acaso (sem repetir no mesmo dia). */
const VARIANTES: Variante[] = [
  { gancho: 'quer pagar menos sem se incomodar?', extra: { telegram: 'Só oferta com desconto bom ou queda real', whatsapp: 'Os cupons do Mercado Livre saem lá também' } },
  { gancho: 'aquele produto que não baixa de preço?', extra: { telegram: 'A gente confere o histórico de 30 dias', whatsapp: 'A gente confere o histórico de 30 dias' } },
  { gancho: 'o dia está corrido, mas dá para economizar.', extra: { telegram: 'Mercado Livre e Shopee num lugar só', whatsapp: 'Mercado Livre e Shopee num lugar só' } },
  { gancho: 'tem oferta boa saindo agora.', extra: { telegram: 'Chega direto no seu zap, na hora', whatsapp: 'Chega direto no seu Telegram, na hora' } },
  { gancho: 'uma dica de quem não gosta de pagar caro:', extra: { telegram: 'Grátis, e você compra direto na loja', whatsapp: 'Grátis, e você compra direto na loja' } },
  { gancho: 'sabia que a gente também está por outros lados?', extra: { telegram: 'As mesmas ofertas, no WhatsApp', whatsapp: 'As mesmas ofertas, mais cupons do Mercado Livre' } },
  { gancho: 'antes de comprar, confira se o preço está bom.', extra: { telegram: 'Avisamos quando está no menor preço dos últimos dias', whatsapp: 'Avisamos quando está no menor preço dos últimos dias' } },
  { gancho: 'cansou de caçar promoção?', extra: { telegram: 'A gente caça e separa só as que valem', whatsapp: 'A gente caça e separa só as que valem' } },
];

/** Bom dia, boa tarde ou boa noite, pela hora de Brasília. */
export function saudacaoDaHora(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Gerador pseudoaleatório pequeno e determinístico (mulberry32): o mesmo dia sorteia sempre os mesmos horários. */
function sorteio(semente: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Os links que cada plataforma divulga. Telegram: o canal e o grupo do WhatsApp. WhatsApp: o canal do Telegram. */
export function linksParaConvidar(config: Config, plataforma: Plataforma): Array<{ emoji: string; rotulo: string; link: string }> {
  const grupo = config.whatsapp.destinos.find((d) => /chat\.whatsapp\.com\//i.test(d)) ?? '';
  const canal = config.blog.whatsappLink || config.whatsapp.destinos.find((d) => /whatsapp\.com\/channel\//i.test(d)) || '';
  if (plataforma === 'whatsapp') return /^https:\/\//.test(config.blog.telegramLink) ? [{ emoji: '✈️', rotulo: 'Canal do Telegram', link: config.blog.telegramLink }] : [];
  // O pitch é "ninguém vê o seu número": vale para o canal. Só se não houver canal é que o convite leva ao grupo.
  if (/^https:\/\//.test(canal)) return [{ emoji: '📢', rotulo: 'Canal do WhatsApp', link: canal }];
  return /^https:\/\//.test(grupo) ? [{ emoji: '👥', rotulo: 'Grupo do WhatsApp', link: grupo }] : [];
}

/** O texto de um convite. Vazio quando não há para onde convidar (falta o link do outro canal). */
export function textoDoConvite(config: Config, plataforma: Plataforma, variante: number, hora: number): string {
  const links = linksParaConvidar(config, plataforma);
  if (links.length === 0) return '';
  const v = VARIANTES[((variante % VARIANTES.length) + VARIANTES.length) % VARIANTES.length]!;
  const l = links[0]!;
  // Se só há o grupo (sem canal), "ninguém vê o seu número" não vale: o convite fala só do que é verdade para grupo.
  const principais = l.rotulo.startsWith('Grupo') ? PRINCIPAIS.telegram.slice(1) : PRINCIPAIS[plataforma];
  return [
    `${saudacaoDaHora(hora)}, ${v.gancho}`,
    '',
    ...[...principais, v.extra[plataforma]].map((x) => `✅ ${x}`),
    '',
    `${l.emoji} ${l.rotulo}: ${l.link}`,
  ].join('\n');
}

/** Os horários sorteados do dia (ms), um em cada faixa igual do horário de postagem, com pelo menos 1 hora de folga nas pontas. */
export function horariosDosConvites(config: Config, dia: string): number[] {
  const n = Math.min(MAXIMO_DE_CONVITES_POR_DIA, Math.max(0, config.convite.porDia));
  if (n === 0) return [];
  const inicio = Math.min(config.ritmo.horaFim - 2, config.ritmo.horaInicio + 1) * 60;
  const fim = Math.max(inicio + 60, (config.ritmo.horaFim - 1) * 60);
  const faixa = (fim - inicio) / n;
  const aleatorio = sorteio(`convite:${dia}`);
  const meiaNoite = Date.parse(`${dia}T00:00:00-03:00`);
  return Array.from({ length: n }, (_, i) => meiaNoite + Math.round(inicio + faixa * i + aleatorio() * faixa) * 60_000);
}

/** Os convites de hoje que já estão na hora (e ainda dentro da validade). Cada um com uma variante diferente. */
export function convitesDeHoje(config: Config, agora: Date): Convite[] {
  if (!config.convite.ativo) return [];
  const dia = diaDe(agora);
  const horarios = horariosDosConvites(config, dia);
  // Embaralha as variantes do dia para as de hoje não repetirem entre si.
  const aleatorio = sorteio(`variantes:${dia}`);
  const ordem = VARIANTES.map((_, i) => i);
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!];
  }
  const lista: Convite[] = [];
  horarios.forEach((criadoEm, numero) => {
    if (agora.getTime() < criadoEm || agora.getTime() >= criadoEm + HORAS_DE_VALIDADE_DO_CONVITE * 3_600_000) return;
    const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(criadoEm)));
    const variante = ordem[numero % ordem.length]!;
    const textoTelegram = textoDoConvite(config, 'telegram', variante, hora);
    const textoWhatsapp = textoDoConvite(config, 'whatsapp', variante, hora);
    if (!textoTelegram && !textoWhatsapp) return;
    lista.push({ id: `convite:${dia}:${numero}`, dia, numero, criadoEm, textoTelegram, textoWhatsapp });
  });
  return lista;
}
