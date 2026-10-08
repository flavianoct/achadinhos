import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { atualizarVendas, postarCampanha } from '../src/pipeline.ts';
import { converterCampanhas, converterVendas, escolherCampanha, montarSelecao, type Campanha } from '../src/shopee-extra.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const AGORA = new Date('2026-10-03T18:00:00Z');
const escalar = (name: string) => ({ kind: 'SCALAR', name });
const objeto = (name: string) => ({ kind: 'NON_NULL', ofType: { kind: 'OBJECT', name } });
const TIPOS: Record<string, Array<{ name: string; type: any }>> = {
  Conexao: [{ name: 'nodes', type: { kind: 'LIST', ofType: objeto('No') } }, { name: 'pageInfo', type: objeto('Pagina') }],
  No: [{ name: 'purchaseTime', type: escalar('Int64') }, { name: 'orders', type: { kind: 'LIST', ofType: objeto('Pedido') } }],
  Pedido: [{ name: 'orderId', type: escalar('String') }],
  Pagina: [{ name: 'hasNextPage', type: escalar('Boolean') }],
};

test('shopee: a seleção só pede os campos que a API diz ter (campo inventado não derruba a consulta)', async () => {
  const pedidos: string[] = [];
  const consultar = async (q: string) => {
    pedidos.push(q);
    const nome = /name: "(\w+)"/.exec(q)?.[1] ?? '';
    return { __type: { fields: TIPOS[nome] ?? [] } };
  };
  const sel = await montarSelecao(consultar, 'Conexao', { nodes: { purchaseTime: true, inventado: true, orders: { orderId: true, items: { itemId: true } } }, pageInfo: { hasNextPage: true, scrollId: true } });
  assert.equal(sel, 'nodes { purchaseTime orders { orderId } } pageInfo { hasNextPage }');
  assert.equal(await montarSelecao(consultar, 'Desconhecido', { a: true }), '');
});

test('shopee: vendas viram itens com valor, comissão e chave única; item sem id é ignorado', () => {
  const itens = converterVendas([
    {
      purchaseTime: 1759500000,
      conversionId: 7,
      orders: [{ orderId: 'A', orderStatus: 'COMPLETED', items: [{ itemId: 11, itemName: 'Fone Bluetooth', itemPrice: '50', qty: 2, itemTotalCommission: '6.5' }, { itemName: 'sem id' }] }],
    },
  ]);
  assert.deepEqual(itens, [{ chave: '7:A:11:0', compradoEm: 1759500000000, itemId: '11', nome: 'Fone Bluetooth', valor: 100, comissao: 6.5, status: 'COMPLETED', categoriaDaLoja: undefined }]);
});

test('shopee: vendas por nicho usam o nicho do post do robô ou o do nome; cancelada não conta; lê só de tempos em tempos', async () => {
  const banco = new Banco(':memory:');
  const config = lerConfig({});
  const postado = { loja: 'shopee', idProduto: '11', titulo: 'Fone', preco: 50, link: 'x', categoria: 'tech', pontos: 1 } as OfertaAvaliada;
  banco.registrarPost(postado, AGORA);
  let chamadas = 0;
  const buscar = async () => {
    chamadas++;
    return [
      { chave: 'a', compradoEm: AGORA.getTime(), itemId: '11', nome: 'Kit qualquer', valor: 100, comissao: 8, status: 'COMPLETED' },
      { chave: 'b', compradoEm: AGORA.getTime(), itemId: '99', nome: 'Camiseta Básica', valor: 40, comissao: 2 },
      { chave: 'c', compradoEm: AGORA.getTime(), itemId: '98', nome: 'Camiseta Polo', valor: 60, comissao: 3, status: 'CANCELLED' },
    ];
  };
  assert.equal(await atualizarVendas(buscar, banco, config, AGORA), 3);
  assert.deepEqual(banco.vendasPorCategoria(7, AGORA), [
    { categoria: 'tech', vendas: 1, valor: 100, comissao: 8 },
    { categoria: 'moda', vendas: 1, valor: 40, comissao: 2 },
  ]);
  assert.equal(await atualizarVendas(buscar, banco, config, new Date(AGORA.getTime() + 3600_000)), undefined, 'uma hora depois ainda não lê');
  assert.equal(chamadas, 1);
  assert.equal(await atualizarVendas(buscar, banco, config, new Date(AGORA.getTime() + 4 * 3600_000)), 3, 'depois de 3 horas lê de novo, sem duplicar');
  assert.equal(banco.vendasPorCategoria(7, AGORA).reduce((a, c) => a + c.vendas, 0), 2);
});

