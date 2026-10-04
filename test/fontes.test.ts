import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extrairAsin, linkAfiliadoAmazon } from '../src/fontes/amazon.ts';
import { categoriasDoTurno, converterCartaoML, FonteMercadoLivre, linkAfiliadoML } from '../src/fontes/mercadolivre.ts';
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

const CARTAO_ML = {
  unique_id: 'x',
  metadata: { id: 'MLB2793858589', product_id: 'MLB15345686', url: 'www.mercadolivre.com.br/lavadora-wap/p/MLB15345686', url_fragments: '#polycard_client=offers' },
  pictures: { pictures: [{ id: '694471-MLA96077668763_102025' }] },
  components: [
    { type: 'title', title: { text: 'Lavadora de Alta Pressão WAP' } },
    { type: 'seller', seller: { values: [{ key: 'icon_cockade', type: 'icon' }, { key: 'label', type: 'label', label: { text: 'WAP' } }] } },
    {
      type: 'review_compacted',
      review_compacted: { alt_text: 'Classificação 4.7 de 5 estrelas. Mais de 100mil produtos vendidos.', values: [{ key: 'icon_star_fill', type: 'icon' }, { key: 'label', type: 'label', label: { text: '4.7' } }, { key: 'label2', type: 'label', label: { text: '| +100mil vendidos' } }] },
    },
    {
      type: 'price',
      price: {
        price_labels: [{ values: [{ type: 'price', key: 'previous_price', price: { value: 649, previous: true } }] }],
        current_price: { value: 431.1, currency: 'BRL' },
      },
    },
    { type: 'shipping_v2', shipping_v2: [{ values: [{ type: 'pill', pill: { text: 'Chegará grátis amanhã' } }] }] },
  ],
};

/** Monta uma página de ofertas parecida com a real: o JSON vem em `_n.ctx.r=...;` dentro de um script. */
function paginaDeOfertasML(cartoes: unknown[]): string {
  const dados = { appProps: { pageProps: { data: { items: cartoes.map((card) => ({ card })) } } } };
  const script = `_n.ctx.r=${JSON.stringify(dados)};_n.ctx.r.assets.mainAssetsNames={};`;
  return `<html><body><script type="application/json" id="__NORDIC_RENDERING_CTX__" nonce="abc">${script}</script></body></html>`;
}

test('ml: converte um cartão da página de ofertas (preço, desconto, foto, nota, vendas, frete)', () => {
  const o = converterCartaoML(CARTAO_ML, 'w', 't');
  assert.deepEqual(o, {
    loja: 'mercadolivre',
    idProduto: 'MLB15345686',
    titulo: 'Lavadora de Alta Pressão WAP',
    preco: 431.1,
    precoOriginal: 649,
    desconto: 34,
    imagem: 'https://http2.mlstatic.com/D_Q_NP_2X_694471-MLA96077668763_102025-AB.webp',
    link: 'https://www.mercadolivre.com.br/lavadora-wap/p/MLB15345686?matt_word=w&matt_tool=t',
    nota: 4.7,
    vendas: 100000,
    nomeLoja: 'WAP',
    freteGratis: true,
  });
  assert.equal(converterCartaoML({ ...CARTAO_ML, components: [] }, 'w', 't'), undefined, 'sem título nem preço');
});

test('ml: lê as páginas de ofertas, ignora repetidos e cartões incompletos', async () => {
  const outro = { ...CARTAO_ML, metadata: { ...CARTAO_ML.metadata, id: 'MLB9', product_id: 'MLB99', url: 'www.mercadolivre.com.br/x/p/MLB99' } };
  const chamadas: string[] = [];
  const fetchFalso = (async (url: any, init: any) => {
    chamadas.push(String(url));
    assert.match(init.headers['user-agent'], /Mozilla/);
    const pagina = String(url).includes('page=2') ? [CARTAO_ML, outro] : [CARTAO_ML, { ...CARTAO_ML, components: [] }];
    return new Response(paginaDeOfertasML(pagina), { status: 200 });
  }) as typeof fetch;
  const fonte = new FonteMercadoLivre({ mattWord: 'w', mattTool: 't', paginas: 2, intervaloMs: 0 }, fetchFalso);
  const ofertas = await fonte.coletar();
  assert.deepEqual(chamadas, ['https://www.mercadolivre.com.br/ofertas', 'https://www.mercadolivre.com.br/ofertas?page=2']);
  assert.deepEqual(ofertas.map((o) => o.idProduto), ['MLB15345686', 'MLB99']);
});

