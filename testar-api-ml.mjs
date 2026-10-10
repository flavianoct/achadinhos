// Mapa da API do Mercado Livre com as chaves do seu app. Roda no seu PC ou no GitHub Actions ("Diagnosticar API do Mercado Livre").
// As chaves vêm de ml-teste.env (ML_CLIENT_ID=... e ML_CLIENT_SECRET=..., arquivo que não vai para o GitHub)
// ou, se esse arquivo não existir, das variáveis de ambiente ML_CLIENT_ID e ML_CLIENT_SECRET (os Secrets do Actions).
// Mostra códigos de resposta, nomes de campos e contagens. Nunca imprime as chaves nem o token.
import { existsSync, readFileSync } from 'node:fs';

let env;
if (existsSync('ml-teste.env')) {
  env = Object.fromEntries(readFileSync('ml-teste.env', 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
} else if (process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET) {
  env = { ML_CLIENT_ID: process.env.ML_CLIENT_ID, ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET };
} else {
  console.log('Crie o arquivo ml-teste.env nesta pasta com duas linhas:\nML_CLIENT_ID=o_id_do_app\nML_CLIENT_SECRET=sua_secret_key\n(ou defina as variáveis ML_CLIENT_ID e ML_CLIENT_SECRET).');
  process.exit(1);
}
const API = 'https://api.mercadolibre.com';
const ok = (r) => (r.ok ? 'OK   ' : 'FALHA');
const chaves = (o, n = 14) => Object.keys(o ?? {}).slice(0, n).join(',');
const json = async (r) => r.json().catch(() => ({}));
const linha = (rotulo, r, extra = '') => console.log(`${ok(r)} ${r.status}  ${rotulo}${extra ? '\n         ' + extra : ''}`);

const t = await fetch(`${API}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.ML_CLIENT_ID ?? '', client_secret: env.ML_CLIENT_SECRET ?? '' }),
});
const tj = await json(t);
linha('1. token do app (/oauth/token)', t, t.ok ? '' : `${tj.error ?? ''} ${tj.message ?? ''}`.trim());
if (!tj.access_token) process.exit(1);
const H = { authorization: `Bearer ${tj.access_token}`, accept: 'application/json' };
const get = (caminho) => fetch(`${API}${caminho}`, { headers: H });

// 2. Mais vendidos de uma categoria
const h = await get('/highlights/MLB/category/MLB1000');
const hj = await json(h);
const tipos = {};
for (const c of hj.content ?? []) tipos[c.type] = (tipos[c.type] ?? 0) + 1;
linha('2. mais vendidos da categoria (/highlights/MLB/category/MLB1000)', h, h.ok ? `tipos: ${JSON.stringify(tipos)}` : `${hj.error ?? ''} ${hj.message ?? ''}`.trim());

// 3. Produto de catálogo
const idProduto = (hj.content ?? []).find((c) => c.type === 'PRODUCT')?.id;
let itemId;
if (idProduto) {
  const p = await get(`/products/${idProduto}`);
  const pj = await json(p);
  const v = pj.buy_box_winner;
  linha(`3. produto de catálogo (/products/${idProduto})`, p, p.ok ? `campos: ${chaves(pj, 16)}\n         nome: ${String(pj.name).slice(0, 50)} | fotos: ${pj.pictures?.length ?? 0} | permalink: ${pj.permalink ? 'sim' : 'não'} | filhos: ${pj.children_ids?.length ?? 0}\n         vencedor: ${v ? `preço ${v.price} | de ${v.original_price ?? '-'} | condição ${v.condition} | frete grátis ${v.shipping?.free_shipping} | campos: ${chaves(v, 10)}` : 'NÃO TEM (produto sem anúncio vencedor)'}` : `${pj.error ?? ''} ${pj.message ?? ''}`.trim());
  itemId = v?.item_id;
  if (!itemId) {
    const l = await get(`/products/${idProduto}/items?limit=1`);
    const lj = await json(l);
    linha(`3b. anúncios do produto (/products/${idProduto}/items)`, l, l.ok ? `resultados: ${lj.results?.length ?? 0} | campos: ${chaves(lj.results?.[0], 10)}` : '');
    itemId = lj.results?.[0]?.item_id;
  }
}

// 4. Anúncio (vendas)
if (itemId) {
  const i = await get(`/items/${itemId}`);
  const ij = await json(i);
  linha(`4. anúncio (/items/${itemId})`, i, i.ok ? `vendidos (sold_quantity): ${ij.sold_quantity ?? 'AUSENTE'} | preço ${ij.price} | status ${ij.status} | campos: ${chaves(ij, 12)}` : `${ij.error ?? ''} ${ij.message ?? ''}`.trim());
  const b = await get(`/items/bulk?ids=${itemId}`);
  const bj = await json(b);
  linha('4b. anúncio em lote (/items/bulk)', b, b.ok ? `itens com dados: ${(Array.isArray(bj) ? bj : []).filter((x) => x?.body?.id).length} | status_code: ${bj?.[0]?.status_code ?? bj?.[0]?.code}` : '');
  // 5. Nota
  const r = await get(`/reviews/item/${itemId}`);
  const rj = await json(r);
  linha(`5. avaliações (/reviews/item/${itemId})`, r, r.ok ? `média: ${rj.rating_average ?? 'AUSENTE'} | total de avaliações: ${rj.paging?.total ?? '-'} | campos: ${chaves(rj, 8)}` : '');
} else {
  console.log('FALHA ---  4/5. sem anúncio para consultar vendas e nota (o produto não trouxe vencedor nem lista de anúncios)');
}

// 6. Tendências (termos de busca)
const tr = await get('/trends/MLB');
const trj = await json(tr);
linha('6. tendências (/trends/MLB)', tr, tr.ok && Array.isArray(trj) ? `termos: ${trj.length} | exemplo: ${trj[0]?.keyword ?? '-'}` : '');

// ───────── Fase 1 do plano: outros recursos que podem trazer mais produtos, nota e vendas ─────────
const palavra = 'celular';
const sondar = async (rotulo, caminho, descrever) => {
  try {
    const r = await get(caminho);
    const j = await json(r);
    let extra = '';
    try {
      extra = r.ok ? descrever(j) : `${j.error ?? ''} ${j.message ?? ''}`.trim();
    } catch (e) {
      extra = `(resposta em formato inesperado: ${e.message})`;
    }
    linha(rotulo, r, extra);
    return { r, j };
  } catch (e) {
    console.log(`FALHA ---  ${rotulo}\n         sem resposta: ${e.message}`);
    return {};
  }
};

console.log('\n--- busca e descoberta ---');
await sondar(`7. busca por palavra (/sites/MLB/search?q=${palavra})`, `/sites/MLB/search?q=${palavra}&limit=3`, (j) => `resultados: ${j.results?.length ?? 0} de ${j.paging?.total ?? '-'} | campos: ${chaves(j.results?.[0], 12)}`);
await sondar(`8. busca de produtos de catálogo (/products/search?q=${palavra})`, `/products/search?status=active&site_id=MLB&q=${palavra}&limit=3`, (j) => `resultados: ${j.results?.length ?? 0} de ${j.paging?.total ?? '-'} | campos: ${chaves(j.results?.[0], 10)}`);
await sondar(`9. palavra para categoria (/sites/MLB/domain_discovery/search?q=${palavra})`, `/sites/MLB/domain_discovery/search?q=${palavra}&limit=3`, (j) => `sugestões: ${Array.isArray(j) ? j.length : 0} | exemplo: ${j?.[0]?.category_id ?? '-'} ${j?.[0]?.category_name ?? ''}`);

console.log('\n--- categorias ---');
const cats = await sondar('10. categorias do site (/sites/MLB/categories)', '/sites/MLB/categories', (j) => `categorias: ${Array.isArray(j) ? j.length : 0} | exemplo: ${j?.[0]?.id ?? '-'} ${j?.[0]?.name ?? ''}`);
const cat = await sondar('11. uma categoria (/categories/MLB1000)', '/categories/MLB1000', (j) => `subcategorias: ${j.children_categories?.length ?? 0} | campos: ${chaves(j, 10)}`);
const filha = cat.j?.children_categories?.[0]?.id;
if (filha) {
  await sondar(`12. mais vendidos de uma subcategoria (/highlights/MLB/category/${filha})`, `/highlights/MLB/category/${filha}`, (j) => {
    const t = {};
    for (const c of j.content ?? []) t[c.type] = (t[c.type] ?? 0) + 1;
    return `tipos: ${JSON.stringify(t)}`;
  });
} else {
  console.log('FALHA ---  12. sem subcategoria para testar o /highlights de subcategoria');
}

console.log('\n--- anúncios e avaliações ---');
if (itemId) {
  await sondar(`13. vários anúncios de uma vez (/items?ids=${itemId})`, `/items?ids=${itemId}&attributes=id,price,sold_quantity,status`, (j) => `itens: ${Array.isArray(j) ? j.length : 0} | status_code: ${j?.[0]?.code ?? j?.[0]?.status_code ?? '-'} | campos: ${chaves(j?.[0]?.body, 8)}`);
} else {
  console.log('FALHA ---  13. sem anúncio para testar o multiget (/items?ids=)');
}
console.log('\nPronto. Cole a tabela acima no plano: os códigos HTTP decidem a Fase 2.');
