import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { diaDe, horaDe } from './db.ts';
import { ErroInstagram, Instagram } from './instagram.ts';
import type { Fetch } from './social.ts';

/**
 * Os números do Instagram: uma vez por dia (a partir da hora do resumo), o robô lê alcance, visualizações, salvamentos, compartilhamentos,
 * comentários e o tempo médio assistido de cada post e Reel dos últimos dias, guarda no banco e escreve um resumo no log da rodada:
 * a média por formato, os melhores e os piores, e a comparação dos ganchos de texto dos Reels.
 */
export const DIAS_DO_RELATORIO = 7;
const chaveDoDia = (agora: Date) => `instagram:metricas:${diaDe(agora)}`;

export interface LinhaDoRelatorio {
  mediaId: string;
  formato: string;
  legenda: string;
  gancho: string;
  publicadoEm: number;
  metricas: Record<string, number>;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const inteiro = (n: number) => Math.round(n).toLocaleString('pt-BR');
const decimal = (n: number) => n.toFixed(1).replace('.', ',');
/** A primeira linha da legenda, sem o #publi, curta: para reconhecer o post no relatório. */
const nomeDoPost = (legenda: string) => (legenda.split('\n')[0] ?? '').replace(/#publi/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60) || '(sem legenda)';
/** Salvamentos e compartilhamentos valem mais que curtida: são o que mais leva o post para quem não segue. */
const forca = (m: Record<string, number>) => (m.saved ?? 0) * 3 + (m.shares ?? 0) * 3 + (m.comments ?? 0) * 2 + (m.likes ?? 0);

/** O texto do relatório (uma linha por item), a partir dos números guardados. */
export function montarRelatorio(linhas: LinhaDoRelatorio[]): string[] {
  if (!linhas.length) return ['Instagram em números: ainda sem posts com números lidos.'];
  const saida = [`Instagram em números (últimos ${DIAS_DO_RELATORIO} dias, ${linhas.length} posts):`];
  for (const formato of ['reel', 'feed', 'carrossel']) {
    const doFormato = linhas.filter((l) => l.formato === formato);
    if (!doFormato.length) continue;
    const m = (k: string) => media(doFormato.map((l) => l.metricas[k] ?? 0));
    const tempo = formato === 'reel' && doFormato.some((l) => l.metricas.ig_reels_avg_watch_time) ? `, ${decimal(m('ig_reels_avg_watch_time') / 1000)} s assistidos em média` : '';
    saida.push(`- ${formato} (${doFormato.length}): alcance médio ${inteiro(m('reach'))}, ${inteiro(m('views'))} visualizações, ${decimal(m('saved'))} salvamentos, ${decimal(m('shares'))} compartilhamentos, ${decimal(m('comments'))} comentários${tempo}`);
  }
  const porAlcance = [...linhas].sort((a, b) => (b.metricas.reach ?? 0) - (a.metricas.reach ?? 0));
  saida.push('- Mais alcance:');
  for (const l of porAlcance.slice(0, 3)) saida.push(`  ${l.formato} "${nomeDoPost(l.legenda)}": ${inteiro(l.metricas.reach ?? 0)} contas, ${l.metricas.saved ?? 0} salvos, ${l.metricas.shares ?? 0} envios${l.gancho ? `, gancho ${l.gancho}` : ''}`);
  const porForca = [...linhas].sort((a, b) => forca(b.metricas) - forca(a.metricas));
  saida.push(`- Mais engajamento (salvar e enviar contam triplo): ${porForca.slice(0, 3).map((l) => `"${nomeDoPost(l.legenda)}"`).join(', ')}`);
  if (porAlcance.length > 3) saida.push(`- Menos alcance: ${porAlcance.slice(-2).map((l) => `${l.formato} "${nomeDoPost(l.legenda)}" (${inteiro(l.metricas.reach ?? 0)})`).join(', ')}`);
  // Os ganchos de texto dos Reels: o alcance e o tempo assistido de cada formato.
  const reels = linhas.filter((l) => l.formato === 'reel' && l.gancho);
  const ganchos = [...new Set(reels.map((l) => l.gancho))];
  if (ganchos.length) {
    const partes = ganchos
      .map((g) => {
        const doGancho = reels.filter((l) => l.gancho === g);
        return { g, n: doGancho.length, alcance: media(doGancho.map((l) => l.metricas.reach ?? 0)), tempo: media(doGancho.map((l) => l.metricas.ig_reels_avg_watch_time ?? 0)) };
      })
      .sort((a, b) => b.alcance - a.alcance);
    saida.push(`- Ganchos dos Reels (alcance médio): ${partes.map((p) => `${p.g} ${inteiro(p.alcance)}${p.tempo ? ` / ${decimal(p.tempo / 1000)} s` : ''} (${p.n})`).join(' · ')}`);
    if (reels.length < 10) saida.push('  (ainda poucos Reels por formato: a comparação fica confiável a partir de uns 10)');
  }
  return saida;
}

/**
 * Lê os números do dia (uma vez por dia, a partir da hora do resumo) e devolve o relatório; fora da hora, nada.
 * Sem a permissão de métricas no token, devolve o aviso de como resolver (e não tenta de novo no mesmo dia).
 */
export async function lerMetricasDoInstagram(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch, cliente?: Instagram): Promise<{ relatorio?: string[]; aviso?: string }> {
  const ig = config.instagram;
  if (!ig.ativo || !ig.token || !ig.userId) return {};
  if (horaDe(agora) < Math.max(ig.resumoHora, 1) || banco.textoSalvo(chaveDoDia(agora), 1, agora)) return {};
  banco.salvarTexto(chaveDoDia(agora), 'lido', agora);
  const api = cliente ?? new Instagram(ig.token, ig.userId, fetchFn);
  try {
    const desde = agora.getTime() - DIAS_DO_RELATORIO * 86_400_000;
    const midias = (await api.midiasRecentes(40)).filter((m) => m.publicadoEm >= desde);
    for (const m of midias) {
      try {
        const metricas = await api.metricas(m.id, m.formato === 'reel');
        banco.salvarMetricas({ mediaId: m.id, formato: m.formato, legenda: m.legenda, publicadoEm: m.publicadoEm, metricas }, agora);
      } catch (e) {
        if (e instanceof ErroInstagram && e.fatal) throw e;
        // Um post sem números (recém-publicado, por exemplo) não derruba o relatório.
      }
    }
    return { relatorio: montarRelatorio(banco.metricasDoInstagram(DIAS_DO_RELATORIO, agora)) };
  } catch (e) {
    const msg = (e as Error).message;
    const semPermissao = e instanceof ErroInstagram && e.fatal;
    return {
      aviso: semPermissao
        ? `Instagram: não consegui ler os números dos posts (${msg}). O token precisa da permissão instagram_business_manage_insights: gere de novo no app da Meta com ela marcada e troque o secret INSTAGRAM_TOKEN.`
        : `Instagram: os números dos posts não vieram hoje (${msg}).`,
    };
  }
}
