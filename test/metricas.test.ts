import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { ErroInstagram, type Instagram } from '../src/instagram.ts';
import { lerMetricasDoInstagram, montarRelatorio } from '../src/metricas.ts';

const agora = new Date('2026-10-31T14:00:00-03:00');
const config = lerConfig({ INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 't', INSTAGRAM_USER_ID: '1', INSTAGRAM_RESUMO_HORA: '10' });

function falso(metricas: (id: string) => Record<string, number>, erro?: ErroInstagram): Instagram {
  return {
    midiasRecentes: async () => {
      if (erro) throw erro;
      return [
        { id: 'r1', formato: 'reel', legenda: '✨ Vestido midi #publi\n...', publicadoEm: agora.getTime() - 86_400_000 },
        { id: 'r2', formato: 'reel', legenda: '👀 3 achados #publi', publicadoEm: agora.getTime() - 2 * 86_400_000 },
        { id: 'f1', formato: 'feed', legenda: '⭐ Campeão de vendas #publi', publicadoEm: agora.getTime() - 86_400_000 },
        { id: 'velho', formato: 'feed', legenda: 'antigo', publicadoEm: agora.getTime() - 30 * 86_400_000 },
      ];
    },
    metricas: async (id: string) => metricas(id),
  } as unknown as Instagram;
}

test('métricas: lê os posts da semana uma vez por dia, guarda e compara os ganchos dos Reels', async () => {
  const banco = new Banco(':memory:');
  banco.anotarGanchoDaMidia('r1', 'pergunta', agora);
  banco.anotarGanchoDaMidia('r2', 'lista', agora);
  const numeros: Record<string, Record<string, number>> = {
    r1: { reach: 900, views: 1500, saved: 12, shares: 5, comments: 3, likes: 40, ig_reels_avg_watch_time: 6200 },
    r2: { reach: 300, views: 400, saved: 1, shares: 0, comments: 1, likes: 9, ig_reels_avg_watch_time: 3100 },
    f1: { reach: 120, views: 200, saved: 2, shares: 0, comments: 0, likes: 6 },
  };
  const r = await lerMetricasDoInstagram(banco, config, agora, fetch, falso((id) => numeros[id]!));
  const texto = r.relatorio!.join('\n');
  assert.match(texto, /3 posts/, 'o post de 30 dias atrás fica de fora');
  assert.match(texto, /reel \(2\): alcance médio 600/);
  assert.match(texto, /4,7 s assistidos em média/);
  assert.match(texto, /Ganchos dos Reels \(alcance médio\): pergunta 900 \/ 6,2 s \(1\) · lista 300/);
  assert.match(texto, /Mais alcance:\n  reel "✨ Vestido midi": 900 contas/);
  // Na mesma data, não lê de novo.
  assert.deepEqual(await lerMetricasDoInstagram(banco, config, new Date(agora.getTime() + 3_600_000), fetch, falso(() => ({}))), {});
});

test('métricas: antes da hora do resumo não lê; sem permissão, avisa como resolver', async () => {
  const banco = new Banco(':memory:');
  assert.deepEqual(await lerMetricasDoInstagram(banco, config, new Date('2026-10-31T08:00:00-03:00'), fetch, falso(() => ({}))), {});
  const r = await lerMetricasDoInstagram(banco, config, agora, fetch, falso(() => ({}), new ErroInstagram('Instagram recusou (403/10): sem permissão', true)));
  assert.match(r.aviso!, /instagram_business_manage_insights/);
});

test('métricas: sem posts com números, o relatório diz isso', () => {
  assert.deepEqual(montarRelatorio([]), ['Instagram em números: ainda sem posts com números lidos.']);
});
