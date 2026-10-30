import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ganchoDoReel, provaDoGancho } from '../src/ganchos.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const oferta = (extra: Partial<OfertaAvaliada> = {}) => ({ categoria: 'moda', titulo: 'Vestido', ...extra }) as OfertaAvaliada;

test('a prova só aparece com dados que a sustentam', () => {
  assert.equal(provaDoGancho(oferta()), undefined);
  assert.equal(provaDoGancho(oferta({ nota: 4.2 })), undefined);
  assert.deepEqual(provaDoGancho(oferta({ nota: 4.8 })), ['NOTA 4,8', 'NAS AVALIAÇÕES']);
  assert.match(provaDoGancho(oferta({ vendas: 12000 }))![0]!, /MIL/);
});

test('com um produto só, não usa lista nem escolha, e nunca cita preço', () => {
  for (let d = 1; d <= 28; d++) {
    const g = ganchoDoReel([oferta({ vendas: 5000 })], `2026-10-${String(d).padStart(2, '0')}-1`);
    assert.ok(!['lista', 'escolha'].includes(g.tipo));
    assert.ok(g.linhas.length >= 1 && g.linhas.length <= 2);
    assert.ok(!/R\$|BARATO|EXCLUSIV/.test(g.linhas.join(' ')));
  }
});

test('os formatos giram entre os Reels e a lista usa a quantidade de achados', () => {
  const tres = [oferta({ vendas: 3000 }), oferta(), oferta()];
  const tipos = new Set<string>();
  for (let d = 1; d <= 10; d++) for (let n = 1; n <= 3; n++) tipos.add(ganchoDoReel(tres, `2026-10-${String(d).padStart(2, '0')}-${n}`).tipo);
  assert.equal(tipos.size, 5);
  const lista = ganchoDoReel(tres, 'x').tipo === 'lista' ? ganchoDoReel(tres, 'x') : undefined;
  if (lista) assert.equal(lista.linhas[0], '3 ACHADOS');
});

test('o mesmo Reel sempre recebe o mesmo gancho', () => {
  assert.deepEqual(ganchoDoReel([oferta()], '2026-10-30-2'), ganchoDoReel([oferta()], '2026-10-30-2'));
});
