// Diagnóstico do Promobit: lê a página (sem tocar o Mercado Livre) e mostra a estrutura das ofertas.
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const cab = { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html,application/xhtml+xml' };

async function ler(url) {
  const r = await fetch(url, { headers: cab, signal: AbortSignal.timeout(20_000) });
  const html = await r.text();
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  console.log(`\n=== ${url} -> HTTP ${r.status}, ${html.length} bytes, __NEXT_DATA__: ${m ? 'sim' : 'não'}`);
  return { dados: m ? JSON.parse(m[1]) : undefined, html };
}

const pega = (o, ks) => Object.fromEntries(ks.map((k) => [k, o?.[k]]));

for (const url of ['https://www.promobit.com.br/', 'https://www.promobit.com.br/promocoes/loja/mercado-livre/', 'https://www.promobit.com.br/promocoes/loja/mercado-livre/?page=2']) {
  let dados;
  try { ({ dados } = await ler(url)); } catch (e) { console.log(`erro: ${e.message}`); continue; }
  if (!dados) continue;
  const pp = dados.props?.pageProps ?? {};
  console.log('pageProps chaves:', Object.keys(pp).join(', '));
  const ofertas = [];
  const andar = (o, cam) => { if (!o || typeof o !== 'object') return; if (o.offerId && o.offerTitle) { ofertas.push({ ...o, _cam: cam }); return; } for (const [k, v] of Object.entries(o)) andar(v, cam ? `${cam}.${k.replace(/^\d+$/, '#')}` : k); };
  andar(pp, '');
  const caminhos = {}; for (const o of ofertas) caminhos[o._cam] = (caminhos[o._cam] ?? 0) + 1;
  console.log(`ofertas: ${ofertas.length}; caminhos: ${JSON.stringify(caminhos)}`);
  const ml = ofertas.filter((o) => o.storeDomain === 'mercadolivre.com.br' && o.offerPrice > 0);
  console.log(`ML com preço: ${ml.length}`);
  for (const o of ml.slice(0, 5)) console.log(JSON.stringify(pega(o, ['offerId', 'offerTitle', 'offerPrice', 'offerOldPrice', 'offerDiscontPercentage', 'offerPhoto', 'offerSlug', 'offerCoupon', 'offerPublished', 'offerStatusName'])));
  if (url.includes('page=2')) continue;
  for (const o of ml.slice(0, 3)) {
    try {
      const { dados: d, html } = await ler(`https://www.promobit.com.br/oferta/${o.offerSlug}/`);
      const s = d?.props?.pageProps?.serverOffer;
      console.log('serverOffer:', JSON.stringify(pega(s, ['offerUrl', 'offerUrlClean', 'offerPhoto', 'offerPrice', 'offerOldPrice', 'storeMarketplace', 'referencePrices', 'marketplaceRate', 'offerCta', 'offerType'])).slice(0, 1500));
      const links = [...new Set(html.match(/https?:\\?\/\\?\/[^"'\s<>]*(mercadolivre|meli\.la|mercadolibre)[^"'\s<>]*/gi) ?? [])].slice(0, 8);
      console.log('links ML no html:', links);
    } catch (e) { console.log(`oferta erro: ${e.message}`); }
    try {
      const r = await fetch(`https://www.promobit.com.br/Redirect/to/${o.offerId}/`, { headers: cab, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      const corpo = r.status === 200 ? (await r.text()) : '';
      const alvo = /(?:window\.location(?:\.href)?\s*=\s*|url=|href=)["']?([^"'\s>]+)/i.exec(corpo)?.[1];
      console.log(`Redirect/to -> ${r.status} location=${r.headers.get('location')} alvo=${alvo} trecho=${corpo.replace(/\s+/g, ' ').slice(0, 300)}`);
    } catch (e) { console.log(`redirect erro: ${e.message}`); }
  }
}
