// Gera o banner da mensagem "perdeu alguma oferta hoje?" (marca/blog/blog-ofertas.png). Roda só quando o desenho mudar: npm run banner-blog
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svgDoBannerDoBlog } from '../src/moldes.ts';
import { renderizarPng } from '../src/social.ts';

const pasta = join(dirname(fileURLToPath(import.meta.url)), 'blog');
mkdirSync(pasta, { recursive: true });
const png = await renderizarPng(svgDoBannerDoBlog(), 1280);
if (!png) throw new Error('O conversor de imagens (@resvg/resvg-js) não está instalado: rode npm install.');
writeFileSync(join(pasta, 'blog-ofertas.png'), png);
console.log(`marca/blog/blog-ofertas.png (${Math.round(png.length / 1024)} KB)`);
