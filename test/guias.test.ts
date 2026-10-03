import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gerarBlog } from '../src/blog.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { escolherParaGuia, pontuacaoDoGuia, TIPOS_DE_GUIA, tipoDeGuia } from '../src/guias.ts';
import type { Oferta } from '../src/types.ts';

const AGORA = new Date('2026-10-03T18:00:00Z');
const DIA = 86_400_000;

function fone(n: number, extra: Partial<Oferta> = {}): Oferta {
  return { loja: 'mercadolivre', idProduto: `MLB${n}`, titulo: `Fone de Ouvido Bluetooth Modelo ${n}`, preco: 100 + n * 10, link: `https://www.mercadolivre.com.br/fone-${n}/p/MLB${n}`, nota: 4.6, vendas: 1000 * n, ...extra };
}

test('guias: classifica pelo título e deixa acessórios de fora', () => {
  assert.equal(tipoDeGuia('Fone de Ouvido Bluetooth TWS Sem Fio')?.slug, 'fones-bluetooth');
  assert.equal(tipoDeGuia('Capa para Fone Bluetooth Airpods'), undefined, 'acessório não entra');
  assert.equal(tipoDeGuia('Fritadeira Air Fryer Digital 5L')?.slug, 'air-fryers');
  assert.equal(tipoDeGuia('Forro Descartável para Air Fryer'), undefined);
  assert.equal(tipoDeGuia('Robô Aspirador de Pó Wi-Fi')?.slug, 'aspiradores-robo');
  assert.equal(tipoDeGuia('Aspirador de Pó Vertical sem Fio')?.slug, 'aspiradores-de-po');
  assert.equal(tipoDeGuia('Smart TV 50 polegadas 4K')?.slug, 'smart-tvs');
  assert.equal(tipoDeGuia('Suporte para Smart TV'), undefined);
  assert.equal(tipoDeGuia('Camiseta Básica'), undefined);
  assert.equal(new Set(TIPOS_DE_GUIA.map((t) => t.slug)).size, TIPOS_DE_GUIA.length, 'slugs únicos');
  assert.ok(TIPOS_DE_GUIA.every((t) => /^[a-z0-9-]+$/.test(t.slug) && t.criterios.length >= 4));
});

test('guias: ordena por nota, vendas e preço; calcula selos só com dados reais; ignora nota baixa e repetidos', () => {
  const tipo = tipoDeGuia(fone(1).titulo)!;
  const vistoEm = AGORA.getTime();
  const candidatos = [
    { oferta: fone(1, { nota: 4.9, vendas: 50, preco: 300 }), vistoEm },
    { oferta: fone(2, { nota: 4.7, vendas: 90000, preco: 150 }), vistoEm },
    { oferta: fone(3, { nota: 4.4, vendas: 2000, preco: 80 }), vistoEm },
    { oferta: fone(4, { nota: 3.9, vendas: 500000, preco: 20 }), vistoEm },
    { oferta: fone(5, { nota: 4.5, vendas: 700, preco: 200 }), vistoEm },
    { oferta: fone(6, { nota: 4.6, vendas: 3000, preco: 120 }), vistoEm },
    { oferta: fone(2, { nota: 4.7, vendas: 90000, preco: 140 }), vistoEm: vistoEm + 1 },
  ];
  const itens = escolherParaGuia(candidatos, tipo);
  assert.equal(itens.length, 5, 'Top 5');
  assert.ok(!itens.some((i) => i.idProduto === 'MLB4'), 'nota 3,9 fica de fora, mesmo com muitas vendas');
  assert.equal(itens[0]!.idProduto, 'MLB2');
  assert.equal(itens.find((i) => i.idProduto === 'MLB2')!.preco, 140, 'vale a versão mais recente do produto');
  assert.deepEqual(itens[0]!.destaques.slice(0, 2), ['Melhor custo-benefício', 'Mais vendido']);
  assert.ok(itens.find((i) => i.idProduto === 'MLB1')!.destaques.includes('Melhor avaliado'));
  assert.ok(itens.find((i) => i.idProduto === 'MLB3')!.destaques.includes('Mais barato da lista'));
  assert.equal(escolherParaGuia(candidatos.slice(0, 2), tipo).length, 0, 'com menos de 3 produtos não há guia');
  assert.ok(pontuacaoDoGuia(fone(1, { nota: 4.8, vendas: 10000 })) > pontuacaoDoGuia(fone(1, { nota: 4.4, vendas: 100 })));
});

