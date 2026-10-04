import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gerarBlog } from '../src/blog.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { EXPLICACOES_DOS_CRITERIOS } from '../src/dicas.ts';
import { chaveDoModelo, escolherParaGuia, notaAjustada, pontuacaoDoGuia, tamanhoDoGuia, TIPOS_DE_GUIA, tipoDeGuia } from '../src/guias.ts';
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

test('guias: o nome do produto precisa estar no começo do título; anúncio com palavras de busca empilhadas não entra', () => {
  const controle = 'Controle Sem Fio Joystick Genérico Bluetooth Compatível Para Ps4 Videogame Tv Samsung Pc P4 Ps 4 Manete Pc Gamer Tv Smart Controle Bluetooth Celular Headset Sem Fio Com P2 Marca Redfin';
  assert.equal(tipoDeGuia(controle), undefined, 'o controle de PS4 não é celular, nem fone, nem headset');
  assert.equal(tipoDeGuia('Smartphone Samsung Galaxy A36 5g 128gb')?.slug, 'celulares');
  assert.equal(tipoDeGuia('Samsung Galaxy A07 128gb 4gb Ram Preto')?.slug, 'celulares', 'o nome pode vir depois da marca');
  assert.equal(tipoDeGuia('Motorola Moto G56 5g - 256g')?.slug, 'celulares');
  assert.equal(tipoDeGuia('Fone de Ouvido Bluetooth TWS Esportivo à Prova d Água')?.slug, 'fones-bluetooth');
  assert.equal(tipoDeGuia('Kit Suporte Universal Veicular para Celular Smartphone'), undefined, 'acessório');
  assert.equal(tipoDeGuia('Relógio Smartwatch Esportivo Compatível com Celular Android iPhone')?.slug, 'smartwatches', 'o produto é o relógio, não o celular citado depois');
  assert.equal(tipoDeGuia('Mouse Gamer Sem Fio Recarregável Compatível com Notebook')?.slug, 'mouses-gamer');

  // Um item que já estava no guia mas não passa mais na classificação sai da lista.
  const tipo = tipoDeGuia(fone(1).titulo)!;
  const vistoEm = AGORA.getTime();
  const lixo = { oferta: fone(99, { titulo: controle, nota: 5, vendas: 900000 }), vistoEm };
  const lista = [1, 2, 3, 4, 5].map((n) => ({ oferta: fone(n), vistoEm }));
  const itens = escolherParaGuia([...lista, lixo], tipo, { anteriores: ['mercadolivre:MLB99', ...[1, 2, 3, 4].map((n) => `mercadolivre:MLB${n}`)] });
  assert.ok(!itens.some((i) => i.idProduto === 'MLB99'), 'o veterano fora do tipo é removido, mesmo com nota e vendas altíssimas');
  assert.equal(itens.length, 5);
});

