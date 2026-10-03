import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { baixarImagemComoDataUri, hashtagsDaCategoria, montarLegenda, montarRoteiro, montarSvgDoStory, nomeDoCanal, quebrarTexto } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({ BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos' });
const oferta: OfertaAvaliada = {
  loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Chaleira Elétrica 1,8L 1200W <INMA> & Cia', preco: 34.41, precoOriginal: 80, desconto: 57,
  link: 'https://exemplo/x', nota: 4.8, vendas: 5000, freteGratis: true, categoria: 'casa', pontos: 10,
};

test('social: legenda leva preço, canal, aviso de publi e hashtags da categoria', () => {
  const l = montarLegenda(oferta, config);
  assert.match(l, /De R\$ 80,00 por R\$ 34,41 \(-57%\)/);
  assert.match(l, /@topfera_achadinhos/);
  assert.match(l, /Publi: link de afiliado/);
  assert.match(l, /#cozinha/);
  assert.ok(!l.includes('https://exemplo/x'), 'link não vai na legenda, só na bio');
  assert.equal(nomeDoCanal(config), '@topfera_achadinhos');
  assert.ok(hashtagsDaCategoria('inexistente').includes('#achadinhos'));
});

test('social: roteiro tem os 4 blocos de tempo', () => {
  const r = montarRoteiro(oferta, config);
  for (const t of ['0 a 3 s', '3 a 8 s', '8 a 12 s', '12 a 15 s']) assert.ok(r.includes(t), t);
});

test('social: arte do Story é um SVG válido de 1080x1920, com texto escapado e foto embutida', () => {
  const svg = montarSvgDoStory(oferta, 'data:image/png;base64,AAAA', config);
  assert.match(svg, /^<svg[^>]+width="1080" height="1920"/);
  assert.ok(svg.includes('&lt;INMA&gt; &amp; Cia') || svg.includes('&lt;INMA&gt;'), 'título escapado');
  assert.ok(!svg.includes('<INMA>'));
  assert.ok(svg.includes('data:image/png;base64,AAAA'));
  assert.match(svg, /-57%/);
  assert.match(svg, /R\$ 34,41/);
  assert.match(svg, /FRETE GRÁTIS/);
  const semFoto = montarSvgDoStory({ ...oferta, precoOriginal: undefined, desconto: undefined, freteGratis: false }, undefined, config);
  assert.ok(!semFoto.includes('<image'));
  assert.ok(!semFoto.includes('line-through'));
});

test('social: quebra de texto respeita linhas e corta com reticências', () => {
  assert.deepEqual(quebrarTexto('um dois três', 30, 2), ['um dois três']);
  const l = quebrarTexto('palavra1 palavra2 palavra3 palavra4 palavra5 palavra6 palavra7', 20, 2);
  assert.equal(l.length, 2);
  assert.ok(l[1].endsWith('…'));
});

test('social: foto que falha ou não é imagem é ignorada sem derrubar a rodada', async () => {
  const resposta = (status: number, tipo: string, corpo: string) => (async () => new Response(corpo, { status, headers: { 'content-type': tipo } })) as typeof fetch;
  assert.equal(await baixarImagemComoDataUri('http://inseguro/x.png', resposta(200, 'image/png', 'x')), undefined);
  assert.equal(await baixarImagemComoDataUri('https://x/a.png', resposta(404, 'image/png', 'x')), undefined);
  assert.equal(await baixarImagemComoDataUri('https://x/a.png', resposta(200, 'text/html', '<html>')), undefined);
  assert.equal(await baixarImagemComoDataUri('https://x/a.png', (async () => { throw new Error('rede'); }) as typeof fetch), undefined);
  assert.match((await baixarImagemComoDataUri('https://x/a.png', resposta(200, 'image/png', 'abc'))) ?? '', /^data:image\/png;base64,/);
});