test('guias: a página sai com tabela, comparativo, perguntas frequentes, dados estruturados, sitemap e links', async () => {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 5; i++) banco.guardarParaGuia('fones-bluetooth', fone(i), new Date(AGORA.getTime() - i * 3_600_000));
  for (let i = 1; i <= 3; i++) banco.guardarParaGuia('air-fryers', { ...fone(i), idProduto: `AF${i}`, titulo: `Air Fryer ${i}L Digital` }, AGORA);
  const dir = mkdtempSync(join(tmpdir(), 'guias-'));
  const config = lerConfig({ BLOG_PASTA: dir, BLOG_URL: 'https://exemplo.github.io/achados', BLOG_IA: 'nenhuma' });

  const r = await gerarBlog(banco, config, AGORA);
  assert.equal(r.guias, 2);
  for (const a of ['melhores-fones-bluetooth.html', 'melhores-air-fryers.html', 'guias.html']) assert.ok(existsSync(join(dir, a)), a);

  const html = readFileSync(join(dir, 'melhores-fones-bluetooth.html'), 'utf8');
  assert.match(html, /<h1>Melhores fones de ouvido bluetooth de 2026: top 5 comparados<\/h1>/);
  assert.equal((html.match(/<li class="cartao( primeiro)?">/g) ?? []).length, 5);
  assert.ok(html.includes('<table>') && html.includes('Comparativo rápido') && html.includes('Melhor custo-benefício'));
  assert.ok(html.includes('O que observar antes de comprar') && html.includes('Autonomia da bateria'));
  assert.ok(html.includes('Perguntas frequentes') && html.includes('preço visto em 03/10/2026'));
  assert.ok(html.includes('<a href="melhores-air-fryers.html">'), 'link para outro guia');
  assert.ok(html.includes('<link rel="canonical" href="https://exemplo.github.io/achados/melhores-fones-bluetooth.html">'));
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1])['@graph'];
  assert.deepEqual(ld.map((x: any) => x['@type']), ['Article', 'ItemList', 'FAQPage', 'BreadcrumbList']);
  assert.equal(ld[1].itemListElement[0].item['@type'], 'Product');
  assert.equal(ld[1].itemListElement[0].item.offers.priceCurrency, 'BRL');
  assert.deepEqual(ld[3].itemListElement.map((x: any) => x.name), ['Início', 'Guias', 'Melhores fones de ouvido bluetooth de 2026: top 5 comparados']);
  assert.ok(html.includes('name="twitter:card"') && html.includes('property="og:site_name"') && html.includes('class="escolhas"'), 'redes sociais e resumo das escolhas');
  assert.equal(ld[1].numberOfItems, 5);
  assert.equal(ld[2].mainEntity.length, 3);
  assert.ok((html.match(/rel="sponsored nofollow noopener"/g) ?? []).length >= 10, 'tabela, escolhas e cartões usam rel sponsored');

  const air = readFileSync(join(dir, 'melhores-air-fryers.html'), 'utf8');
  assert.match(air, /top 3 comparados/);

  assert.match(readFileSync(join(dir, 'guias.html'), 'utf8'), /Guias de compra[\s\S]*Melhores air fryers/);
  const inicio = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(inicio.includes('Guias de compra') && inicio.includes('href="guias.html"'));
  const mapa = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
  assert.ok(mapa.includes('/melhores-fones-bluetooth.html') && mapa.includes('/guias.html') && mapa.includes('/sobre.html') && mapa.includes('/privacidade.html'));
  assert.ok(readFileSync(join(dir, 'sobre.html'), 'utf8').includes('Como escolhemos os produtos') && readFileSync(join(dir, 'privacidade.html'), 'utf8').includes('rel="sponsored"'));
  assert.ok(readFileSync(join(dir, 'robots.txt'), 'utf8').includes('Sitemap:'));
});

test('guias: sem produtos novos o guia continua no ar com a última versão boa', async () => {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 5; i++) banco.guardarParaGuia('fones-bluetooth', fone(i), AGORA);
  const dir = mkdtempSync(join(tmpdir(), 'guias-'));
  const config = lerConfig({ BLOG_PASTA: dir, BLOG_IA: 'nenhuma' });
  await gerarBlog(banco, config, AGORA);

  const depois = new Date(AGORA.getTime() + 20 * DIA); // tudo vencido: o acervo não tem nada recente
  const r = await gerarBlog(banco, config, depois);
  assert.equal(r.guias, 1);
  const html = readFileSync(join(dir, 'melhores-fones-bluetooth.html'), 'utf8');
  assert.match(html, /top 5 comparados/);
  assert.ok(html.includes('preço visto em 03/10/2026'));

  banco.limpar(new Date(AGORA.getTime() + 40 * DIA));
  assert.deepEqual(banco.tiposComProdutos(365, new Date(AGORA.getTime() + 40 * DIA)), [], 'acervo antigo é limpo');
  assert.equal(banco.guiasSalvos().length, 1, 'o guia publicado não é apagado pela faxina');
});

test('gemini: pede no formato compatível, com a chave, e explica recusas', async () => {
  const { pedirAoGemini } = await import('../src/blog.ts');
  let visto: any;
  const ok = (async (url: string, init: any) => {
    visto = { url, auth: init.headers.authorization, corpo: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Texto do Gemini' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await pedirAoGemini('CHAVE', 'gemini-3.8-flash', 'oi', ok), 'Texto do Gemini');
  assert.match(visto.url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/);
  assert.equal(visto.auth, 'Bearer CHAVE');
  assert.equal(visto.corpo.model, 'gemini-3.8-flash');
  const recusa = (async () => new Response('{"error":"API key not valid"}', { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(pedirAoGemini('x', 'm', 'oi', recusa), /GEMINI_API_KEY/);
});
