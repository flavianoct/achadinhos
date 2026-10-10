import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUSCAS_PADRAO, buscasDoTurno, FonteShopee } from '../src/fontes/shopee.ts';
import { melhorVendedor, mesmoTipoDeProduto } from '../src/parecidos.ts';

test('parecidos: 60% das palavras ainda pega o mesmo produto de vendedores diferentes, e não junta assuntos que só dividem uma palavra', () => {
  assert.equal(mesmoTipoDeProduto('Telha Policarbonato Alveolar 6mm', 'Chapa Policarbonato Alveolar Cristal'), true);
  assert.equal(mesmoTipoDeProduto('Fone Bluetooth Sem Fio', 'Caixa de Som Bluetooth Portátil'), false);
});

test('melhor vendedor: anúncio sem nota (Mercado Livre pela API) não perde só por isso; decide a pontuação', () => {
  const ml = { id: 'ml', pontos: 80 } as { id: string; pontos: number; nota?: number; vendas?: number };
  const shopee = { id: 'shopee', pontos: 60, nota: 4.9, vendas: 100 };
  assert.equal(melhorVendedor([shopee, ml]).id, 'ml', 'só um lado tem nota: vale a pontuação');
  assert.equal(melhorVendedor([{ id: 'a', pontos: 90, nota: 4.2, vendas: 9000 }, { id: 'b', pontos: 70, nota: 4.9, vendas: 300 }]).id, 'b', 'com nota nos dois, a maior nota ganha');
  assert.equal(melhorVendedor([{ id: 'a', pontos: 70, nota: 4.5, vendas: 100 }, { id: 'b', pontos: 90, nota: 4.5, vendas: 900 }]).id, 'b', 'empate de nota: mais vendas');
  assert.equal(melhorVendedor([{ id: 'a', pontos: 70 }]).id, 'a');
});

test('shopee: as buscas por palavra andam em rodízio, uma lista padrão cobre quando nenhuma foi configurada, e 0 desliga', async () => {
  assert.deepEqual(buscasDoTurno(['a', 'b', 'c', 'd', 'e'], 2, 0), ['a', 'b']);
  assert.deepEqual(buscasDoTurno(['a', 'b', 'c', 'd', 'e'], 2, 1), ['c', 'd']);
  assert.deepEqual(buscasDoTurno(['a', 'b', 'c', 'd', 'e'], 2, 2), ['e', 'a'], 'dá a volta');
  assert.deepEqual(buscasDoTurno(['a', 'b'], 5, 7), ['a', 'b'], 'nunca mais buscas do que palavras');
  assert.deepEqual(buscasDoTurno(['a'], 0, 3), []);

  const consultas: string[] = [];
  const item = (id: number) => ({ itemId: String(id), productName: `Produto ${id}`, price: '50', priceMin: '50', priceMax: '50', priceDiscountRate: 30, ratingStar: '4.8', sales: 100, productLink: `https://s/${id}`, offerLink: `https://s/${id}`, imageUrl: 'https://i/x.jpg', commissionRate: '0.1' });
  const f = (async (_u: string, init: any) => {
    const q = String(JSON.parse(init.body).query);
    consultas.push(q);
    return new Response(JSON.stringify({ data: { productOfferV2: { nodes: [item(consultas.length)], pageInfo: { hasNextPage: false } } } }));
  }) as unknown as typeof fetch;
  const turno = 40;
  const fonte = new FonteShopee({ appId: 'a', secret: 'b', paginas: 1, agora: () => turno * 25 * 60_000 }, f);
  const ofertas = await fonte.coletar();
  const buscas = consultas.filter((c) => c.includes('keyword:'));
  assert.equal(buscas.length, 2, 'duas buscas além do ranking');
  assert.ok(BUSCAS_PADRAO.some((p) => buscas[0]!.includes(JSON.stringify(p))), 'vêm da lista padrão');
  assert.ok(ofertas.length >= 1);

  consultas.length = 0;
  await new FonteShopee({ appId: 'a', secret: 'b', paginas: 1, buscasPorRodada: 0 }, f).coletar();
  assert.equal(consultas.filter((c) => c.includes('keyword:')).length, 0, 'com 0, só o ranking');
});
