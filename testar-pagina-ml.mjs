// Testa se a página pública de ofertas do Mercado Livre abre a partir daqui (GitHub Actions):
// 1) pedido simples (como o robô faz hoje); 2) navegador de verdade (Chromium headless), se o Playwright estiver instalado.
// Mostra o código HTTP, se caiu em captcha/login e quantas ofertas deu para ler. Não posta nada e não grava nada.
import { extrairCartoesML, converterCartaoML } from './src/fontes/mercadolivre.ts';

const URLS = ['https://www.mercadolivre.com.br/ofertas', 'https://www.mercadolivre.com.br/ofertas?page=2'];
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function resumo(html, urlFinal) {
  const cartoes = extrairCartoesML(html);
  const ofertas = cartoes.map((c) => converterCartaoML(c, 'teste', '0')).filter(Boolean);
  const titulo = /<title>([^<]*)/i.exec(html)?.[1]?.trim();
  const barrado = /captcha|account-verification|negative_traffic|suspicious/i.test(urlFinal + html.slice(0, 20000));
  return { titulo, tamanho: html.length, urlFinal, cartoes: cartoes.length, ofertas: ofertas.length, barrado, exemplo: ofertas[0] ? { titulo: ofertas[0].titulo, preco: ofertas[0].preco, imagem: ofertas[0].imagem, link: ofertas[0].link } : undefined };
}

console.log('== 1) Pedido simples (fetch) ==');
for (const url of URLS) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': NAVEGADOR, 'accept-language': 'pt-BR,pt;q=0.9', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    const html = await r.text();
    console.log(url, '->', r.status, JSON.stringify(resumo(html, r.url)));
  } catch (e) {
    console.log(url, '-> erro', e.message);
  }
}

console.log('\n== 2) Navegador de verdade (Chromium headless) ==');
let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.log('Playwright não instalado; pulando.');
}
if (playwright) {
  const browser = await playwright.chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ userAgent: NAVEGADOR, locale: 'pt-BR', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  for (const url of URLS) {
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(2500);
      const html = await page.content();
      console.log(url, '->', r?.status(), JSON.stringify(resumo(html, page.url())));
    } catch (e) {
      console.log(url, '-> erro', e.message);
    }
  }
  await browser.close();
}
