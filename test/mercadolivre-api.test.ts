import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FonteMercadoLivre } from '../src/fontes/mercadolivre.ts';
import { FonteMercadoLivreApi, limparTituloML } from '../src/fontes/mercadolivre-api.ts';

const resposta = (corpo: unknown, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const op = { clientId: 'id', clientSecret: 'segredo', mattWord: 'topfera', mattTool: '1', categorias: ['MLB1000'], porRodada: 1 };

function apiFalsa(opcoes: { highlights?: Response; semToken?: boolean } = {}) {
  const chamadas: string[] = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    chamadas.push(`${init.method ?? 'GET'} ${u.replace('https://api.mercadolibre.com', '')}`);
    if (u.endsWith('/oauth/token')) return opcoes.semToken ? resposta({ message: 'x' }, 400) : resposta({ access_token: 'TOKEN' });
    assert.equal(init.headers?.authorization, 'Bearer TOKEN');
    if (u.includes('/highlights/')) return opcoes.highlights ?? resposta({ content: [{ id: 'MLB111', type: 'ITEM' }, { id: 'MLBU999', type: 'USER_PRODUCT' }] });
    if (u.includes('/items/bulk')) return resposta([{ status_code: 200, body: { id: 'MLB111', title: 'Fritadeira Boa 4L', price: 150, original_price: 300, permalink: 'https://produto.mercadolivre.com.br/MLB-111-fritadeira', thumbnail: 'http://http2.mlstatic.com/a.jpg', shipping: { free_shipping: true }, sold_quantity: 900, status: 'active', condition: 'new' } }]);
    if (u.includes('/reviews/item/MLB111')) return resposta({ rating_average: 4.76 });
    return resposta({}, 404);
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

test('ML pela API: token do app, mais vendidos, detalhes e nota viram oferta com o link de afiliado', async () => {
  const { f, chamadas } = apiFalsa();
  const ofertas = await new FonteMercadoLivreApi(op, f, 0).coletar(0);
  assert.equal(ofertas.length, 1);
  const o = ofertas[0]!;
  assert.equal(o.idProduto, 'MLB111');
  assert.equal(o.preco, 150);
  assert.equal(o.desconto, 50);
  assert.equal(o.nota, 4.8);
  assert.equal(o.vendas, 900);
  assert.equal(o.freteGratis, true);
  assert.match(o.imagem!, /^https:/);
  assert.match(o.link, /matt_word=topfera/);
  assert.ok(chamadas[0]!.startsWith('POST /oauth/token'));
});

test('ML pela API: 403 vira erro claro e não insiste nas outras categorias', async () => {
  const { f, chamadas } = apiFalsa({ highlights: resposta({ message: 'forbidden' }, 403) });
  await assert.rejects(new FonteMercadoLivreApi({ ...op, categorias: ['MLB1000', 'MLB1051'], porRodada: 2 }, f, 0).coletar(0), /403 em \/highlights\/MLB\/category\/MLB1000/);
  assert.equal(chamadas.filter((c) => c.includes('/highlights/')).length, 1);
  await assert.rejects(new FonteMercadoLivreApi({ ...op, clientSecret: '' }, f, 0).coletar(0), /ML_CLIENT_SECRET/);
});

test('ML: se a página barra com captcha, usa a API; se as duas falham, o erro mostra as duas', async () => {
  const captcha = (async () => new Response('<html>captcha</html>', { status: 200 })) as unknown as typeof fetch;
  const { f } = apiFalsa();
  const fonte = new FonteMercadoLivre({ mattWord: 'a', mattTool: '1', paginas: 1, intervaloMs: 0, reserva: new FonteMercadoLivreApi(op, f, 0) }, captcha);
  assert.equal((await fonte.coletar()).length, 1);
  const semApi = apiFalsa({ highlights: resposta({}, 403) });
  const duas = new FonteMercadoLivre({ mattWord: 'a', mattTool: '1', paginas: 1, intervaloMs: 0, reserva: new FonteMercadoLivreApi(op, semApi.f, 0) }, captcha);
  await assert.rejects(duas.coletar(), /sem ofertas legíveis.*Reserva: .*403/s);
});
test('ML pela API: produto de catálogo (PRODUCT) vira oferta com o preço do anúncio vencedor, ou do primeiro da lista', async () => {
  const chamadas: string[] = [];
  const f = (async (url: string) => {
    const u = String(url);
    chamadas.push(u);
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'TOKEN' });
    if (u.includes('/highlights/')) return resposta({ content: [{ id: 'MLB5001', type: 'PRODUCT' }, { id: 'MLB5002', type: 'PRODUCT' }, { id: 'MLB5003', type: 'PRODUCT' }] });
    if (u.endsWith('/products/MLB5001')) return resposta({ id: 'MLB5001', name: 'Fritadeira Boa 4L', permalink: 'https://www.mercadolivre.com.br/fritadeira/p/MLB5001', pictures: [{ url: 'http://http2.mlstatic.com/a.jpg' }], buy_box_winner: { item_id: 'MLB111', price: 150, original_price: 300, shipping: { free_shipping: true } } });
    if (u.endsWith('/products/MLB5002')) return resposta({ id: 'MLB5002', name: 'Fone Bluetooth' });
    if (u.includes('/products/MLB5002/items')) return resposta({ results: [{ item_id: 'MLB222', price: 90 }] });
    if (u.endsWith('/products/MLB5003')) return resposta({ id: 'MLB5003', name: 'Sem anúncio' });
    if (u.includes('/products/MLB5003/items')) return resposta({ results: [] });
    if (u.includes('/reviews/item/MLB111')) return resposta({ rating_average: 4.7 });
    return resposta({}, 404);
  }) as unknown as typeof fetch;
  const ofertas = await new FonteMercadoLivreApi(op, f, 0).coletar(0);
  assert.deepEqual(ofertas.map((o) => o.idProduto).sort(), ['MLB5001', 'MLB5002']);
  const a = ofertas.find((o) => o.idProduto === 'MLB5001')!;
  assert.equal(a.titulo, 'Fritadeira Boa 4L');
  assert.equal(a.preco, 150);
  assert.equal(a.desconto, 50);
  assert.equal(a.nota, 4.7);
  assert.equal(a.freteGratis, true);
  assert.match(a.imagem!, /^https:/);
  assert.match(a.link, /\/p\/MLB5001\?.*matt_word=topfera/);
  const b = ofertas.find((o) => o.idProduto === 'MLB5002')!;
  assert.equal(b.preco, 90);
  assert.equal(b.nota, undefined, 'sem nota a oferta segue valendo');
  assert.match(b.link, /mercadolivre\.com\.br\/p\/MLB5002/);
  assert.ok(!chamadas.some((c) => c.includes('/items/bulk')), 'não depende dos detalhes do anúncio');

  const semPreco = (async (url: string) => {
    const u = String(url);
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'T' });
    if (u.includes('/highlights/')) return resposta({ content: [{ id: 'MLB5003', type: 'PRODUCT' }] });
    if (u.includes('/items')) return resposta({ results: [] });
    return resposta({ id: 'MLB5003', name: 'x' });
  }) as unknown as typeof fetch;
  await assert.rejects(new FonteMercadoLivreApi(op, semPreco, 0).coletar(0), /produto sem preço \(campos: id,name; sem vencedor\)/);
});
test('ML pela API: título do catálogo perde a lista de modelos e fica com até 110 caracteres', () => {
  assert.equal(limparTituloML('Fone Ouvido Bluetooth Compatível Com Iphone X Xr 11 12 13 14 15 16 17 Xs Pro Max Sem Fio'), 'Fone Ouvido Bluetooth Compatível Com Iphone X Xs Pro Max Sem Fio');
  assert.equal(limparTituloML('Galaxy S24 Ultra 512GB'), 'Galaxy S24 Ultra 512GB');
  const longo = limparTituloML('Kit '.repeat(5) + 'Organizador de Cozinha Premium com Tampa Hermética Livre de BPA para Geladeira e Despensa Alta Durabilidade');
  assert.ok(longo.length <= 110 && !/\s$/.test(longo));
});

