import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FonteMercadoLivre } from '../src/fontes/mercadolivre.ts';
import { FonteMercadoLivreApi } from '../src/fontes/mercadolivre-api.ts';

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