const c1: Campanha = { id: '1', nome: 'Super Promoções 10.10', link: 'https://s.shopee.com.br/a', comissao: 0.1, fim: AGORA.getTime() + 86_400_000 };
const c2: Campanha = { id: '2', nome: 'Frete Grátis', link: 'https://s.shopee.com.br/b', comissao: 0.05 };
const vencida: Campanha = { id: '3', nome: 'Antiga', link: 'https://s.shopee.com.br/c', comissao: 0.5, fim: AGORA.getTime() - 1 };

test('shopee: campanhas em vigor, maior comissão primeiro, sem repetir; nó sem link é ignorado', () => {
  assert.deepEqual(converterCampanhas([{ offerName: ' Ofertas  Relâmpago ', offerLink: 'https://s/x', periodEndTime: 1759600000, commissionRate: '0.08' }, { offerName: 'sem link' }]), [
    { id: 'https://s/x', nome: 'Ofertas Relâmpago', link: 'https://s/x', imagem: undefined, comissao: 0.08, inicio: undefined, fim: 1759600000000 },
  ]);
  assert.equal(escolherCampanha([c2, vencida, c1], () => undefined, 7, AGORA)?.id, '1');
  // Nomes quebrados (rótulos internos) não viram post.
  const nomes = converterCampanhas(['- - Health', 'Health', '---', 'Moda - - ', 'Semana do Consumidor', '— Super Ofertas de Beleza —'].map((offerName, i) => ({ offerName, offerLink: 'https://s/' + i }))).map((c) => c.nome);
  assert.deepEqual(nomes, ['Semana do Consumidor', 'Super Ofertas de Beleza']);
  assert.equal(escolherCampanha([c2, c1], (id) => (id === '1' ? AGORA.getTime() : undefined), 7, AGORA)?.id, '2');
});

test('shopee: campanha sai no canal geral, respeita o limite do dia e fica desligada com 0', async () => {
  const banco = new Banco(':memory:');
  const enviados: any[] = [];
  const pub = { publicar: async () => {}, publicarAviso: async (a: any, destino?: string) => void enviados.push({ ...a, destino }) };
  const config = lerConfig({ TELEGRAM_CHAT_ID: '@geral', HORA_INICIO: '0', HORA_FIM: '24', CAMPANHAS_POR_DIA: '1' });
  const r = await postarCampanha(pub, async () => [c1, c2], banco, config, AGORA);
  assert.ok(r.postou);
  assert.equal(enviados[0].destino, '@geral');
  assert.match(enviados[0].texto, /CAMPANHA SHOPEE[\s\S]*Super Promoções 10\.10[\s\S]*Até 04\/10/);
  assert.deepEqual(await postarCampanha(pub, async () => [c2], banco, config, AGORA), { postou: false, motivo: 'limite diário' });
  assert.deepEqual(await postarCampanha(pub, async () => [c1], banco, lerConfig({}), AGORA), { postou: false, motivo: 'desligado' });
  const erro = await postarCampanha(pub, async () => { throw new Error('fora do ar'); }, new Banco(':memory:'), config, AGORA);
  assert.deepEqual(erro, { postou: false, motivo: 'erro', detalhe: 'fora do ar' });
});