test('ML por tema: busca cada palavra pela API, traz nota e link de afiliado; se a busca for recusada, cai na página de ofertas', async () => {
  const chamadas: string[] = [];
  let recusar = false;
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    chamadas.push(u.replace('https://api.mercadolibre.com', ''));
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'TOKEN' });
    if (u.includes('/sites/MLB/search')) return recusar ? resposta({ message: 'forbidden' }, 403) : resposta({ results: [{ id: 'MLB777', title: 'Projetor Portátil 4K Wi-Fi', price: 400, original_price: 800, permalink: 'https://produto.mercadolivre.com.br/MLB-777-projetor', thumbnail: 'http://http2.mlstatic.com/p.jpg', condition: 'new', shipping: { free_shipping: true }, sold_quantity: 1200 }, { id: 'MLB778', title: 'Projetor Usado', price: 100, permalink: 'https://x.mercadolivre.com.br/MLB-778', condition: 'used' }] });
    if (u.includes('/reviews/item/MLB777')) return resposta({ rating_average: 4.6 });
    return resposta({}, 404);
  }) as unknown as typeof fetch;
  const api = new FonteMercadoLivreApi(op, f, 0);
  const achadas = await api.buscar(['projetor']);
  assert.equal(achadas.length, 1, 'o usado é descartado');
  assert.equal(achadas[0]!.idProduto, 'MLB777');
  assert.equal(achadas[0]!.nota, 4.6);
  assert.equal(achadas[0]!.desconto, 50);
  assert.match(achadas[0]!.link, /matt_word=topfera/);
  assert.ok(chamadas.some((c) => c.includes('q=projetor')));

  // Pela fonte do ML: com tema, a busca vem primeiro.
  const fonte = new FonteMercadoLivre({ mattWord: 'topfera', mattTool: '1', reserva: api, tema: ['projetor'] }, (async () => { throw new Error('a página nem devia ser lida'); }) as unknown as typeof fetch);
  assert.equal((await fonte.coletar())[0]!.idProduto, 'MLB777');

  // Busca recusada (403): volta para a página de ofertas, e o erro da página aparece.
  recusar = true;
  await assert.rejects(new FonteMercadoLivre({ mattWord: 'topfera', mattTool: '1', paginas: 1, reserva: api, tema: ['projetor'] }, (async () => new Response('x', { status: 503 })) as unknown as typeof fetch).coletar(), /503/);
});