test('ml: rodízio de categorias cobre todas, alterna a página e ignora ID inválido', () => {
  const cats = ['MLB1', 'MLB2', 'MLB3', 'MLB4'];
  assert.deepEqual(categoriasDoTurno(cats, 2, 0), [{ categoria: 'MLB1', pagina: 1 }, { categoria: 'MLB2', pagina: 1 }]);
  assert.deepEqual(categoriasDoTurno(cats, 2, 1), [{ categoria: 'MLB3', pagina: 1 }, { categoria: 'MLB4', pagina: 1 }]);
  assert.deepEqual(categoriasDoTurno(cats, 2, 2), [{ categoria: 'MLB1', pagina: 2 }, { categoria: 'MLB2', pagina: 2 }], 'na segunda volta lê a página 2');
  assert.deepEqual(categoriasDoTurno(cats, 2, 4), [{ categoria: 'MLB1', pagina: 1 }, { categoria: 'MLB2', pagina: 1 }], 'e depois recomeça');
  const vistas = new Set(Array.from({ length: 4 }, (_, t) => categoriasDoTurno(cats, 2, t)).flat().map((c) => `${c.categoria}:${c.pagina}`));
  assert.equal(vistas.size, 8, 'em 4 turnos passa por todas as categorias nas duas páginas');
  assert.deepEqual(categoriasDoTurno(['MLB1', 'x&page=9', '../etc'], 3, 0), [{ categoria: 'MLB1', pagina: 1 }], 'só aceita IDs no formato MLB123');
  assert.deepEqual(categoriasDoTurno([], 2, 0), []);
  assert.deepEqual(categoriasDoTurno(cats, 0, 0), []);
});

test('ml: as páginas de categoria saem do mesmo total de pedidos e falha nelas não derruba a rodada', async () => {
  const chamadas: string[] = [];
  const outro = (id: string) => ({ ...CARTAO_ML, metadata: { ...CARTAO_ML.metadata, id, product_id: id, url: `www.mercadolivre.com.br/x/p/${id}` } });
  const fetchFalso = (async (url: any) => {
    const u = String(url);
    chamadas.push(u.replace('https://www.mercadolivre.com.br', ''));
    return new Response(paginaDeOfertasML([outro(`MLB${chamadas.length}00`)]), { status: 200 });
  }) as typeof fetch;
  const opcoes = { mattWord: 'w', mattTool: 't', paginas: 5, categorias: ['MLB1000', 'MLB1051', 'MLB1648', 'MLB5726'], paginasDeCategoria: 2, intervaloMs: 0 };
  const ofertas = await new FonteMercadoLivre({ ...opcoes, agora: () => 0 }, fetchFalso).coletar();
  assert.deepEqual(chamadas, ['/ofertas', '/ofertas?page=2', '/ofertas?page=3', '/ofertas?category=MLB1000', '/ofertas?category=MLB1051'], '5 pedidos no total: 3 gerais e 2 de categoria');
  assert.equal(ofertas.length, 5);

  chamadas.length = 0;
  await new FonteMercadoLivre({ ...opcoes, agora: () => 3 * 25 * 60_000 }, fetchFalso).coletar();
  assert.deepEqual(chamadas.slice(3), ['/ofertas?category=MLB1648&page=2', '/ofertas?category=MLB5726&page=2'], 'outro turno, outras categorias');

  // Categoria barrada: aproveita a vitrine geral e não insiste na categoria seguinte.
  chamadas.length = 0;
  const barraCategoria = (async (url: any) => {
    chamadas.push(String(url));
    return String(url).includes('category=') ? new Response('x', { status: 403 }) : new Response(paginaDeOfertasML([outro(`MLB${chamadas.length}77`)]), { status: 200 });
  }) as typeof fetch;
  const parcial = await new FonteMercadoLivre({ ...opcoes, agora: () => 0 }, barraCategoria).coletar();
  assert.equal(parcial.length, 3);
  assert.equal(chamadas.length, 4, '3 gerais e só 1 tentativa de categoria');

  // Com uma página só, tudo vai para a vitrine geral.
  chamadas.length = 0;
  await new FonteMercadoLivre({ ...opcoes, paginas: 1, agora: () => 0 }, fetchFalso).coletar();
  assert.deepEqual(chamadas, ['/ofertas']);
});

test('ml: avisa quando o site barra o acesso ou muda de formato', async () => {
  const barrado = (async () => new Response('forbidden', { status: 403 })) as typeof fetch;
  await assert.rejects(new FonteMercadoLivre({ mattWord: 'w', mattTool: 't', intervaloMs: 0 }, barrado).coletar(), /não consegui ler a página de ofertas \(o site respondeu 403\)/);
  const semDados = (async () => new Response('<html>nada</html>', { status: 200 })) as typeof fetch;
  await assert.rejects(new FonteMercadoLivre({ mattWord: 'w', mattTool: 't', intervaloMs: 0 }, semDados).coletar(), /sem ofertas legíveis/);
  // Se a primeira página deu certo e a segunda falhou, aproveita o que veio.
  let n = 0;
  const metade = (async () => (++n === 1 ? new Response(paginaDeOfertasML([CARTAO_ML]), { status: 200 }) : new Response('x', { status: 500 }))) as typeof fetch;
  const ofertas = await new FonteMercadoLivre({ mattWord: 'w', mattTool: 't', paginas: 3, intervaloMs: 0 }, metade).coletar();
  assert.equal(ofertas.length, 1);
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
