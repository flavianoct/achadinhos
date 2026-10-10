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
  /** Vantagens do canal para quem está lendo, por plataforma de destino. */
  vantagens: { telegram: string[]; whatsapp: string[] };
  /** Frase final, antes de o link repetir para um amigo. */
  fecho: string;
}

const COMUNS = {
  filtro: 'Só entra oferta com desconto bom ou queda real de preço',
  historico: 'A gente confere o histórico de 30 dias: se o produto já esteve mais barato no último mês, ele fica de fora',
  lojas: 'Mercado Livre e Shopee num lugar só, sem você procurar em dois apps',
  gratis: '100% grátis. Você compra direto na loja e não paga nada a mais pelo nosso link',
  semSpam: 'Sem spam: poucas ofertas por vez, só as boas',
};

/** As variantes: cada uma usa vantagens diferentes e um tom diferente. Escolhidas ao acaso (sem repetir no mesmo dia). */
const VARIANTES: Variante[] = [
  {
    gancho: 'quer parar de pagar mais caro por aí?',
    vantagens: {
      telegram: [COMUNS.filtro, COMUNS.historico, 'No WhatsApp as ofertas chegam direto no zap, sem você abrir outro aplicativo'],
      whatsapp: [COMUNS.filtro, COMUNS.historico, 'No Telegram saem também os cupons do Mercado Livre, no mesmo lugar das ofertas'],
    },
    fecho: 'Entra, silencia se quiser e olha só quando der vontade de comprar.',
  },
  {
    gancho: 'sabe aquele produto que você vive olhando e nunca baixa de preço?',
    vantagens: {
      telegram: ['Nós vigiamos os preços todo dia e só avisamos quando cai de verdade', COMUNS.historico, 'Os avisos chegam direto no seu WhatsApp'],
      whatsapp: ['Nós vigiamos os preços todo dia e só avisamos quando cai de verdade', COMUNS.historico, 'Cupons do Mercado Livre também saem no Telegram'],
    },
    fecho: 'Quando o preço cair, você fica sabendo na hora.',
  },
  {
    gancho: 'o dia está corrido, mas dá tempo de economizar.',
    vantagens: {
      telegram: [COMUNS.lojas, 'Cada oferta vem com foto, preço e frete grátis quando tem', 'No WhatsApp você olha quando quiser: é só silenciar'],
      whatsapp: [COMUNS.lojas, 'Cada oferta vem com foto, preço e frete grátis quando tem', 'No Telegram os cupons do Mercado Livre saem junto'],
    },
    fecho: 'Três toques e você já está recebendo.',
  },
  {
    gancho: 'tem coisa boa saindo por preço baixo agora e o seu zap pode ser o primeiro a saber.',
    vantagens: {
      telegram: ['Ofertas durante todo o dia, nos horários em que as promoções aparecem', COMUNS.filtro, COMUNS.gratis],
      whatsapp: ['Ofertas durante todo o dia, nos horários em que as promoções aparecem', COMUNS.filtro, COMUNS.gratis],
    },
    fecho: 'Quem entra cedo pega o melhor preço antes de acabar o estoque.',
  },
  {
    gancho: 'uma dica de quem não gosta de pagar caro:',
    vantagens: {
      telegram: [COMUNS.historico, COMUNS.semSpam, 'No WhatsApp é só oferta, direto ao ponto'],
      whatsapp: [COMUNS.historico, COMUNS.semSpam, 'No Telegram é só oferta e cupom, direto ao ponto'],
    },
    fecho: 'É só entrar e deixar as ofertas virem até você.',
  },
  {
    gancho: 'você sabia que a gente também está por outros lados?',
    vantagens: {
      telegram: ['As mesmas ofertas, na hora, direto no seu WhatsApp', COMUNS.lojas, COMUNS.gratis],
      whatsapp: ['As mesmas ofertas, na hora, direto no seu Telegram, mais os cupons do Mercado Livre', COMUNS.lojas, COMUNS.gratis],
    },
    fecho: 'Escolha onde é mais fácil para você acompanhar.',
  },
  {
    gancho: 'antes de comprar, vale conferir se o preço está bom de verdade.',
    vantagens: {
      telegram: ['Mostramos quando o produto está no menor preço dos últimos dias', COMUNS.filtro, COMUNS.semSpam],
      whatsapp: ['Mostramos quando o produto está no menor preço dos últimos dias', COMUNS.filtro, COMUNS.semSpam],
    },
    fecho: 'Compra com mais segurança e sem se arrepender depois.',
  },
  {
    gancho: 'quer economizar sem perder tempo caçando promoção?',
    vantagens: {
      telegram: ['A gente caça as promoções por você, todo dia, e separa só as que valem', COMUNS.lojas, 'Chega no WhatsApp, onde você já olha toda hora'],
      whatsapp: ['A gente caça as promoções por você, todo dia, e separa só as que valem', COMUNS.lojas, 'No Telegram ainda saem os cupons do Mercado Livre'],
    },
    fecho: 'Você só escolhe o que quer comprar.',
  },
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
  const lista =
    plataforma === 'telegram'
      ? [
          { emoji: '📢', rotulo: 'Canal do WhatsApp', link: canal },
          { emoji: '👥', rotulo: 'Grupo do WhatsApp', link: grupo },
        ]
      : [{ emoji: '✈️', rotulo: 'Canal do Telegram', link: config.blog.telegramLink }];
  return lista.filter((l) => /^https:\/\//.test(l.link));
}

/** O link do próprio canal, para a pessoa mandar a um amigo. */
function linkDoProprioCanal(config: Config, plataforma: Plataforma): string {
  const l = plataforma === 'telegram' ? config.blog.telegramLink : config.blog.whatsappLink || config.whatsapp.destinos.find((d) => /whatsapp\.com\/channel\//i.test(d)) || '';
  return /^https:\/\//.test(l) ? l : '';
}

/** O texto de um convite. Vazio quando não há para onde convidar (falta o link do outro canal). */
export function textoDoConvite(config: Config, plataforma: Plataforma, variante: number, hora: number): string {
  const links = linksParaConvidar(config, plataforma);
  if (links.length === 0) return '';
  const v = VARIANTES[((variante % VARIANTES.length) + VARIANTES.length) % VARIANTES.length]!;
  const nome = plataforma === 'telegram' ? 'WhatsApp' : 'Telegram';
  const linhas: string[] = [`${saudacaoDaHora(hora)}, ${v.gancho}`, '', `Entre no nosso canal do ${nome} e receba as ofertas do Mata Preço:`, ''];
  for (const vantagem of v.vantagens[plataforma]) linhas.push(`✅ ${vantagem}`);
  linhas.push('', v.fecho, '', ...links.map((l) => `${l.emoji} ${l.rotulo}: ${l.link}`));
  const proprio = linkDoProprioCanal(config, plataforma);
  if (proprio) linhas.push('', `Já está por aqui? Manda este canal para um amigo que gosta de economizar: ${proprio}`);
  return linhas.join('\n');
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
