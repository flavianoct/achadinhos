import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extrairAsin, linkAfiliadoAmazon } from '../src/fontes/amazon.ts';
import { converterAnuncioML, converterProdutoML, FonteMercadoLivre, linkAfiliadoML } from '../src/fontes/mercadolivre.ts';
import { assinarShopee, cabecalhoShopee, converterItemShopee, FonteShopee } from '../src/fontes/shopee.ts';

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

// ───────────── Shopee ─────────────

test('shopee: assinatura bate com SHA256(AppId+Timestamp+Payload+Secret)', () => {
  // Valor de referência calculado fora do código, com sha256sum.
  assert.equal(assinarShopee('APP123', 'SEGREDO', 1700000000, '{"query":"x"}'), '9db9f78f8c60000246ee6056236dca162a29ebfb08455d72758aaef5cf7945eb');
  assert.equal(
    cabecalhoShopee('APP123', 'SEGREDO', 1700000000, '{"query":"x"}'),
    'SHA256 Credential=APP123, Timestamp=1700000000, Signature=9db9f78f8c60000246ee6056236dca162a29ebfb08455d72758aaef5cf7945eb',
  );
});

test('shopee: converte item e ignora item incompleto', () => {
  const o = converterItemShopee({
    itemId: 123456789012, productName: 'Fone X', offerLink: 'https://s.shopee.com.br/abc', imageUrl: 'https://img/x.jpg',
    priceMin: '89.90', priceDiscountRate: 55, sales: 1200, ratingStar: '4.8', commissionRate: '0.1', shopName: 'Loja',
  });
  assert.deepEqual(o, {
    loja: 'shopee', idProduto: '123456789012', titulo: 'Fone X', preco: 89.9, desconto: 55, imagem: 'https://img/x.jpg',
    link: 'https://s.shopee.com.br/abc', nota: 4.8, vendas: 1200, comissao: 0.1, nomeLoja: 'Loja',
  });
  assert.equal(converterItemShopee({ itemId: 1, productName: 'Sem link', priceMin: '10' }), undefined);
  assert.equal(converterItemShopee({ itemId: 1, productName: 'Sem preço', offerLink: 'https://x' }), undefined);
});

test('shopee: pagina, remove duplicados e assina cada requisição com o corpo enviado', async () => {
  const chamadas: Array<{ corpo: string; auth: string }> = [];
  const item = (id: number) => ({ itemId: id, productName: `P${id}`, offerLink: `https://s/${id}`, priceMin: '50' });
  const fetchFalso = (async (_url: any, init: any) => {
    chamadas.push({ corpo: init.body, auth: init.headers.authorization });
    const q = JSON.parse(init.body).query as string;
    if (q.includes('keyword')) return json({ data: { productOfferV2: { nodes: [item(2), item(9)], pageInfo: { hasNextPage: true } } } });
    if (q.includes('page: 1')) return json({ data: { productOfferV2: { nodes: [item(1), item(2)], pageInfo: { hasNextPage: true } } } });
    return json({ data: { productOfferV2: { nodes: [item(3)], pageInfo: { hasNextPage: false } } } });
  }) as typeof fetch;

  const fonte = new FonteShopee({ appId: 'A', secret: 'S', palavras: ['fone "pro"'], paginas: 5 }, fetchFalso);
  const ofertas = await fonte.coletar();

  assert.deepEqual(ofertas.map((o) => o.idProduto), ['1', '2', '3', '9']);
  assert.equal(chamadas.length, 3, 'para de paginar quando hasNextPage é falso');
  assert.ok(JSON.parse(chamadas[2].corpo).query.includes('keyword: "fone \\"pro\\""'), 'palavra-chave com aspas é escapada');
  for (const c of chamadas) {
    const m = /^SHA256 Credential=A, Timestamp=(\d+), Signature=([0-9a-f]{64})$/.exec(c.auth);
    assert.ok(m, 'cabeçalho no formato esperado');
    assert.equal(m[2], assinarShopee('A', 'S', Number(m[1]), c.corpo));
  }
});

test('shopee: erro da API vira mensagem clara', async () => {
  const fetchFalso = (async () => json({ errors: [{ message: 'x', extensions: { code: 10035 } }] })) as typeof fetch;
  await assert.rejects(new FonteShopee({ appId: 'A', secret: 'S' }, fetchFalso).coletar(), /não tem acesso à API.*10035/);
});

// ───────────── Mercado Livre ─────────────

test('ml: link de afiliado acrescenta os parâmetros sem perder os que já existem', () => {
  assert.equal(linkAfiliadoML('https://www.mercadolivre.com.br/p/MLB1', 'meunome', '123'), 'https://www.mercadolivre.com.br/p/MLB1?matt_word=meunome&matt_tool=123');
  assert.equal(
    linkAfiliadoML('https://produto.mercadolivre.com.br/MLB-1-x?a=1&matt_word=outro#polycard', 'meunome', '123'),
    'https://produto.mercadolivre.com.br/MLB-1-x?a=1&matt_word=meunome&matt_tool=123',
  );
});

