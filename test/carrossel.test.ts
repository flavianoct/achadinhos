import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { diaDaSemana, escolherParaCarrossel, gravarPngsDoCarrossel, prepararCarrossel } from '../src/carrossel.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { TIPOS_DE_GUIA } from '../src/guias.ts';
import { Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { arquivosDoCarrossel, legendaDaDica, legendaDoCarrossel, totalDeImagens, type DadosDaDica, type DadosDoCarrossel } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-03T15:00:00Z');
const DIA = 86_400_000;
const base = { INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok-secreto', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23', BLOG_PASTA: 'blog-teste', INSTAGRAM_INTERVALO_FEED_MIN: '0' };

const produto = (n: number, extra: Partial<OfertaAvaliada> = {}): OfertaAvaliada => ({
  loja: 'mercadolivre', idProduto: `MLB${n}`, titulo: `Produto Bom Numero ${n} Com Nome Longo Para Testar`, preco: 20 + n, link: `https://www.mercadolivre.com.br/p/MLB${n}`,
  imagem: `https://http2.mlstatic.com/foto-${n}.png`, nota: 4.8, vendas: 2000 + n, categoria: ['tech', 'casa', 'beleza'][n % 3]!, pontos: 100 - n, ...extra,
});
const config = lerConfig(base);

test('carrossel: escolhe só produtos bons dentro do teto, com no máximo 2 por categoria e o teto girando entre os dias', () => {
  const lista = [...Array.from({ length: 12 }, (_, i) => produto(i + 1)), produto(50, { nota: 4.2 }), produto(51, { vendas: 20 }), produto(52, { titulo: 'Controle Genérico Ps4' }), produto(53, { preco: 400 }), produto(54, { imagem: undefined })];
  const tetoDoDia = config.instagram.carrosselTetos[Math.floor(AGORA.getTime() / DIA) % 3]!;
  const r = escolherParaCarrossel(lista, config, AGORA)!;
  assert.equal(r.teto, tetoDoDia);
  const primeiros = r.ordem.slice(0, 5);
  assert.equal(primeiros.length, 5);
  for (const cat of ['tech', 'casa', 'beleza']) assert.ok(primeiros.filter((o) => o.categoria === cat).length <= 2, `no máximo 2 de ${cat}`);
  assert.ok(r.ordem.every((o) => o.preco <= r.teto && o.nota! >= 4.6 && o.vendas! >= 300 && !/Genérico/.test(o.titulo) && o.imagem), 'só produtos que passam no filtro, no teto e com foto');
  assert.ok(![50, 51, 52, 53, 54].some((n) => r.ordem.some((o) => o.idProduto === `MLB${n}`)));

  // O teto gira de um dia para o outro.
  const tetos = new Set([0, 1, 2].map((d) => escolherParaCarrossel(lista.map((o) => ({ ...o, preco: 10 })), config, new Date(AGORA.getTime() + d * DIA))!.teto));
  assert.equal(tetos.size, 3);

  // Se o teto do dia não tem produtos suficientes, usa o seguinte; sem nenhum, não há carrossel.
  const caros = Array.from({ length: 8 }, (_, i) => produto(i + 1, { preco: 150 }));
  assert.equal(escolherParaCarrossel(caros, config, AGORA)!.teto, 200);
  assert.equal(escolherParaCarrossel(Array.from({ length: 4 }, (_, i) => produto(i + 1)), config, AGORA), undefined, 'menos de 5 produtos');
  assert.equal(escolherParaCarrossel(lista, lerConfig({ ...base, INSTAGRAM_CARROSSEL_TETOS: '' }), AGORA), undefined);
  assert.equal(lerConfig({ ...base, INSTAGRAM_CARROSSEL_ITENS: '20' }).instagram.carrosselItens, 9, 'capa + 9 produtos = 10 imagens, o máximo do Instagram');
  assert.equal(lerConfig({ ...base, INSTAGRAM_CARROSSEL_ITENS: '1' }).instagram.carrosselItens, 3);
});

function fotoFalsa(falhaEm?: string) {
  return (async (url: any) => {
    if (falhaEm && String(url).includes(falhaEm)) return new Response('x', { status: 404 });
    return new Response('abc', { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;
}

function bancoComProdutos(n = 12) {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= n; i++) banco.guardarProduto(produto(i), new Date(AGORA.getTime() - i * 60_000));
  return banco;
}

test('carrossel: cria um por dia, com fotos, só no horário e só se ligado', async () => {
  const banco = bancoComProdutos();
  assert.equal(await prepararCarrossel(banco, config, AGORA, fotoFalsa()), true);
  const pendente = banco.carrosselPendente(AGORA)!;
  const dados = JSON.parse(pendente.dados) as DadosDoCarrossel;
  assert.equal(dados.itens.length, 5);
  assert.ok(dados.itens.every((i) => i.imagem?.startsWith('data:image/png;base64,')));
  assert.match(pendente.titulo, /^Top 5 até R\$ (50|100|200)$/);
  assert.equal(await prepararCarrossel(banco, config, AGORA, fotoFalsa()), false, 'só um por dia');
  assert.equal(await prepararCarrossel(banco, config, new Date(AGORA.getTime() + 20_000), fotoFalsa()), false);

  assert.equal(await prepararCarrossel(bancoComProdutos(), config, new Date('2026-10-03T05:00:00Z'), fotoFalsa()), false, 'de madrugada não prepara');
  assert.equal(await prepararCarrossel(bancoComProdutos(), lerConfig({ ...base, INSTAGRAM_CARROSSEL_POR_DIA: '0' }), AGORA, fotoFalsa()), false, 'desligado');
  assert.equal(await prepararCarrossel(bancoComProdutos(), lerConfig({ ...base, INSTAGRAM_ATIVO: '0' }), AGORA, fotoFalsa()), false);

  // Uma foto que não baixa é trocada pelo próximo produto; sem fotos suficientes, não cria.
  const comFalha = bancoComProdutos();
  assert.equal(await prepararCarrossel(comFalha, config, AGORA, fotoFalsa('foto-1.png')), true);
  assert.ok(!JSON.parse(comFalha.carrosselPendente(AGORA)!.dados).itens.some((i: any) => i.oferta.idProduto === 'MLB1'));
  assert.equal(await prepararCarrossel(bancoComProdutos(), config, AGORA, (async () => new Response('x', { status: 404 })) as typeof fetch), false);
});

test('carrossel: legenda com gancho e #publi na primeira linha, lista com preço e prova social, sem link no texto', () => {
  const dados: DadosDoCarrossel = { titulo: 'Top 5 até R$ 100', teto: 100, itens: [1, 2, 3, 4, 5].map((n) => ({ oferta: produto(n) })) };
  const l = legendaDoCarrossel(dados, config);
  assert.match(l.split('\n')[0]!, /Top 5 até R\$ 100 #publi/);
  for (let i = 1; i <= 5; i++) assert.match(l, new RegExp(`^${i}\\) .*R\\$ \\d+,\\d\\d · ⭐ 4,8`, 'm'));
  assert.match(l, /link na bio/);
  assert.match(l, /Publi: link de afiliado/);
  assert.ok(!l.includes('https://') && !l.includes('…'));
  assert.ok((l.match(/#\w+/g) ?? []).length <= 10);
  assert.ok(l.length < 2200);
});

test('carrossel: grava a capa e um PNG por produto (1080x1350)', async (t) => {
  try {
    await import('@resvg/resvg-js');
  } catch {
    return t.skip('conversor @resvg/resvg-js não instalado neste computador');
  }
  const banco = bancoComProdutos();
  const dir = mkdtempSync(join(tmpdir(), 'carrossel-'));
  const cfg = lerConfig({ ...base, BLOG_PASTA: dir });
  assert.equal(await gravarPngsDoCarrossel(banco, cfg, AGORA), 0, 'sem carrossel pendente não grava nada');
  await prepararCarrossel(banco, cfg, AGORA, fotoFalsa());
  assert.equal(await gravarPngsDoCarrossel(banco, cfg, AGORA), 6);
  const pendente = banco.carrosselPendente(AGORA)!;
  for (const nome of arquivosDoCarrossel(pendente.chave, 6)) {
    assert.ok(existsSync(join(dir, 'social', nome)), nome);
    const png = readFileSync(join(dir, 'social', nome));
    assert.equal(png.readUInt32BE(16), 1080, 'largura');
    assert.equal(png.readUInt32BE(20), 1350, 'altura 4:5, igual em todas as imagens do carrossel');
  }
});

/** Instagram de mentira, com ids diferentes para cada contêiner, para ver a ordem das chamadas. */
function apiDeCarrossel(pngNoAr: (url: string) => boolean = () => true) {
  const chamadas: Array<{ metodo: string; url: string; corpo: URLSearchParams }> = [];
  let n = 0;
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    const metodo = init.method ?? 'GET';
    chamadas.push({ metodo, url: u, corpo: new URLSearchParams(init.body ? String(init.body) : u.split('?')[1] ?? '') });
    if (metodo === 'HEAD') return new Response(null, { status: pngNoAr(u) ? 200 : 404 });
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'post-1' }));
    if (metodo === 'POST' && u.endsWith('/media')) return new Response(JSON.stringify({ id: `cont-${++n}` }));
    if (u.includes('/cont-')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    return new Response('{}');
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

test('instagram: o carrossel vira um contêiner por imagem e um contêiner pai com a lista e a legenda', async () => {
  const { f, chamadas } = apiDeCarrossel();
  const ig = new Instagram('tok', '1789', f, 0);
  const id = await ig.publicarCarrossel(['https://x/1.png', 'https://x/2.png', 'https://x/3.png'], 'Legenda #publi');
  assert.equal(id, 'post-1');
  const criados = chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/1789/media'));
  assert.equal(criados.length, 4, '3 filhos e 1 pai');
  assert.deepEqual(criados.slice(0, 3).map((c) => [c.corpo.get('image_url'), c.corpo.get('is_carousel_item')]), [['https://x/1.png', 'true'], ['https://x/2.png', 'true'], ['https://x/3.png', 'true']]);
  assert.equal(criados[3]!.corpo.get('media_type'), 'CAROUSEL');
  assert.equal(criados[3]!.corpo.get('children'), 'cont-1,cont-2,cont-3', 'na ordem das imagens');
  assert.equal(criados[3]!.corpo.get('caption'), 'Legenda #publi');
  assert.ok(chamadas.some((c) => c.url.endsWith('/1789/media_publish') && c.corpo.get('creation_id') === 'cont-4'));
  await assert.rejects(ig.publicarCarrossel(['https://x/1.png'], 'x'), /2 a 10 imagens/);
});

async function bancoComCarrosselPendente() {
  const banco = bancoComProdutos();
  await prepararCarrossel(banco, config, AGORA, fotoFalsa());
  return banco;
}

test('instagram: publica o carrossel do dia (conta como post de feed), uma vez só, e só com todas as imagens no ar', async () => {
  const banco = await bancoComCarrosselPendente();
  const chave = banco.carrosselPendente(AGORA)!.chave;
  const nomes = arquivosDoCarrossel(chave, 6);

  // Uma imagem ainda não está no ar: espera a próxima rodada, sem publicar nada.
  const parcial = apiDeCarrossel((u) => !u.endsWith(nomes[3]!));
  const r0 = await publicarNoInstagram(banco, config, AGORA, parcial.f, new Instagram('tok-secreto', '1789', parcial.f, 0));
  assert.deepEqual([r0.feed, r0.stories], [0, 0]);
  assert.match(r0.avisos.join(' '), /imagens ainda não estão no ar/);
  assert.ok(!parcial.chamadas.some((c) => c.url.endsWith('/media')));

  // Todas no ar: publica.
  const { f, chamadas } = apiDeCarrossel();
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  const r1 = await publicarNoInstagram(banco, config, AGORA, f, cliente);
  assert.equal(r1.feed, 1, 'o carrossel conta como o post de feed da rodada');
  const criados = chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/media'));
  assert.equal(criados.filter((c) => c.corpo.get('is_carousel_item') === 'true').length, 6, 'capa + 5 produtos');
  assert.equal(criados.find((c) => c.corpo.get('media_type') === 'CAROUSEL')!.corpo.get('children')!.split(',').length, 6);
  assert.match(criados.find((c) => c.corpo.get('media_type') === 'CAROUSEL')!.corpo.get('caption')!, /Top 5 até R\$ \d+ #publi/);
  assert.equal(banco.carrosseisPublicadosNoDia(AGORA), 1);
  assert.equal(banco.instagramNoDia('feed', AGORA), 1, 'conta no limite de posts de feed do dia');
  assert.equal(banco.ultimoInstagram('feed'), AGORA.getTime(), 'e no intervalo entre posts');
  assert.equal(banco.carrosselPendente(AGORA), undefined);

  // Outra rodada no mesmo dia não repete o carrossel.
  const depois = apiDeCarrossel();
  await publicarNoInstagram(banco, config, new Date(AGORA.getTime() + 30 * 60_000), depois.f, new Instagram('tok-secreto', '1789', depois.f, 0));
  assert.ok(!depois.chamadas.some((c) => c.corpo.get('media_type') === 'CAROUSEL'));
});

test('instagram: se a API recusar o carrossel, tenta no máximo 3 vezes e os posts de foto seguem normalmente', async () => {
  const banco = await bancoComCarrosselPendente();
  banco.guardarParaSocial(produto(77), AGORA);
  const chamadas: string[] = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    const metodo = init.method ?? 'GET';
    const corpo = new URLSearchParams(init.body ? String(init.body) : '');
    if (metodo === 'HEAD') return new Response(null, { status: 200 });
    if (corpo.get('media_type') === 'CAROUSEL') {
      chamadas.push('pai');
      return new Response(JSON.stringify({ error: { code: 100, message: 'Parâmetro inválido' } }), { status: 400 });
    }
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'post-1' }));
    if (metodo === 'POST' && u.endsWith('/media')) return new Response(JSON.stringify({ id: 'cont-x' }));
    return new Response(JSON.stringify({ status_code: 'FINISHED' }));
  }) as unknown as typeof fetch;
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  const avisos: string[] = [];
  for (let rodada = 0; rodada < 5; rodada++) {
    const r = await publicarNoInstagram(banco, config, new Date(AGORA.getTime() + rodada * 30 * 60_000), f, cliente);
    avisos.push(...r.avisos);
  }
  assert.equal(chamadas.length, 3, 'desiste depois de 3 tentativas');
  assert.equal(avisos.filter((a) => /carrossel não saiu/.test(a)).length, 3);
  assert.match(avisos[0]!, /tentativa 1 de 3.*Parâmetro inválido/);
  assert.equal(banco.carrosselPendente(AGORA), undefined, 'o carrossel que falhou 3 vezes sai da fila');
  assert.equal(banco.carrosseisPublicadosNoDia(AGORA), 0);
});

test('instagram: o carrossel respeita o intervalo entre posts de feed e o desligamento', async () => {
  const banco = await bancoComCarrosselPendente();
  const { f, chamadas } = apiDeCarrossel();
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  // Um feed acabou de sair (intervalo de 3h): o carrossel espera.
  banco.guardarParaSocial(produto(99), AGORA);
  const chaveFeed = banco.socialRecentes(12, 5, AGORA)[0]!.chave;
  banco.marcarInstagram(chaveFeed, 'feed', new Date(AGORA.getTime() - 30 * 60_000));
  const comIntervalo = lerConfig({ ...base, INSTAGRAM_INTERVALO_FEED_MIN: '180' });
  const r = await publicarNoInstagram(banco, comIntervalo, AGORA, f, cliente);
  assert.equal(r.feed, 0);
  assert.ok(!chamadas.some((c) => c.corpo.get('media_type') === 'CAROUSEL'));

  const desligado = lerConfig({ ...base, INSTAGRAM_CARROSSEL_POR_DIA: '0' });
  const r2 = await publicarNoInstagram(banco, desligado, AGORA, f, cliente);
  assert.ok(!chamadas.some((c) => c.corpo.get('media_type') === 'CAROUSEL'), `desligado não publica (feed ${r2.feed})`);
});

// ───────── Carrossel educativo: "N coisas para olhar antes de comprar [produto]" ─────────

function guiaSalvo(banco: Banco, slug: string, quantos = 4): void {
  const tipo = TIPOS_DE_GUIA.find((t) => t.slug === slug)!;
  banco.salvarGuia({
    arquivo: `melhores-${slug}.html`,
    tipo: slug,
    titulo: `Melhores ${tipo.nome} de 2026`,
    atualizadoEm: AGORA.getTime(),
    dados: JSON.stringify({ itens: Array.from({ length: quantos }, (_, i) => produto(i + 1, { categoria: tipo.categoria })), intro: '', temIA: false, ano: '2026' }),
  });
}

const todosOsDias = lerConfig({ ...base, INSTAGRAM_DICAS_DIAS: '0,1,2,3,4,5,6' });

test('dica: cria o carrossel educativo com os critérios do guia e os 3 primeiros produtos dele', async () => {
  assert.equal(diaDaSemana(AGORA), 6, '3 de outubro de 2026 é sábado');
  assert.equal(diaDaSemana(new Date('2026-10-05T15:00:00Z')), 1, 'segunda');
  assert.equal(diaDaSemana(new Date('2026-10-04T02:30:00Z')), 6, 'madrugada de domingo ainda é sábado em Brasília');

  const banco = bancoComProdutos();
  guiaSalvo(banco, 'fones-bluetooth');
  assert.equal(await prepararCarrossel(banco, config, AGORA, fotoFalsa()), true);
  const pendente = banco.carrosselPendente(AGORA)!;
  assert.equal(pendente.chave, 'dica-2026-10-03-fones-bluetooth', 'sábado é dia de dica');
  const dados = JSON.parse(pendente.dados) as DadosDaDica;
  const tipo = TIPOS_DE_GUIA.find((t) => t.slug === 'fones-bluetooth')!;
  assert.equal(dados.formato, 'dica');
  assert.deepEqual(dados.criterios, tipo.criterios);
  assert.equal(dados.titulo, `${tipo.criterios.length} coisas para olhar antes de comprar fones de ouvido bluetooth`);
  assert.equal(dados.itens.length, 3);
  assert.ok(dados.itens.every((i) => i.imagem?.startsWith('data:image/png;base64,') && i.oferta.link.startsWith('https://')));
  assert.equal(totalDeImagens(dados), 1 + tipo.criterios.length + 1, 'capa, um critério por imagem e o fechamento');
  assert.ok(totalDeImagens(dados) <= 10, 'cabe no limite do Instagram');
  assert.ok(Object.keys(dados.itens[0]!.oferta).length <= 9, 'só o necessário fica guardado');

  // Fora dos dias da dica (ou com a dica desligada) o carrossel é o Top.
  assert.match((await (async () => { const b = bancoComProdutos(); guiaSalvo(b, 'fones-bluetooth'); await prepararCarrossel(b, lerConfig({ ...base, INSTAGRAM_DICAS_DIAS: '1,2' }), AGORA, fotoFalsa()); return b.carrosselPendente(AGORA)!.chave; })()), /^carrossel-2026-10-03-/);
  assert.match((await (async () => { const b = bancoComProdutos(); guiaSalvo(b, 'fones-bluetooth'); await prepararCarrossel(b, lerConfig({ ...base, INSTAGRAM_DICAS_DIAS: '' }), AGORA, fotoFalsa()); return b.carrosselPendente(AGORA)!.chave; })()), /^carrossel-2026-10-03-/);
  // Guia com menos de 3 produtos não vira dica.
  const pequeno = bancoComProdutos();
  guiaSalvo(pequeno, 'fones-bluetooth', 2);
  await prepararCarrossel(pequeno, config, AGORA, fotoFalsa());
  assert.match(pequeno.carrosselPendente(AGORA)!.chave, /^carrossel-/);
});

test('dica: um assunto não se repete por 14 dias, os assuntos giram e, sem assunto novo, volta para o Top', async () => {
  const banco = new Banco(':memory:');
  guiaSalvo(banco, 'fones-bluetooth');
  guiaSalvo(banco, 'air-fryers');
  const dia = (n: number) => new Date(AGORA.getTime() + n * DIA);
  const produtosDoDia = (n: number) => { for (let i = 1; i <= 12; i++) banco.guardarProduto(produto(i), new Date(dia(n).getTime() - i * 60_000)); };
  const assuntos: string[] = [];
  for (let n = 0; n < 3; n++) {
    produtosDoDia(n);
    assert.equal(await prepararCarrossel(banco, todosOsDias, dia(n), fotoFalsa()), true);
    const p = banco.carrosselPendente(dia(n))!;
    assuntos.push(p.chave.replace(/^(dica|carrossel)-\d{4}-\d{2}-\d{2}-/, (m) => m.startsWith('dica') ? 'dica:' : 'top:'));
    banco.marcarCarrosselPublicado(p.chave, dia(n));
  }
  assert.ok(assuntos[0]!.startsWith('dica:') && assuntos[1]!.startsWith('dica:'));
  assert.notEqual(assuntos[0], assuntos[1], 'o segundo dia usa o outro assunto');
  assert.ok(assuntos[2]!.startsWith('top:'), 'os dois assuntos já foram usados nos últimos 14 dias: volta para o Top');
  // Passados 14 dias, o primeiro assunto pode voltar.
  produtosDoDia(15);
  assert.equal(await prepararCarrossel(banco, todosOsDias, dia(15), fotoFalsa()), true);
  assert.match(banco.carrosselPendente(dia(15))!.chave, /^dica-/);
});

test('dica: a legenda tem gancho e #publi na primeira linha, os critérios, uma pergunta e a chamada para o guia', () => {
  const tipo = TIPOS_DE_GUIA.find((t) => t.slug === 'air-fryers')!;
  const dados: DadosDaDica = { formato: 'dica', titulo: `${tipo.criterios.length} coisas para olhar antes de comprar ${tipo.nome}`, slug: tipo.slug, assunto: tipo.nome, categoria: tipo.categoria, criterios: tipo.criterios, itens: [1, 2, 3].map((n) => ({ oferta: produto(n) })) };
  const l = legendaDaDica(dados, config);
  assert.match(l.split('\n')[0]!, /^📌 5 coisas para olhar antes de comprar air fryers #publi$/);
  tipo.criterios.forEach((c, i) => assert.ok(l.includes(`${i + 1}) ${c}`)));
  assert.match(l, /💬 .*(👇)/);
  assert.match(l, /Salve este post/);
  assert.match(l, /link na bio/);
  assert.match(l, /Publi: link de afiliado/);
  assert.ok(!l.includes('https://') && !l.includes('…') && l.length < 2200);
  assert.ok((l.match(/#\w+/g) ?? []).length <= 10);
  assert.equal(legendaDoCarrossel(dados, config), l, 'o carrossel escolhe a legenda pelo formato');
  assert.equal(legendaDaDica(dados, config), l, 'a pergunta é a mesma para o mesmo assunto');
  const perguntas = new Set(TIPOS_DE_GUIA.map((t) => legendaDaDica({ ...dados, slug: t.slug }, config).split('\n').find((x) => x.startsWith('💬'))));
  assert.ok(perguntas.size >= 2, 'as perguntas variam entre assuntos');
});

test('dica: grava as imagens (capa, critérios e fechamento) em 1080x1350 e publica como carrossel', async (t) => {
  const banco = bancoComProdutos();
  guiaSalvo(banco, 'fones-bluetooth');
  await prepararCarrossel(banco, config, AGORA, fotoFalsa());
  const pendente = banco.carrosselPendente(AGORA)!;
  const total = totalDeImagens(JSON.parse(pendente.dados));
  const nomes = arquivosDoCarrossel(pendente.chave, total);

  let comConversor = true;
  try {
    await import('@resvg/resvg-js');
  } catch {
    comConversor = false;
  }
  if (comConversor) {
    const dir = mkdtempSync(join(tmpdir(), 'dica-'));
    assert.equal(await gravarPngsDoCarrossel(banco, lerConfig({ ...base, BLOG_PASTA: dir }), AGORA), total);
    for (const nome of nomes) {
      const png = readFileSync(join(dir, 'social', nome));
      assert.equal(png.readUInt32BE(16), 1080, nome);
      assert.equal(png.readUInt32BE(20), 1350, nome);
    }
  } else t.diagnostic('conversor de imagens não instalado: só a parte de publicação foi testada');

  const { f, chamadas } = apiDeCarrossel();
  const r = await publicarNoInstagram(banco, config, AGORA, f, new Instagram('tok-secreto', '1789', f, 0));
  assert.equal(r.feed, 1);
  const criados = chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/media'));
  assert.equal(criados.filter((c) => c.corpo.get('is_carousel_item') === 'true').length, total);
  const pai = criados.find((c) => c.corpo.get('media_type') === 'CAROUSEL')!;
  assert.match(pai.corpo.get('caption')!, /^📌 \d coisas para olhar antes de comprar fones de ouvido bluetooth #publi/);
  assert.equal(banco.carrosselPendente(AGORA), undefined);
  assert.equal(banco.carrosseisPublicadosRecentes(14, AGORA).length, 1);
  assert.equal(banco.carrosselCriadoNoDia(AGORA), true, 'e o dia já tem o seu carrossel');
});
