import type { Banco } from './db.ts';
import { diaDe, horaDe } from './db.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * O que o grupo entrega, com números de verdade, para quem está fora sentir o que perde. Nunca "oferta exclusiva" nem "só no grupo":
 * as ofertas são públicas nas lojas. O grupo ganha por chegar antes, na hora, e por volume.
 */
export interface NumerosDoGrupo {
  /** Achados que o grupo recebeu ontem. */
  ontem: number;
  /** Desses, quantos estavam no menor preço do histórico do robô (dos que viraram conteúdo de rede social). */
  noMenorPrecoOntem: number;
  /** Média de achados por dia nos últimos 7 dias, arredondada para baixo na dezena ("+80"); 0 se for pouco. */
  porDia: number;
}

const DIA = 86_400_000;

export function numerosDoGrupo(banco: Banco, agora: Date): NumerosDoGrupo {
  const ontem = new Date(agora.getTime() - DIA);
  const diaDeOntem = diaDe(ontem);
  const semana = banco.postsPorCategoria(7, agora).reduce((t, c) => t + c.posts, 0);
  // Média dos 7 dias sem contar hoje pela metade: usa os 6 dias cheios e o de hoje até agora, dividido por 7 (fica um pouco para baixo, nunca exagera).
  const media = Math.floor(semana / 7 / 10) * 10;
  const noMenorPrecoOntem = banco
    .socialRecentes(72, 500, agora)
    .filter((l) => diaDe(new Date(l.criadoEm)) === diaDeOntem)
    .filter((l) => (JSON.parse(l.dados) as OfertaAvaliada).menorPrecoEmDias).length;
  return { ontem: banco.postsNoDia(ontem), noMenorPrecoOntem, porDia: media >= 10 ? media : 0 };
}

/** "+80 ACHADOS POR DIA NO GRUPO", ou undefined se o número ainda é pequeno demais para impressionar. */
export function linhaPorDia(n: NumerosDoGrupo): string | undefined {
  return n.porDia >= 10 ? `+${n.porDia} ACHADOS POR DIA NO GRUPO` : undefined;
}

/** A linha da legenda com o dia de ontem ("Ontem foram 87 achados no grupo, 12 no menor preço do mês."), ou undefined se foi um dia fraco. */
export function linhaDeOntem(n: NumerosDoGrupo): string | undefined {
  if (n.ontem < 10) return undefined;
  const menor = n.noMenorPrecoOntem > 0 ? `, ${n.noMenorPrecoOntem} no menor preço do mês` : '';
  return `📲 Ontem foram ${n.ontem} achados no grupo${menor}. Aqui no Instagram você vê só alguns. Entrar é grátis: link na bio.`;
}

/**
 * "No grupo esse achado chegou às 9h12. Aqui, só agora." Só quando é verdade: a oferta foi para o WhatsApp (ou, sem ele, para o canal)
 * hoje, pelo menos 20 minutos antes.
 */
export function linhaDeChegada(banco: Banco, o: OfertaAvaliada, agora: Date): string | undefined {
  const whatsapp = banco.horaNoWhatsapp(o.loja, o.idProduto);
  const canal = banco.ultimoPost(o.loja, o.idProduto)?.postadoEm;
  const t = whatsapp ?? canal;
  if (!t || agora.getTime() - t < 20 * 60_000 || diaDe(new Date(t)) !== diaDe(agora)) return undefined;
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)).replace(':', 'h');
  return `⏱️ No ${whatsapp ? 'grupo' : 'canal'} esse achado chegou às ${hora}. Aqui, só agora.`;
}

export { horaDe };