test('ml: converte produto de catálogo e anúncio comum', () => {
  const p = converterProdutoML(
    { id: 'MLB1', name: 'SSD', pictures: [{ url: 'http://img/a.jpg' }] },
    { price: 399, original_price: 599, shipping: { free_shipping: true } },
    'w', 't',
  );
  assert.deepEqual(p, {
    loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'SSD', preco: 399, precoOriginal: 599, imagem: 'https://img/a.jpg',
    link: 'https://www.mercadolivre.com.br/p/MLB1?matt_word=w&matt_tool=t', freteGratis: true,
  });
  assert.equal(converterProdutoML({ id: 'MLB1', name: 'Sem preço' }, undefined, 'w', 't'), undefined);

  const a = converterAnuncioML({ id: 'MLB2', title: 'Mouse', price: 50, original_price: null, permalink: 'https://produto.mercadolivre.com.br/MLB-2-mouse', thumbnail: 'http://img/m.jpg' }, 'w', 't');
  assert.equal(a?.precoOriginal, undefined);
  assert.equal(a?.link, 'https://produto.mercadolivre.com.br/MLB-2-mouse?matt_word=w&matt_tool=t');
});

function mlFalso(rotas: Record<string, () => Response>) {
  const chamadas: string[] = [];
  const fetchFalso = (async (url: any, init: any) => {
    const caminho = String(url).replace('https://api.mercadolibre.com', '');
    chamadas.push(caminho);
    if (caminho === '/oauth/token') {
      assert.match(init.body, /grant_type=client_credentials&client_id=ID&client_secret=SEG/);
      return json({ access_token: 'TOKEN', expires_in: 21600 });
    }
    assert.equal(init.headers.authorization, 'Bearer TOKEN');
    return (rotas[caminho] ?? (() => json({}, 404)))();
  }) as typeof fetch;
  return { fetchFalso, chamadas };
}

test('ml: coleta destaques, usa /items quando não há buy_box_winner e pula o que dá 403', async () => {
  const { fetchFalso, chamadas } = mlFalso({
    '/highlights/MLB/category/C1': () => json({ content: [{ id: 'MLB1', type: 'PRODUCT' }, { id: 'MLB2', type: 'PRODUCT' }, { id: 'MLB3', type: 'ITEM' }, { id: 'MLB4', type: 'PRODUCT' }] }),
    '/products/MLB1': () => json({ id: 'MLB1', name: 'Com buy box', buy_box_winner: { price: 100, original_price: 150 } }),
    '/products/MLB2': () => json({ id: 'MLB2', name: 'Sem buy box', buy_box_winner: null }),
    '/products/MLB2/items': () => json({ results: [{ price: 80 }, { price: 95 }] }),
    '/items/MLB3': () => json({}, 403),
    '/products/MLB4': () => json({ id: 'MLB4', name: 'Fora do limite', buy_box_winner: { price: 10 } }),
    '/highlights/MLB/category/C2': () => json({}, 404),
  });
  const fonte = new FonteMercadoLivre({ clientId: 'ID', clientSecret: 'SEG', mattWord: 'w', mattTool: 't', categorias: ['C1', 'C2'], porCategoria: 3, intervaloMs: 0 }, fetchFalso);
  const ofertas = await fonte.coletar();

  assert.deepEqual(ofertas.map((o) => [o.idProduto, o.preco, o.precoOriginal]), [['MLB1', 100, 150], ['MLB2', 80, undefined]]);
  assert.equal(chamadas.filter((c) => c === '/oauth/token').length, 1, 'token é reaproveitado');
  assert.ok(!chamadas.includes('/products/MLB4'), 'respeita o limite por categoria');
});

test('ml: avisa quando nenhuma categoria responde e quando o login do app falha', async () => {
  const semAcesso = mlFalso({});
  const fonte = new FonteMercadoLivre({ clientId: 'ID', clientSecret: 'SEG', mattWord: 'w', mattTool: 't', categorias: ['C1'], intervaloMs: 0 }, semAcesso.fetchFalso);
  await assert.rejects(fonte.coletar(), /nenhuma categoria respondeu/);

  const loginRuim = (async () => json({ message: 'invalid client' }, 401)) as typeof fetch;
  const fonte2 = new FonteMercadoLivre({ clientId: 'x', clientSecret: 'y', mattWord: 'w', mattTool: 't', categorias: ['C1'], intervaloMs: 0 }, loginRuim);
  await assert.rejects(fonte2.coletar(), /recusou o login do app \(401\): invalid client/);
});

// ───────────── Amazon ─────────────

test('amazon: extrai ASIN e monta link com a tag', () => {
  assert.equal(extrairAsin('B0CHX1W1XY'), 'B0CHX1W1XY');
  assert.equal(extrairAsin('https://www.amazon.com.br/Echo-Dot/dp/B09B8VGCR8/ref=sr_1_1?keywords=x'), 'B09B8VGCR8');
  assert.equal(extrairAsin('https://www.amazon.com.br/gp/product/B09B8VGCR8?th=1'), 'B09B8VGCR8');
  assert.equal(extrairAsin('https://www.amazon.com.br/s?k=fone'), undefined);
  assert.equal(linkAfiliadoAmazon('https://www.amazon.com.br/dp/B09B8VGCR8?tag=outro-20', 'meu-20'), 'https://www.amazon.com.br/dp/B09B8VGCR8?tag=meu-20');
  assert.equal(linkAfiliadoAmazon('B09B8VGCR8', ''), undefined);
});