test('guias: o mesmo modelo anunciado duas vezes aparece uma vez só, e modelos diferentes continuam todos', () => {
  const tipo = tipoDeGuia('Smartphone Samsung Galaxy A36 5g')!;
  const vistoEm = AGORA.getTime();
  const cel = (n: number, titulo: string, extra: Partial<Oferta> = {}): { oferta: Oferta; vistoEm: number } => ({ oferta: { loja: 'mercadolivre', idProduto: `CEL${n}`, titulo, preco: 900 + n, link: `https://x/${n}`, nota: 4.7, vendas: 1000 + n, ...extra }, vistoEm });
  const lista = [
    cel(1, 'Smartphone Samsung Galaxy A36 5g 128gb 6gb Ram Câmera Tripla De Até 50mp', { vendas: 90000 }),
    cel(2, 'Smartphone Samsung Galaxy A36 5g 128gb 6gb Ram Câmera Tripla De Até 50mp Preto', { vendas: 500 }),
    cel(3, 'Samsung Galaxy A17 5g 128gb'),
    cel(4, 'Smartphone Motorola Moto G56 5g 256gb'),
    cel(5, 'Celular Xiaomi Redmi Note 14 256gb'),
    cel(6, 'Poco X8 Pro 512gb 12gb Ram'),
  ];
  const itens = escolherParaGuia(lista, tipo);
  assert.equal(itens.filter((i) => /A36/.test(i.titulo)).length, 1, 'o A36 aparece uma vez');
  assert.equal(itens.find((i) => /A36/.test(i.titulo))!.idProduto, 'CEL1', 'e fica o anúncio de maior pontuação');
  assert.equal(itens.length, 5, 'os outros quatro modelos continuam');
  assert.equal(chaveDoModelo('Smartphone Samsung Galaxy A36 5g 128gb 6gb Ram'), chaveDoModelo('Celular Samsung Galaxy A36 5G 128GB 6GB Preto'));
  assert.notEqual(chaveDoModelo('Samsung Galaxy A36 5g 128gb'), chaveDoModelo('Samsung Galaxy A17 5g 128gb'));
  assert.equal(chaveDoModelo('Kit Novo'), '', 'título sem informação não vira chave (não junta produtos diferentes)');
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

test('guias: tamanho 3, 5 ou 10, e só cresce com folga para não oscilar', () => {
  assert.deepEqual([0, 2, 3, 4, 5, 9, 10, 25].map((n) => tamanhoDoGuia(n)), [0, 0, 3, 3, 5, 5, 10, 10]);
  assert.equal(tamanhoDoGuia(10, 5), 5, 'estava no top 5: com 10 produtos ainda não passa para 10');
  assert.equal(tamanhoDoGuia(11, 5), 5);
  assert.equal(tamanhoDoGuia(12, 5), 10, 'com folga de 2, passa para 10');
  assert.equal(tamanhoDoGuia(5, 3), 3);
  assert.equal(tamanhoDoGuia(7, 3), 5);
  assert.equal(tamanhoDoGuia(10, 10), 10, 'não encolhe enquanto há produtos');
  assert.equal(tamanhoDoGuia(9, 10), 5, 'com menos de 10 não dá para manter o top 10');
  assert.equal(tamanhoDoGuia(4, 5), 3);
});

test('guias: a nota é ajustada pelas vendas, então nota alta com poucas vendas não passa à frente', () => {
  const poucas = fone(1, { nota: 5, vendas: 30 });
  const muitas = fone(2, { nota: 4.8, vendas: 12000 });
  assert.ok(notaAjustada(poucas) < 4.5 && notaAjustada(muitas) > 4.75, `${notaAjustada(poucas)} / ${notaAjustada(muitas)}`);
  assert.ok(pontuacaoDoGuia(muitas) > pontuacaoDoGuia(poucas));
  assert.ok(notaAjustada(fone(3, { nota: undefined, vendas: undefined })) < 4.3, 'sem nota fica abaixo da média');
  // Desconto e frete grátis não mudam a pontuação.
  assert.equal(pontuacaoDoGuia(fone(4, { desconto: 60, freteGratis: true })), pontuacaoDoGuia(fone(4, { desconto: 0, freteGratis: false })));
});

test('guias: com 10 ou mais produtos bons sai o top 10; custo-benefício leva o preço em conta', () => {
  const tipo = tipoDeGuia(fone(1).titulo)!;
  const vistoEm = AGORA.getTime();
  // O produto 1 tem a maior pontuação, mas custa 8x mais; o produto 2 é quase tão bom e bem mais barato.
  const candidatos = [
    { oferta: fone(1, { nota: 4.9, vendas: 90000, preco: 800 }), vistoEm },
    { oferta: fone(2, { nota: 4.8, vendas: 60000, preco: 100 }), vistoEm },
    ...Array.from({ length: 10 }, (_, i) => ({ oferta: fone(i + 3, { nota: 4.5, vendas: 1000 + i * 100, preco: 120 + i * 5 }), vistoEm })),
  ];
  const itens = escolherParaGuia(candidatos, tipo);
  assert.equal(itens.length, 10, 'top 10');
  assert.equal(itens[0]!.idProduto, 'MLB1', 'a maior pontuação fica em primeiro');
  assert.ok(!itens[0]!.destaques.includes('Melhor custo-benefício'), 'o primeiro não ganha o selo só por ser primeiro');
  assert.ok(itens.find((i) => i.idProduto === 'MLB2')!.destaques.includes('Melhor custo-benefício'));
  assert.ok(itens.find((i) => i.idProduto === 'MLB1')!.precoVsMediana! > 100, 'preço bem acima da mediana da lista');
  assert.ok(itens.find((i) => i.idProduto === 'MLB2')!.precoVsMediana! < 0);
});

test('guias: a lista é estável: veteranos ficam, novato só entra com 10% a mais, a ordem só muda com diferença clara', () => {
  const tipo = tipoDeGuia(fone(1).titulo)!;
  const vistoEm = AGORA.getTime();
  const base = [1, 2, 3, 4, 5].map((n) => ({ oferta: fone(n, { nota: 4.6, vendas: 1000 * (6 - n) }), vistoEm }));
  const primeira = escolherParaGuia(base, tipo);
  const anteriores = primeira.map((i) => `${i.loja}:${i.idProduto}`);
  assert.deepEqual(anteriores, ['mercadolivre:MLB1', 'mercadolivre:MLB2', 'mercadolivre:MLB3', 'mercadolivre:MLB4', 'mercadolivre:MLB5']);

  // Um novato um pouco melhor que o último veterano NÃO entra.
  const pontosDoUltimo = pontuacaoDoGuia(fone(5, { nota: 4.6, vendas: 1000 }));
  const quaseIgual = { oferta: fone(9, { nota: 4.6, vendas: 1100 }), vistoEm };
  assert.ok(pontuacaoDoGuia(quaseIgual.oferta) < pontosDoUltimo * 1.1);
  assert.ok(!escolherParaGuia([...base, quaseIgual], tipo, { anteriores }).some((i) => i.idProduto === 'MLB9'));

  // Um novato muito melhor (mais de 10%) entra no lugar do mais fraco.
  const campeao = { oferta: fone(10, { nota: 4.9, vendas: 80000 }), vistoEm };
  const comCampeao = escolherParaGuia([...base, campeao], tipo, { anteriores });
  assert.ok(comCampeao.some((i) => i.idProduto === 'MLB10') && !comCampeao.some((i) => i.idProduto === 'MLB5'));
  assert.equal(comCampeao[0]!.idProduto, 'MLB10', 'e sobe ao topo se for claramente melhor');

  // Diferença pequena entre dois veteranos não troca a ordem anterior.
  const embaralhado = [1, 2, 3, 4, 5].map((n) => ({ oferta: fone(n, { nota: 4.6, vendas: 1000 * (6 - n) + (n === 2 ? 600 : 0) }), vistoEm }));
  assert.deepEqual(escolherParaGuia(embaralhado, tipo, { anteriores }).map((i) => i.idProduto), ['MLB1', 'MLB2', 'MLB3', 'MLB4', 'MLB5']);

  // Veterano sem aparecer nas lojas há 20 dias continua; um desafiante com 20 dias não entra.
  const velho = AGORA.getTime() - 20 * DIA;
  const janela = { anteriores, agora: AGORA.getTime(), diasDosDesafiantes: 14 };
  const comVelhos = escolherParaGuia(base.map((c) => ({ ...c, vistoEm: velho })), tipo, janela);
  assert.equal(comVelhos.length, 5, 'veteranos valem por mais tempo');
  const desafianteVelho = { oferta: fone(11, { nota: 4.9, vendas: 90000 }), vistoEm: velho };
  assert.ok(!escolherParaGuia([...base, desafianteVelho], tipo, janela).some((i) => i.idProduto === 'MLB11'), 'desafiante precisa ser recente');
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
  assert.equal(ld[1].itemListElement[0].item.offers.availability, 'https://schema.org/InStock', 'visto há poucas horas: em estoque');
  assert.deepEqual(ld[1].itemListElement[0].item.offers.seller, { '@type': 'Organization', name: 'Mercado Livre' });
  assert.equal(ld[1].itemListElement[0].item.aggregateRating, undefined, 'sem número de avaliações, nada de aggregateRating inventado');
  assert.equal(ld[1].itemListElement[0].item.review, undefined);
  assert.deepEqual(ld[3].itemListElement.map((x: any) => x.name), ['Início', 'Guias', 'Melhores fones de ouvido bluetooth de 2026: top 5 comparados']);
  assert.ok(html.includes('name="twitter:card"') && html.includes('property="og:site_name"') && html.includes('class="escolhas"'), 'redes sociais e resumo das escolhas');
  assert.equal(ld[1].numberOfItems, 5);
  assert.equal(ld[2].mainEntity.length, 4);
  assert.ok(html.includes('Por que a ordem desta lista não muda toda hora?') && html.includes('vs. média da lista'));
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

test('guias: produto visto há mais de 2 dias não é declarado "em estoque" para o Google', async () => {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 3; i++) banco.guardarParaGuia('fones-bluetooth', fone(i), new Date(AGORA.getTime() - 5 * DIA));
  const dir = mkdtempSync(join(tmpdir(), 'guias-'));
  await gerarBlog(banco, lerConfig({ BLOG_PASTA: dir, BLOG_IA: 'nenhuma' }), AGORA);
  const html = readFileSync(join(dir, 'melhores-fones-bluetooth.html'), 'utf8');
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1])['@graph'];
  assert.equal(ld[1].itemListElement[0].item.offers.availability, undefined);
  assert.equal(ld[1].itemListElement[0].item.offers.price, '130.00', 'o preço continua, só a disponibilidade não é afirmada');
});

test('guias: entre uma rodada e outra do blog a lista publicada se mantém, e só um produto claramente melhor entra', async () => {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 5; i++) banco.guardarParaGuia('fones-bluetooth', fone(i), AGORA);
  const dir = mkdtempSync(join(tmpdir(), 'guias-'));
  const config = lerConfig({ BLOG_PASTA: dir, BLOG_IA: 'nenhuma' });
  const pagina = () => readFileSync(join(dir, 'melhores-fones-bluetooth.html'), 'utf8');
  await gerarBlog(banco, config, AGORA);
  assert.match(pagina(), /Modelo 1\b/);

  // Quase igual ao último da lista (Modelo 1): não entra.
  banco.guardarParaGuia('fones-bluetooth', fone(9, { vendas: 1100 }), AGORA);
  await gerarBlog(banco, config, AGORA);
  assert.ok(!pagina().includes('Modelo 9'), 'novato só um pouco melhor não troca a lista');
  assert.match(pagina(), /Modelo 1\b/);

  // Claramente melhor: entra e o mais fraco sai.
  banco.guardarParaGuia('fones-bluetooth', fone(10, { nota: 4.9, vendas: 80000 }), AGORA);
  await gerarBlog(banco, config, AGORA);
  assert.ok(pagina().includes('Modelo 10') && !/Modelo 1\b/.test(pagina()));
  assert.match(pagina(), /top 5 comparados/);
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

test('seo: título e descrição no tamanho certo, sem reticências, com pré-visualização em todas as páginas; a categoria liga aos guias', async (t) => {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 5; i++) banco.guardarParaGuia('fones-bluetooth', fone(i, { titulo: `Fone de Ouvido Bluetooth Modelo ${i} Com Cancelamento de Ruído Ativo e Estojo de Carga Rápida Premium` }), AGORA);
  for (let i = 1; i <= 3; i++) banco.guardarParaGuia('air-fryers', { ...fone(i), idProduto: `AF${i}`, titulo: `Fritadeira Air Fryer Digital ${i} Litros` }, AGORA);
  for (let i = 1; i <= 6; i++) banco.guardarProduto({ ...fone(i), categoria: i % 2 ? 'tech' : 'casa', pontos: 50 - i, desconto: 40 }, AGORA);
  const dir = mkdtempSync(join(tmpdir(), 'seo-'));
  await gerarBlog(banco, lerConfig({ BLOG_PASTA: dir, BLOG_URL: 'https://exemplo.github.io/achados', BLOG_NOME: 'Achadinhos do Dia', BLOG_IA: 'nenhuma' }), AGORA);

  let comImagemPadrao = true;
  try {
    await import('@resvg/resvg-js');
  } catch {
    comImagemPadrao = false;
    t.diagnostic('conversor de imagens não instalado: a imagem padrão de pré-visualização não foi testada');
  }
  const paginas = readdirSync(dir).filter((a) => a.endsWith('.html') && a !== '404.html');
  assert.ok(paginas.length >= 8, `páginas: ${paginas.join(', ')}`);
  for (const arquivo of paginas) {
    const html = readFileSync(join(dir, arquivo), 'utf8');
    const titulo = /<title>([^<]*)<\/title>/.exec(html)![1]!;
    const descricao = /<meta name="description" content="([^"]*)"/.exec(html)![1]!;
    assert.ok(titulo.length >= 25 && titulo.length <= 62, `${arquivo}: título com ${titulo.length} caracteres: ${titulo}`);
    assert.ok(descricao.length >= 70 && descricao.length <= 160, `${arquivo}: descrição com ${descricao.length} caracteres`);
    assert.ok(!descricao.includes('…') && !titulo.includes('…'), `${arquivo}: sem reticências no título nem na descrição`);
    assert.ok(/<meta property="og:title"/.test(html) && /<meta property="og:description"/.test(html), `${arquivo}: sem pré-visualização`);
    if (comImagemPadrao) assert.ok(/<meta property="og:image" content="https:\/\/[^"]+"/.test(html), `${arquivo}: sem imagem de pré-visualização`);
  }
  if (comImagemPadrao) assert.ok(existsSync(join(dir, 'og-padrao.png')));

  // A página do guia tem título de busca compacto, mas mantém o título completo na página.
  const guia = readFileSync(join(dir, 'melhores-fones-bluetooth.html'), 'utf8');
  // Com o nome do site passaria de 62 caracteres, então o nome do site sai da aba (a busca cortaria o fim de qualquer jeito).
  assert.match(guia, /<title>Melhores fones de ouvido bluetooth de 2026 \(Top 5\)<\/title>/);
  assert.match(guia, /<h1>Melhores fones de ouvido bluetooth de 2026: top 5 comparados<\/h1>/);

  // A categoria traz um texto de abertura e liga aos guias da mesma categoria.
  const tech = readFileSync(join(dir, 'categoria-tech.html'), 'utf8');
  assert.match(tech, /Guias de compra de Tecnologia/);
  assert.ok(tech.includes('href="melhores-fones-bluetooth.html"') && !tech.includes('melhores-air-fryers.html'), 'só os guias da categoria');
  assert.match(tech, /Ofertas de Tecnologia, dia a dia/);
  assert.ok(tech.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length >= 150, 'a categoria deixou de ser uma lista seca');
  assert.ok(readFileSync(join(dir, 'categoria-casa.html'), 'utf8').includes('melhores-air-fryers.html'));
});

