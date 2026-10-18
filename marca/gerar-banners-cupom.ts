// Gera os banners ilustrativos dos cupons (marca/cupons/cupom-<loja>.png). Roda só quando o desenho mudar: npm run banners-cupom
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svgDoBannerDoCupom } from '../src/moldes.ts';
import { renderizarPng } from '../src/social.ts';

const pasta = join(dirname(fileURLToPath(import.meta.url)), 'cupons');
mkdirSync(pasta, { recursive: true });

for (const loja of ['mercadolivre', 'shopee'] as const) {
  const png = await renderizarPng(svgDoBannerDoCupom(loja), 1280);
  if (!png) throw new Error('O conversor de imagens (@resvg/resvg-js) não está instalado: rode npm install.');
  writeFileSync(join(pasta, `cupom-${loja}.png`), png);
  console.log(`marca/cupons/cupom-${loja}.png (${Math.round(png.length / 1024)} KB)`);
}
