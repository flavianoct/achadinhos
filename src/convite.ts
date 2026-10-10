import type { Config } from './config.ts';
import { diaDe } from './db.ts';

/**
 * Convites para os canais: algumas vezes por dia (CONVITES_POR_DIA), em horários sorteados a cada dia dentro do horário de postagem,
 * o robô manda uma chamada CURTA com um gatilho mental, para quem não curte grupo nem mostrar o número: o canal tem as mesmas ofertas
 * do grupo, sem mostrar o número e sem conversa. Cada lugar convida para os OUTROS canais, nunca para si mesmo: o canal do Telegram
 * convida para o canal do WhatsApp, o canal do WhatsApp convida para o canal do Telegram e o grupo do WhatsApp convida para os dois.
 * Cada mensagem tem a saudação da hora e um gatilho diferente (só os verdadeiros: nada de número ou estoque inventado).
 */
export interface Convite {
  /** Único por dia e por horário: o enviador de WhatsApp só manda uma vez cada um. */
  id: string;
  dia: string;
  /** Número do convite no dia (0, 1, 2...). */
  numero: number;
  /** Hora sorteada do convite (ms): o enviador descarta mensagem com mais de 3 horas, então ele não sai atrasado. */
  criadoEm: number;
  /**
   * O texto de cada lugar. Vazio quando não há para onde convidar (o outro canal não está configurado).
   * telegram: canal do Telegram, convida para o canal do WhatsApp. whatsappCanal: canal do WhatsApp, convida para o canal do Telegram.
   * whatsappGrupo: grupo do WhatsApp, convida para os dois.
   */
  textos: { telegram: string; whatsappCanal: string; whatsappGrupo: string };
}

/** Onde o convite aparece. */
export type LugarDoConvite = 'telegram' | 'whatsapp-canal' | 'whatsapp-grupo';

/** Quantas horas depois da hora sorteada o convite ainda pode sair. */
export const HORAS_DE_VALIDADE_DO_CONVITE = 3;
/** Máximo de convites por dia, qualquer que seja o ajuste (mais que isso vira spam). */
export const MAXIMO_DE_CONVITES_POR_DIA = 6;

interface Variante {
  /** O emoji que abre a mensagem, depois da saudação. */
  emoji: string;
  /** A frase do gatilho mental. */
  frase: string;
  /** A vantagem do canal para quem não curte grupo nem mostrar o número. */
  vantagem: string;
  /** Chamada para agir, logo acima dos links. */
  chamada: string;
}

/**
 * Um gatilho mental por variante, todos verdadeiros: aversão à perda, curiosidade, exclusividade (o preço das artes do Instagram está
 * no canal), escassez, autoridade (o histórico de 30 dias), gratuidade, pertencimento e urgência do momento.
 * Escolhidas ao acaso, sem repetir no mesmo dia. Textos aprovados pelo dono.
 */
const VARIANTES: Variante[] = [
  { emoji: '💸', frase: 'Está deixando de economizar só porque não curte grupo?', vantagem: 'No canal são as mesmas ofertas, sem mostrar o seu número e sem conversa.', chamada: 'Entre agora, é grátis:' },
  { emoji: '👀', frase: 'Já viu qual produto mais caiu de preço hoje?', vantagem: 'Está no canal, as mesmas ofertas do grupo, sem ninguém ver o seu número.', chamada: 'Toque e confira:' },
  { emoji: '🔎', frase: 'Viu no Instagram e quer saber o preço? Ele está no canal.', vantagem: 'Mesmas ofertas do grupo, sem mostrar o seu número e sem barulho.', chamada: 'O preço está aqui:' },
  { emoji: '⏳', frase: 'Oferta boa acaba rápido, e no canal ela chega na hora.', vantagem: 'Sem grupo, sem conversa e sem mostrar o seu número.', chamada: 'Entre e fique na frente:' },
  { emoji: '✔️', frase: 'A gente confere o histórico de 30 dias antes de postar.', vantagem: 'Mesmas ofertas do grupo, sem mostrar o seu número e sem conversa.', chamada: 'Receba só o que vale:' },
  { emoji: '🎁', frase: 'De graça e sem pegadinha: você compra direto na loja.', vantagem: 'Para quem não curte grupo: as mesmas ofertas, sem mostrar o seu número.', chamada: 'É só tocar para entrar:' },
  { emoji: '🙌', frase: 'Quem gosta de economizar já está por lá.', vantagem: 'Mesmas ofertas do grupo, sem mostrar o seu número e sem conversa.', chamada: 'Junte-se a eles:' },
  { emoji: '🔥', frase: 'Ainda tem oferta boa saindo hoje.', vantagem: 'Receba na hora, sem grupo e sem mostrar o seu número.', chamada: 'Não perca as próximas:' },
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

/**
 * Os canais que o convite divulga (só os configurados). O grupo nunca entra: o convite é para quem não curte grupo.
 * Sem `lugar`, os dois. Com `lugar`, só os OUTROS: o Telegram não convida para o Telegram e o canal do WhatsApp não convida para si mesmo.
 */
export function linksDosCanais(config: Config, lugar?: LugarDoConvite): Array<{ emoji: string; rotulo: string; link: string }> {
  const canalWhatsapp = config.blog.whatsappLink || config.whatsapp.destinos.find((d) => /whatsapp\.com\/channel\//i.test(d)) || '';
  return [
    { emoji: '📢', rotulo: 'Canal do WhatsApp', link: canalWhatsapp, lugar: 'whatsapp-canal' },
    { emoji: '✈️', rotulo: 'Canal do Telegram', link: config.blog.telegramLink, lugar: 'telegram' },
  ]
    .filter((l) => /^https:\/\//.test(l.link))
    .filter((l) => lugar === undefined || lugar === 'whatsapp-grupo' || l.lugar !== lugar)
    .map(({ emoji, rotulo, link }) => ({ emoji, rotulo, link }));
}

/** O texto de um convite: saudação e gatilho, a vantagem, a chamada e os canais para onde convidar. Vazio quando não há canal para divulgar. */
export function textoDoConvite(config: Config, variante: number, hora: number, lugar?: LugarDoConvite): string {
  const links = linksDosCanais(config, lugar);
  if (links.length === 0) return '';
  const v = VARIANTES[((variante % VARIANTES.length) + VARIANTES.length) % VARIANTES.length]!;
  return [`${saudacaoDaHora(hora)}! ${v.emoji} ${v.frase}`, v.vantagem, '', `👇 ${v.chamada}`, ...links.map((l) => `${l.emoji} ${l.rotulo}: ${l.link}`)].join('\n');
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
    const textos = {
      telegram: textoDoConvite(config, variante, hora, 'telegram'),
      whatsappCanal: textoDoConvite(config, variante, hora, 'whatsapp-canal'),
      whatsappGrupo: textoDoConvite(config, variante, hora, 'whatsapp-grupo'),
    };
    if (!textos.telegram && !textos.whatsappCanal) return;
    lista.push({ id: `convite:${dia}:${numero}`, dia, numero, criadoEm, textos });
  });
  return lista;
}
