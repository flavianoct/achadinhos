// Mostra itens reais dos feeds que citam o Mercado Livre (campos do XML), para desenhar a leitura. Só lê.
const FEEDS = ['https://www.adrenaline.com.br/feed/', 'https://canaltech.com.br/rss/', 'https://tecnoblog.net/feed/', 'https://www.tudocelular.com/feed/'];
const cab = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', accept: 'application/rss+xml, application/xml, text/xml, */*' };
for (const url of FEEDS) {
  const xml = await (await fetch(url, { headers: cab, signal: AbortSignal.timeout(15_000) })).text();
  const itens = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  console.log(`\n##### ${url}: ${itens.length} itens; tags do 1º: ${[...new Set((itens[0]?.match(/<[a-z:]+[ >]/gi) ?? []).map((t) => t.trim()))].join(' ')}`);
  let n = 0;
  for (const i of itens) {
    if (!/mercadolivre|meli\.la/i.test(i)) continue;
    const titulo = i.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const precos = [...new Set((i.replace(/<[^>]+>/g, ' ').match(/R\$\s?[\d.]+(?:,\d{2})?/g) ?? []))].slice(0, 6);
    const links = [...new Set(i.match(/https?:\/\/[^"'\s<>\]]*(?:mercadolivre|meli\.la)[^"'\s<>\]]*/gi) ?? [])].map((l) => l.replace(/&(?:amp|#038);/g, '&').slice(0, 140));
    const img = i.match(/<enclosure[^>]+url=["']([^"']+)/i)?.[1] ?? i.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)/i)?.[1] ?? i.match(/<img[^>]+src=["']([^"']+)/i)?.[1];
    console.log(`- ${titulo}\n  precos: ${JSON.stringify(precos)}\n  links(${links.length}): ${JSON.stringify(links.slice(0, 3))}\n  img: ${img}`);
    if (++n >= 6) break;
  }
}
