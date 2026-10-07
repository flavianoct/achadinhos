// Mapa da API do Mercado Livre com as chaves do seu app. Roda só no seu PC.
// Lê as chaves de ml-teste.env (ML_CLIENT_ID=... e ML_CLIENT_SECRET=...). Esse arquivo não vai para o GitHub.
// Mostra códigos de resposta, nomes de campos e contagens. Nunca imprime as chaves nem o token.
import { existsSync, readFileSync } from 'node:fs';

if (!existsSync('ml-teste.env')) {
  console.log('Crie o arquivo ml-teste.env nesta pasta com duas linhas:\nML_CLIENT_ID=684292819226465\nML_CLIENT_SECRET=sua_secret_key');
  process.exit(1);
}
const env = Object.fromEntries(readFileSync('ml-teste.env', 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
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
