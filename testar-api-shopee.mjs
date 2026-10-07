// Teste da API de afiliados da Shopee com as chaves do seu app. Roda só no seu PC.
// Lê shopee-teste.env (SHOPEE_APP_ID=... e SHOPEE_SECRET=...). Esse arquivo não vai para o GitHub.
// Mostra códigos, nomes de campos e contagens. Nunca imprime as chaves.
import { existsSync, readFileSync } from 'node:fs';
import { assinarShopee, converterItemShopee } from './src/fontes/shopee.ts';

if (!existsSync('shopee-teste.env')) {
  console.log('Crie o arquivo shopee-teste.env nesta pasta com duas linhas:\nSHOPEE_APP_ID=seu_app_id\nSHOPEE_SECRET=sua_secret');
  process.exit(1);
}
const env = Object.fromEntries(readFileSync('shopee-teste.env', 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const CAMPOS = 'nodes { itemId productName offerLink productLink imageUrl priceMin priceMax priceDiscountRate sales ratingStar commissionRate shopName shopType } pageInfo { page limit hasNextPage }';

async function consultar(rotulo, args) {
  const payload = JSON.stringify({ query: `{ productOfferV2(${args}) { ${CAMPOS} } }` });
  const ts = Math.floor(Date.now() / 1000);
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `SHA256 Credential=${env.SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${assinarShopee(env.SHOPEE_APP_ID ?? '', env.SHOPEE_SECRET ?? '', ts, payload)}` },
    body: payload,
  });
  const j = await r.json().catch(() => ({}));
  if (j.errors?.length) {
    console.log(`FALHA ${r.status}  ${rotulo}\n         código ${j.errors[0].extensions?.code ?? '?'}: ${j.errors[0].message}`);
    return [];
  }
  const nos = j.data?.productOfferV2?.nodes ?? [];
  const ofertas = nos.map(converterItemShopee).filter(Boolean);
  console.log(`OK    ${r.status}  ${rotulo}\n         itens: ${nos.length} | viram oferta: ${ofertas.length} | com desconto: ${ofertas.filter((o) => o.desconto).length} | com nota: ${ofertas.filter((o) => o.nota).length} | com vendas: ${ofertas.filter((o) => o.vendas).length} | com "de" calculado: ${ofertas.filter((o) => o.precoOriginal).length}`);
  const o = ofertas[0];
  if (o) console.log(`         exemplo: ${o.titulo.slice(0, 50)} | R$ ${o.preco}${o.precoOriginal ? ` (de ${o.precoOriginal}, -${o.desconto}%)` : ''} | nota ${o.nota ?? '-'} | vendas ${o.vendas ?? '-'} | link ${String(o.link).slice(0, 28)}…`);
  return ofertas;
}

await consultar('1. melhores desempenhos (listType 2)', 'listType: 2, page: 1, limit: 20');
await consultar('2. busca por palavra, mais vendidos (keyword + sortType 2)', 'keyword: "fone bluetooth", sortType: 2, page: 1, limit: 20');