test('texto da IA cortado no meio da frase é aparado ou descartado', async () => {
  const { limparTextoDeIA, terminaBem } = await import('../src/blog.ts');
  assert.equal(limparTextoDeIA('O aparelho é indicado para quem precisa de um celular com 12 GB de'), undefined);
  assert.equal(
    limparTextoDeIA('Este celular é indicado para quem busca bateria que dura o dia todo e tela grande. Ele também traz câmera de 50 MP e conectividade'),
    'Este celular é indicado para quem busca bateria que dura o dia todo e tela grande.',
  );
  assert.ok(terminaBem('Frase completa.') && !terminaBem('Frase pela metade de'));
});

test('dicas: todo guia tem uma explicação prática por critério, curta, sem marca e sem promessa de teste', () => {
  const marcas = /\b(samsung|apple|iphone|xiaomi|motorola|lg|philips|jbl|sony|dell|lenovo|asus|acer|logitech|razer|multilaser|mondial|britania|electrolux|brastemp|consul|intelbras|tp-link|nintendo|playstation|xbox|netflix)\b/i;
  const promessaDeTeste = /\b(testamos|nós testamos|na nossa experiência|recomendamos esta|o melhor do mercado)\b/i;
  assert.deepEqual(Object.keys(EXPLICACOES_DOS_CRITERIOS).sort(), TIPOS_DE_GUIA.map((t) => t.slug).sort(), 'um conjunto de explicações para cada tipo de guia, e nenhum a mais');
  for (const tipo of TIPOS_DE_GUIA) {
    const e = EXPLICACOES_DOS_CRITERIOS[tipo.slug]!;
    assert.equal(e.length, tipo.criterios.length, `${tipo.slug}: uma explicação para cada critério`);
    e.forEach((x, i) => {
      assert.ok(x.length >= 40 && x.length <= 160, `${tipo.slug}#${i + 1} tem ${x.length} caracteres`);
      assert.ok(!x.includes('…') && /[.?!]$/.test(x), `${tipo.slug}#${i + 1} termina a frase`);
      assert.ok(!promessaDeTeste.test(x), `${tipo.slug}#${i + 1} não finge ter testado nada`);
      // Streaming e consoles são exceções: o próprio critério fala de serviços e plataformas.
      if (tipo.slug !== 'smart-tvs' && tipo.slug !== 'consoles-de-video-game') assert.ok(!marcas.test(x), `${tipo.slug}#${i + 1} cita marca: ${x}`);
    });
  }
});

test('dicas: a página do guia mostra cada critério com a sua explicação', async () => {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 3; i++) banco.guardarParaGuia('air-fryers', { ...fone(i), idProduto: `AF${i}`, titulo: `Air Fryer ${i}L Digital` }, AGORA);
  const dir = mkdtempSync(join(tmpdir(), 'guias-'));
  await gerarBlog(banco, lerConfig({ BLOG_PASTA: dir, BLOG_IA: 'nenhuma' }), AGORA);
  const html = readFileSync(join(dir, 'melhores-air-fryers.html'), 'utf8');
  const tipo = TIPOS_DE_GUIA.find((t) => t.slug === 'air-fryers')!;
  tipo.criterios.forEach((c, i) => assert.ok(html.includes(`<li><strong>${c}</strong>: `) && html.includes(EXPLICACOES_DOS_CRITERIOS['air-fryers']![i]!.replace(/"/g, '&quot;')), c));
});
