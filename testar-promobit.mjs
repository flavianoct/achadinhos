// Diagnóstico do Promobit: lê a página (sem tocar o Mercado Livre) e mostra a estrutura das ofertas.
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const cab = { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html,application/xhtml+xml' };

async function ler(url) {
  const r = await fetch(url, { headers: cab, signal: AbortSignal.timeout(20_000) });
  const html = await r.text();
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  console.log(`\n=== ${url} -> HTTP ${r.status}, ${html.length} bytes, __NEXT_DATA__: ${m ? 'sim' : 'não'}`);
  return m ? JSON.parse(m[1]) : undefined;
}

function chaves(o, pref = '', prof = 0) {
  if (!o || typeof o !== 'object' || prof > 3) return;
  for (const [k, v] of Object.entries(o)) {
    const t = Array.isArray(v) ? `array(${v.length})` : typeof v;
    console.log(`${pref}${k}: ${t}`);
    if (v && typeof v === 'object' && !Array.isArray(v)) chaves(v, pref + '  ', prof + 1);
  }
}

for (const url of ['https://www.promobit.com.br/', 'https://www.promobit.com.br/promocoes/loja/mercado-livre/']) {
  let dados;
  try { dados = await ler(url); } catch (e) { console.log(`erro: ${e.message}`); continue; }
  if (!dados) continue;
  const pp = dados.props?.pageProps ?? {};
  console.log('pageProps:'); chaves(pp, '  ', 0);
  const ofertas = [];
  const andar = (o) => { if (!o || typeof o !== 'object') return; if (o.offerId && o.offerTitle) { ofertas.push(o); return; } for (const v of Object.values(o)) andar(v); };
  andar(pp);
  console.log(`ofertas achadas: ${ofertas.length}`);
  const lojas = {};
  for (const o of ofertas) lojas[`${o.storeName}|${o.storeDomain}`] = (lojas[`${o.storeName}|${o.storeDomain}`] ?? 0) + 1;
  console.log('lojas:', JSON.stringify(lojas));
  const ml = ofertas.filter((o) => /mercado ?livre|mercadolivre/i.test(`${o.storeName} ${o.storeDomain}`));
  console.log(`do ML: ${ml.length}`);
  if (ml[0]) console.log('exemplo ML completo:', JSON.stringify(ml[0], null, 1).slice(0, 3000));
  else if (ofertas[0]) console.log('exemplo:', JSON.stringify(ofertas[0], null, 1).slice(0, 3000));
  // Tenta descobrir o link de saída para a loja sem seguir até o ML.
  const alvo = ml[0] ?? ofertas[0];
  if (alvo) {
    for (const saida of [`https://www.promobit.com.br/Redirect/to/${alvo.offerId}/`, `https://www.promobit.com.br/oferta/${alvo.offerSlug}/`]) {
      try {
        const r = await fetch(saida, { headers: cab, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
        const loc = r.headers.get('location');
        console.log(`saida ${saida} -> ${r.status} location=${loc}`);
        if (!loc && r.status === 200) {
          const html = await r.text();
          const links = [...new Set(html.match(/https?:\/\/[^"'\s<>]*(mercadolivre|meli\.la|mercadolibre)[^"'\s<>]*/gi) ?? [])].slice(0, 10);
          console.log('links ML na página:', links);
          const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
          if (m) { const d = JSON.parse(m[1]); console.log('pageProps da oferta:'); chaves(d.props?.pageProps, '  ', 0); const s = JSON.stringify(d.props?.pageProps); const i = s.search(/redirect|offerLink|url/i); console.log('trecho:', s.slice(Math.max(0, i - 200), i + 800)); }
        }
      } catch (e) { console.log(`saida ${saida} erro: ${e.message}`); }
    }
  }
}
