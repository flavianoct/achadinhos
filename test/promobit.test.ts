import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { coletarPromobit, converterOfertaPromobit, expandirLink, extrairOfertasPromobit, FontePromobit, fotoPromobit, idDoProdutoML, limparLinkML, linkDoRedirecionamento, mesmoProduto, produtoDaVitrineML } from '../src/fontes/promobit.ts';

function pagina(pageProps: unknown): string {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script></html>`;
}

const oferta = (id: number, extra: Record<string, unknown> = {}) => ({
  offerId: id, offerTitle: `Produto ${id}`, offerPrice: 100, offerOldPrice: 200, offerPhoto: `/${id}.png`, offerSlug: `produto-${id}`,
  offerStatusName: 'APPROVED', offerPriceType: 'PRICE', storeDomain: 'mercadolivre.com.br', storeName: 'Mercado Livre', ...extra,
});

const REDIRECIONA = (link: string) => `<!DOCTYPE html><html><head><title>Promobit | Redirecionando para a loja</title></head><script>window.location.href = "${link}";</script></html>`;

test('promobit: lê só ofertas de produto do ML (sem cupom, sem chamada de grupo, sem outra loja, sem repetida)', () => {
  const html = pagina({
    serverOffers: { offers: [oferta(1), oferta(2, { storeDomain: 'shopee.com.br' }), oferta(3, { offerTitle: 'Cupom Mercado Livre: 25% OFF', offerPrice: 0.01 })] },
    sidebarFeaturedOffers: [oferta(1), oferta(4, { offerPriceType: 'FREE', offerPrice: 0 }), oferta(5, { offerStatusName: 'RESTRICTED' })],
    store: { topOffers: [oferta(6)] },
  });
  assert.deepEqual(extrairOfertasPromobit(html)?.map((o) => o.offerId), [1, 6]);
  assert.deepEqual(extrairOfertasPromobit(html, ['amazon']), []);
  assert.equal(extrairOfertasPromobit('<html>mudou</html>'), undefined);
});

test('promobit: foto, link do redirecionamento, id do produto e limpeza do link', () => {
  assert.equal(fotoPromobit('/329733.png'), 'https://i.promobit.com.br/329733.png');
  assert.equal(fotoPromobit('javascript:x'), undefined);
  assert.equal(linkDoRedirecionamento(REDIRECIONA('https://meli.la/2dvna79')), 'https://meli.la/2dvna79');
  assert.equal(idDoProdutoML('https://www.mercadolivre.com.br/controle-dualsense/p/MLB18922455?pdp_filters=item_id:MLB123456789'), 'MLB18922455');
  assert.equal(idDoProdutoML('https://produto.mercadolivre.com.br/MLB-3456789012-tcl-605-_JM'), 'MLB3456789012');
  assert.equal(
    limparLinkML('https://www.mercadolivre.com.br/x/p/MLB1?pdp_filters=item_id:MLB2&matt_word=promobit&matt_tool=999&utm_source=promobit&forceInApp=true#reviews'),
    'https://www.mercadolivre.com.br/x/p/MLB1?pdp_filters=item_id%3AMLB2',
  );
});

test('promobit: expande o link curto sem abrir a página do produto', async () => {
  const pedidos: string[] = [];
  const falso = (async (url: string) => {
    pedidos.push(url);
    if (url === 'https://meli.la/abc') return new Response(null, { status: 301, headers: { location: 'https://mercadolivre.com/sec/xyz' } });
    if (url === 'https://mercadolivre.com/sec/xyz') return new Response(null, { status: 302, headers: { location: 'https://produto.mercadolivre.com.br/MLB-123456-x-_JM?matt_word=promobit' } });
    throw new Error(`não devia pedir ${url}`);
  }) as typeof fetch;
  assert.equal(await expandirLink('https://meli.la/abc', falso), 'https://produto.mercadolivre.com.br/MLB-123456-x-_JM?matt_word=promobit');
  assert.deepEqual(pedidos, ['https://meli.la/abc', 'https://mercadolivre.com/sec/xyz']);
  assert.equal(await expandirLink('https://meli.la/fora', (async () => { throw new Error('rede'); }) as typeof fetch), undefined);
});

test('promobit: a oferta sai com o SEU código de afiliado, foto e preço do Promobit', () => {
  const o = converterOfertaPromobit(oferta(7) as any, 'https://produto.mercadolivre.com.br/MLB-123456-x-_JM?matt_word=promobit&matt_tool=111', { mercadolivre: { mattWord: 'eu', mattTool: '42' } });
  assert.deepEqual(o, {
    loja: 'mercadolivre', idProduto: 'MLB123456', titulo: 'Produto 7', preco: 100, precoOriginal: 200, desconto: 50,
    imagem: 'https://i.promobit.com.br/7.png', link: 'https://produto.mercadolivre.com.br/MLB-123456-x-_JM?matt_word=eu&matt_tool=42', nomeLoja: 'Mercado Livre',
  });
  // Amazon sem tag (desligada) não vira oferta.
  assert.equal(converterOfertaPromobit(oferta(8) as any, 'https://www.amazon.com.br/dp/B0ABCDEFGH', { mercadolivre: { mattWord: 'eu', mattTool: '42' } }), undefined);
  assert.equal(converterOfertaPromobit(oferta(8) as any, 'https://www.amazon.com.br/dp/B0ABCDEFGH?tag=promobit-20', { amazon: { tag: 'minha-20' } })?.link, 'https://www.amazon.com.br/dp/B0ABCDEFGH?tag=minha-20');
});

test('promobit: coleta completa; oferta sem link do produto fica de fora; nunca pede página do ML', async () => {
  const pedidos: string[] = [];
  const falso = (async (url: string) => {
    pedidos.push(url);
    if (url.endsWith('/promocoes/loja/mercado-livre/')) return new Response(pagina({ serverOffers: { offers: [oferta(1), oferta(2), oferta(3)] } }));
    if (url === 'https://www.promobit.com.br/') return new Response(pagina({ serverOffers: { offers: [oferta(1), oferta(9, { storeDomain: 'amazon.com.br' })] } }));
    if (url.endsWith('/Redirect/to/1/')) return new Response(REDIRECIONA('https://meli.la/um'));
    if (url.endsWith('/Redirect/to/2/')) return new Response(REDIRECIONA('https://meli.la/dois'));
    if (url.endsWith('/Redirect/to/3/')) return new Response('sem link');
    if (url === 'https://meli.la/um') return new Response(null, { status: 301, headers: { location: 'https://produto.mercadolivre.com.br/MLB-1110000-a-_JM' } });
    if (url === 'https://meli.la/dois') return new Response(null, { status: 301, headers: { location: 'https://www.mercadolivre.com.br/b/p/MLB2220000' } });
    throw new Error(`não devia pedir ${url}`);
  }) as typeof fetch;
  const r = await coletarPromobit({ afiliados: { mercadolivre: { mattWord: 'eu', mattTool: '42' } }, intervaloMs: 0 }, falso);
  assert.deepEqual(r.ofertas.map((o) => [o.idProduto, o.link]), [
    ['MLB1110000', 'https://produto.mercadolivre.com.br/MLB-1110000-a-_JM?matt_word=eu&matt_tool=42'],
    ['MLB2220000', 'https://www.mercadolivre.com.br/b/p/MLB2220000?matt_word=eu&matt_tool=42'],
  ]);
  assert.equal(r.lidas, 3, 'a oferta da Amazon não entra com a Amazon desligada');
  assert.equal(r.semLink, 1);
  assert.ok(!pedidos.some((p) => /mercadolivre\.com\.br/.test(p)), 'nenhum pedido à página do ML');
  assert.ok(!pedidos.some((p) => p.includes('/loja/amazon/')), 'Amazon desligada: a página dela nem é pedida');
});

test('promobit: fonte falha com motivo quando o Promobit cai (a rodada segue com as outras lojas)', async () => {
  const fonte = new FontePromobit({ afiliados: { mercadolivre: { mattWord: 'eu', mattTool: '42' } } }, (async () => new Response('x', { status: 503 })) as typeof fetch);
  await assert.rejects(fonte.coletar(), /503/);
});

test('promobit: config liga pelo PROMOBIT_ATIVO, sem depender de ML_ATIVO, e avisa sem código de afiliado', () => {
  const c = lerConfig({ PROMOBIT_ATIVO: '1', ML_ATIVO: '0' } as any);
  assert.equal(c.promobit.ativo, true);
  assert.equal(c.ml.ativo, false);
  assert.equal(c.promobit.maximo, 15);
  assert.equal(lerConfig({} as any).promobit.ativo, false);
});

// Trecho com o mesmo formato da vitrine /social/promobit que o ML devolveu no teste real (27/11/2026).
const VITRINE = `<html><head><meta property="og:title" content="Ar Condicionado Portátil KABUM! Smart 700, 12000 BTUs, Quente e Frio - R$ 1.869"/></head><body>
<script>{"item_id":"MLB5479215763","prc":1869,"product_id":"MLB80139594","user_product_id":"MLBU4900447061","pid":"MLBP80139594","pid_version":"0.6.0","url":"www.mercadolivre.com.br\\u002Far-condicionado-portatil-kabum-smart-700\\u002Fp\\u002FMLB80139594?matt_event_ts=1795771628117&matt_d2id=9bc4#polycard_client=recommendations_home_affiliate-profile&matt_tool_id=76706625"}</script>
<a href="https://www.mercadolivre.com.br/outro/up/MLBU5177127754?x=1">outro</a></body></html>`;

test('promobit: lê o produto em destaque na vitrine de afiliado do ML (link, id, título e preço atual)', () => {
  assert.deepEqual(produtoDaVitrineML(VITRINE), {
    url: 'https://www.mercadolivre.com.br/ar-condicionado-portatil-kabum-smart-700/p/MLB80139594?matt_event_ts=1795771628117&matt_d2id=9bc4',
    idProduto: 'MLB80139594',
    titulo: 'Ar Condicionado Portátil KABUM! Smart 700, 12000 BTUs, Quente e Frio',
    preco: 1869,
  });
  assert.equal(produtoDaVitrineML('<html>nada</html>'), undefined);
  assert.equal(mesmoProduto('Ar-condicionado portátil KABUM! Smart 700', 'Ar Condicionado Portátil KABUM! Smart 700, 12000 BTUs'), true);
  assert.equal(mesmoProduto('Controle Joystick Sem Fio Sony Playstation 5', 'Ar Condicionado Portátil KABUM! Smart 700'), false);
});

test('promobit: link do Promobit que cai na vitrine dele vira link limpo do produto com o SEU código e o preço do ML', async () => {
  const falso = (async (url: string) => {
    if (url.endsWith('/promocoes/loja/mercado-livre/')) return new Response(pagina({ serverOffers: { offers: [oferta(1, { offerTitle: 'Ar-condicionado portátil KABUM! Smart 700', offerPrice: 1645.59, offerOldPrice: 2444.43 })] } }));
    if (url === 'https://www.promobit.com.br/') return new Response(pagina({ serverOffers: { offers: [] } }));
    if (url.endsWith('/Redirect/to/1/')) return new Response(REDIRECIONA('https://meli.la/2J7RjFd'));
    if (url === 'https://meli.la/2J7RjFd') return new Response(null, { status: 301, headers: { location: 'https://www.mercadolivre.com.br/social/promobit?matt_word=promobit&matt_tool=76706625&forceInApp=true&ref=BLgO' } });
    if (url.startsWith('https://www.mercadolivre.com.br/social/promobit')) return new Response(VITRINE);
    throw new Error(`não devia pedir ${url}`);
  }) as typeof fetch;
  const r = await coletarPromobit({ afiliados: { mercadolivre: { mattWord: 'eu', mattTool: '42' } }, intervaloMs: 0 }, falso);
  assert.equal(r.ofertas.length, 1);
  const o = r.ofertas[0]!;
  assert.equal(o.link, 'https://www.mercadolivre.com.br/ar-condicionado-portatil-kabum-smart-700/p/MLB80139594?matt_word=eu&matt_tool=42');
  assert.equal(o.idProduto, 'MLB80139594');
  assert.equal(o.preco, 1869, 'vale o preço atual do ML, não o do Promobit com cupom');
  assert.equal(o.precoOriginal, 2444.43);
  assert.ok(!o.link.includes('promobit'));
});
