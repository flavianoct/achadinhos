// Teste da API do Mercado Livre com as chaves do seu app. Roda só no seu PC.
// Lê as chaves de ml-teste.env (duas linhas: ML_CLIENT_ID=... e ML_CLIENT_SECRET=...). Esse arquivo não vai para o GitHub.
// Mostra apenas os códigos de resposta e o que veio de produtos; nunca imprime as chaves.
import { existsSync, readFileSync } from 'node:fs';

if (!existsSync('ml-teste.env')) {
  console.log('Crie o arquivo ml-teste.env nesta pasta com duas linhas:\nML_CLIENT_ID=seu_app_id\nML_CLIENT_SECRET=sua_secret_key');
  process.exit(1);
}
const env = Object.fromEntries(readFileSync('ml-teste.env', 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const API = 'https://api.mercadolibre.com';
const mostrar = (rotulo, r, extra = '') => console.log(`${r.status === 200 ? 'OK   ' : 'FALHA'} ${r.status}  ${rotulo}${extra ? '  ' + extra : ''}`);

const t = await fetch(`${API}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.ML_CLIENT_ID ?? '', client_secret: env.ML_CLIENT_SECRET ?? '' }),
});
const tj = await t.json().catch(() => ({}));
mostrar('token do app (oauth/token)', t, t.ok ? '' : `${tj.error ?? ''} ${tj.message ?? ''}`.trim());
if (!tj.access_token) process.exit(1);
const H = { authorization: `Bearer ${tj.access_token}`, accept: 'application/json' };

const h = await fetch(`${API}/highlights/MLB/category/MLB1000`, { headers: H });
const hj = await h.json().catch(() => ({}));
const tipos = {};
for (const c of hj.content ?? []) tipos[c.type] = (tipos[c.type] ?? 0) + 1;
mostrar('mais vendidos de Eletrônicos (/highlights)', h, h.ok ? `tipos: ${JSON.stringify(tipos)}` : `${hj.error ?? ''} ${hj.message ?? ''}`.trim());

const id = (hj.content ?? []).find((c) => c.type === 'ITEM')?.id;
if (id) {
  const i = await fetch(`${API}/items/bulk?ids=${id}`, { headers: H });
  const ij = await i.json().catch(() => []);
  const b = ij?.[0]?.body ?? {};
  mostrar('detalhes do item (/items/bulk)', i, i.ok ? `${String(b.title).slice(0, 40)} | R$ ${b.price} | vendidos ${b.sold_quantity}` : '');
  const r = await fetch(`${API}/reviews/item/${id}`, { headers: H });
  const rj = await r.json().catch(() => ({}));
  mostrar('nota do item (/reviews/item)', r, r.ok ? `média ${rj.rating_average}` : '');
} else if (h.ok) {
  console.log('Os mais vendidos vieram em outro formato (sem ITEM). Me mande a linha "tipos" acima.');
}
