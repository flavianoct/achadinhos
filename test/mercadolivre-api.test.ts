import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FonteMercadoLivre } from '../src/fontes/mercadolivre.ts';
import { FonteMercadoLivreApi, limparTituloML } from '../src/fontes/mercadolivre-api.ts';

const resposta = (corpo: unknown, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const op = { clientId: 'id', clientSecret: 'segredo', mattWord: 'topfera', mattTool: '1', categorias: ['MLB1000'], porRodada: 1 };

function apiFalsa(opcoes: { highlights?: Response; semToken?: boolean; categorias?: Record<string, unknown> } = {}) {
  const chamadas: string[] = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    chamadas.push(`${init.method ?? 'GET'} ${u.replace('https://api.mercadolibre.com', '')}`);
    if (u.endsWith('/oauth/token')) return opcoes.semToken ? resposta({ message: 'x' }, 400) : resposta({ access_token: 'TOKEN' });
    assert.equal(init.headers?.authorization, 'Bearer TOKEN');
    const cat = /\/categories\/(MLB\d+)$/.exec(u)?.[1];
    if (cat) return resposta(opcoes.categorias?.[cat] ?? { children_categories: [] });
    if (u.includes('/highlights/')) return opcoes.highlights ?? resposta({ content: [{ id: 'MLB5001', type: 'PRODUCT' }, { id: 'MLBU999', type: 'USER_PRODUCT' }] });
    if (u.endsWith('/products/MLB5001')) return resposta({ id: 'MLB5001', name: 'Fritadeira Boa 4L', permalink: 'https://www.mercadolivre.com.br/fritadeira/p/MLB5001', pictures: [{ url: 'http://http2.mlstatic.com/a.jpg' }], buy_box_winner: { item_id: 'MLB111', price: 150, original_price: 300, shipping: { free_shipping: true } } });
    if (u.includes('/reviews/item/MLB111')) return resposta({ rating_average: 4.76 });
    if (u.includes('/items/MLB111')) return resposta({ sold_quantity: 900 });
    return resposta({}, 404);
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

test('ML pela API: token do app, mais vendidos, produto de catálogo e nota viram oferta com o link de afiliado', async () => {
  const { f, chamadas } = apiFalsa();
  const ofertas = await new FonteMercadoLivreApi(op, f, 0).coletar(0);
  assert.equal(ofertas.length, 1, 'o USER_PRODUCT não tem como ser lido e é ignorado');
  const o = ofertas[0]!;
  assert.equal(o.idProduto, 'MLB5001');
  assert.equal(o.preco, 150);
  assert.equal(o.desconto, 50);
  assert.equal(o.nota, 4.8);
  assert.equal(o.vendas, 900);
  assert.equal(o.freteGratis, true);
  assert.match(o.imagem!, /^https:/);
  assert.match(o.link, /matt_word=topfera/);
  assert.ok(chamadas[0]!.startsWith('POST /oauth/token'));
  assert.ok(!chamadas.some((c) => c.includes('/items/bulk') || c.includes('/sites/MLB/search')), 'não usa os recursos que respondem 403');
});

test('ML pela API: 403 vira erro claro e não insiste nas outras categorias', async () => {
  const { f, chamadas } = apiFalsa({ highlights: resposta({ message: 'forbidden' }, 403) });
  await assert.rejects(new FonteMercadoLivreApi({ ...op, categorias: ['MLB1000', 'MLB1051'], porRodada: 2 }, f, 0).coletar(0), /403 em \/highlights\/MLB\/category\/MLB1000/);
  assert.equal(chamadas.filter((c) => c.includes('/highlights/')).length, 1);
  await assert.rejects(new FonteMercadoLivreApi({ ...op, clientSecret: '' }, f, 0).coletar(0), /ML_CLIENT_SECRET/);
});

test('ML pela API: lê também as subcategorias, em rodízio, e pede cada produto uma só vez por rodada', async () => {
  const { f, chamadas } = apiFalsa({ categorias: { MLB1000: { children_categories: [{ id: 'MLB1002' }, { id: 'MLB1007' }] } } });
  const api = new FonteMercadoLivreApi({ ...op, porRodada: 3 }, f, 0);
  await api.coletar(0);
  const lidas = chamadas.filter((c) => c.includes('/highlights/')).map((c) => c.split('/').pop());
  assert.deepEqual(lidas, ['MLB1000', 'MLB1002', 'MLB1007'], 'a categoria e as filhas, nesta ordem');
  assert.equal(chamadas.filter((c) => c.endsWith('/products/MLB5001')).length, 1, 'o produto repetido nas três listas é pedido uma vez');
  // O turno seguinte recomeça do início do rodízio (3 categorias no total, 3 por rodada).
  const chamadas2 = apiFalsa({ categorias: { MLB1000: { children_categories: [{ id: 'MLB1002' }, { id: 'MLB1007' }, { id: 'MLB1009' }] } } });
  const api2 = new FonteMercadoLivreApi({ ...op, porRodada: 2 }, chamadas2.f, 0);
  await api2.coletar(1);
  assert.deepEqual(chamadas2.chamadas.filter((c) => c.includes('/highlights/')).map((c) => c.split('/').pop()), ['MLB1007', 'MLB1009']);
});

test('ML pela API: nota e vendas dão 403 (o token do app não lê anúncios): tenta uma vez e para de pedir', async () => {
  const chamadas: string[] = [];
  const f = (async (url: string) => {
    const u = String(url);
    chamadas.push(u);
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'T' });
    if (/\/categories\//.test(u)) return resposta({ children_categories: [] });
    if (u.includes('/highlights/')) return resposta({ content: [{ id: 'MLB1', type: 'PRODUCT' }, { id: 'MLB2', type: 'PRODUCT' }, { id: 'MLB3', type: 'PRODUCT' }] });
    if (/\/products\/MLB\d$/.test(u)) return resposta({ id: u.split('/').pop(), name: 'Produto', buy_box_winner: { item_id: 'MLB9' + u.slice(-1), price: 50 } });
    return resposta({ message: 'access_denied' }, 403);
  }) as unknown as typeof fetch;
  const logs: string[] = [];
  const original = console.log;
  console.log = (...a: unknown[]) => void logs.push(a.join(' '));
  let ofertas;
  try {
    ofertas = await new FonteMercadoLivreApi(op, f, 0).coletar(0);
  } finally {
    console.log = original;
  }
  assert.equal(ofertas.length, 3, 'as ofertas saem mesmo sem nota e vendas');
  assert.equal(chamadas.filter((c) => c.includes('/items/')).length, 1, 'um só pedido de anúncio');
  assert.equal(chamadas.filter((c) => c.includes('/reviews/')).length, 1, 'um só pedido de avaliações');
  assert.match(logs.find((l) => l.startsWith('[ml-api]'))!, /anúncio 403 x1, avaliações 403 x1/);
});

test('ML: a API é o caminho principal (a página nem é lida); se a API falha, usa a página e o aviso diz por quê', async () => {
  const { f } = apiFalsa();
  const paginaNaoLida = (async () => { throw new Error('a página nem devia ser lida'); }) as unknown as typeof fetch;
  const fonte = new FonteMercadoLivre({ mattWord: 'a', mattTool: '1', paginas: 1, intervaloMs: 0, reserva: new FonteMercadoLivreApi(op, f, 0) }, paginaNaoLida);
  assert.equal((await fonte.coletar()).length, 1);
  assert.equal(fonte.avisoDaColeta(), undefined);

  // API recusada e página barrada: o erro mostra as duas.
  const semApi = apiFalsa({ highlights: resposta({}, 403) });
  const captcha = (async () => new Response('<html>captcha</html>', { status: 200 })) as unknown as typeof fetch;
  const duas = new FonteMercadoLivre({ mattWord: 'a', mattTool: '1', paginas: 1, intervaloMs: 0, reserva: new FonteMercadoLivreApi(op, semApi.f, 0) }, captcha);
  await assert.rejects(duas.coletar(), /API do Mercado Livre: .*403.*Página: .*sem ofertas legíveis/s);
});

test('ML pela API: produto de catálogo (PRODUCT) vira oferta com o preço do anúncio vencedor, ou do primeiro da lista', async () => {
  const chamadas: string[] = [];
  const f = (async (url: string) => {
    const u = String(url);
    chamadas.push(u);
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'TOKEN' });
    if (/\/categories\//.test(u)) return resposta({ children_categories: [] });
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
    if (/\/categories\//.test(u)) return resposta({ children_categories: [] });
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

test('ML por tema: busca cada palavra entre os produtos de catálogo pela API; se a busca for recusada, cai na coleta normal', async () => {
  const chamadas: string[] = [];
  let recusar = false;
  const f = (async (url: string) => {
    const u = String(url);
    chamadas.push(u.replace('https://api.mercadolibre.com', ''));
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'TOKEN' });
    if (u.includes('/products/search')) return recusar ? resposta({ message: 'forbidden' }, 403) : resposta({ results: [{ id: 'MLB777' }, { id: 'MLB778' }] });
    if (u.endsWith('/products/MLB777')) return resposta({ id: 'MLB777', name: 'Projetor Portátil 4K Wi-Fi', pictures: [{ url: 'http://http2.mlstatic.com/p.jpg' }], buy_box_winner: { item_id: 'MLB1', price: 400, original_price: 800, condition: 'new', shipping: { free_shipping: true } } });
    if (u.endsWith('/products/MLB778')) return resposta({ id: 'MLB778', name: 'Projetor Usado', buy_box_winner: { item_id: 'MLB2', price: 100, condition: 'used' } });
    return resposta({ message: 'access_denied' }, 403);
  }) as unknown as typeof fetch;
  const api = new FonteMercadoLivreApi(op, f, 0);
  const achadas = await api.buscar(['projetor']);
  assert.equal(achadas.length, 1, 'o usado é descartado');
  assert.equal(achadas[0]!.idProduto, 'MLB777');
  assert.equal(achadas[0]!.desconto, 50);
  assert.match(achadas[0]!.link, /matt_word=topfera/);
  assert.ok(chamadas.some((c) => c.includes('/products/search') && c.includes('q=projetor')));
  assert.ok(!chamadas.some((c) => c.includes('/sites/MLB/search')), 'a busca de anúncios responde 403 e não é usada');

  // Pela fonte do ML: com tema, a busca vem primeiro e a página nem é lida.
  const fonte = new FonteMercadoLivre({ mattWord: 'topfera', mattTool: '1', reserva: api, tema: ['projetor'] }, (async () => { throw new Error('a página nem devia ser lida'); }) as unknown as typeof fetch);
  assert.equal((await fonte.coletar())[0]!.idProduto, 'MLB777');

  // Busca recusada (403): volta para a coleta normal (API e, se ela também falhar, página), e o erro da página aparece.
  recusar = true;
  await assert.rejects(new FonteMercadoLivre({ mattWord: 'topfera', mattTool: '1', paginas: 1, reserva: api, tema: ['projetor'] }, (async () => new Response('x', { status: 503 })) as unknown as typeof fetch).coletar(), /503/);
});

test('ML pela API: 429 (limite de requisições) para a coleta da rodada e guarda o que já veio', async () => {
  let produtos = 0;
  const f = (async (url: string) => {
    const u = String(url);
    if (u.endsWith('/oauth/token')) return resposta({ access_token: 'T' });
    if (/\/categories\//.test(u)) return resposta({ children_categories: [{ id: 'MLB1002' }] });
    if (/\/highlights\/MLB\/category\/MLB1000$/.test(u)) return resposta({ content: [{ id: 'MLB1', type: 'PRODUCT' }] });
    if (u.includes('/highlights/')) return resposta({ message: 'too many requests' }, 429);
    if (u.endsWith('/products/MLB1')) { produtos++; return resposta({ id: 'MLB1', name: 'Produto', buy_box_winner: { price: 50 } }); }
    return resposta({}, 404);
  }) as unknown as typeof fetch;
  const ofertas = await new FonteMercadoLivreApi({ ...op, porRodada: 2 }, f, 0).coletar(0);
  assert.equal(ofertas.length, 1, 'o que veio antes do 429 não se perde');
  assert.equal(produtos, 1);
});
