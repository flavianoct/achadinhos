// Sonda de feeds RSS de ofertas: diz quais respondem, quantos itens trazem e quantos citam o Mercado Livre.
// Só lê os feeds (nada é postado nem gravado) e nunca abre página do ML.
const CAND = [
  'https://www.adrenaline.com.br/feed/', 'https://www.adrenaline.com.br/ofertas/feed/', 'https://www.adrenaline.com.br/promocoes/feed/',
  'https://canaltech.com.br/rss/', 'https://canaltech.com.br/rss/ofertas/', 'https://canaltech.com.br/rss/cupons/',
  'https://tecnoblog.net/feed/', 'https://tecnoblog.net/categoria/ofertas/feed/', 'https://tecnoblog.net/tag/ofertas/feed/',
  'https://www.promobit.com.br/rss/', 'https://www.promobit.com.br/feed/',
  'https://www.pelando.com.br/rss', 'https://gatry.com/feed/', 'https://gatry.com/rss',
  'https://www.hardmob.com.br/external.php?type=RSS2&forumids=407', 'https://www.gizmodo.com.br/feed/',
  'https://www.tudocelular.com/feed/', 'https://olhardigital.com.br/feed/', 'https://www.tecmundo.com.br/rss', 'https://www.techtudo.com.br/rss/',
];
const cab = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', accept: 'application/rss+xml, application/xml, text/xml, */*' };
for (const url of CAND) {
  try {
    const r = await fetch(url, { headers: cab, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    const xml = await r.text();
    const itens = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
    const ml = itens.filter((i) => /mercado\s?livre|mercadolivre|meli\.la/i.test(i));
    const preco = itens.filter((i) => /R\$\s?\d/.test(i)).length;
    const mlLinks = ml.flatMap((i) => i.match(/https?:\/\/[^"'\s<>\]]*(?:mercadolivre|meli\.la)[^"'\s<>\]]*/gi) ?? []).slice(0, 2);
    console.log(`${r.status} ${url} -> ${itens.length} itens, ${preco} com R$, ${ml.length} citam ML ${mlLinks.length ? JSON.stringify(mlLinks) : ''}`);
    if (ml[0]) console.log('   ex:', (ml[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 120));
  } catch (e) { console.log(`ERRO ${url}: ${e.message}`); }
}
