import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { paginaDaBio } from '../src/bio.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({ BLOG_URL: 'https://flavianoct.github.io/achadinhos', BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos' });
const oferta: OfertaAvaliada = {
  loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Chaleira <b>Elétrica</b> 1,8L', preco: 34.41, precoOriginal: 80, desconto: 57,
  link: 'https://produto.mercadolivre.com.br/x?matt_word=topfera', imagem: 'https://img.exemplo/a.png', freteGratis: true, categoria: 'casa', pontos: 10,
};

test('bio: página leva botões do blog e do Telegram, ofertas com link de afiliado e aviso de publi', () => {
  const h = paginaDaBio([oferta], config, new Date('2026-10-03T15:00:00Z'));
  assert.match(h, /href="https:\/\/flavianoct\.github\.io\/achadinhos\/"/);
  assert.match(h, /href="https:\/\/t\.me\/topfera_achadinhos"/);
  assert.match(h, /matt_word=topfera/);
  assert.match(h, /Publi:/);
  assert.match(h, /noindex/);
  assert.ok(!h.includes('<b>Elétrica'), 'título é escapado');
});

test('bio: sem ofertas mostra aviso amigável e ignora links que não são https', () => {
  const h = paginaDaBio([], config, new Date());
  assert.match(h, /estão chegando/);
  const semBlog = paginaDaBio([], lerConfig({}), new Date());
  assert.ok(!semBlog.includes('class="atalho"'));
});
