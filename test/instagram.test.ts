import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { avisoDoToken, ErroInstagram, Instagram, passaNoFiltroDoInstagram, publicarNoInstagram } from '../src/instagram.ts';
import { arquivoDaArte, gravarPngs, montarSvgDoFeed, prepararSocial, renderizarPng } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-03T15:00:00Z');
const base = { INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok-secreto', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23', INSTAGRAM_HORARIOS_FEED: '', INSTAGRAM_HORARIOS_STORIES: '' };
const oferta = (id: string, pontos: number): OfertaAvaliada => ({
  loja: 'mercadolivre', idProduto: id, titulo: `Produto ${id}`, preco: 50, precoOriginal: 100, desconto: 50, link: 'https://x/' + id, categoria: 'casa', pontos, freteGratis: true, nota: 4.8, vendas: 1000,
});

/** Instagram de mentira: guarda cada chamada e responde como a API. */
function apiFalsa(opcoes: { pngNoAr?: boolean; erroNaPublicacao?: { code: number; message: string } } = {}) {
  const chamadas: Array<{ metodo: string; url: string; corpo: URLSearchParams }> = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    const metodo = init.method ?? 'GET';
    chamadas.push({ metodo, url: u, corpo: new URLSearchParams(init.body ? String(init.body) : u.split('?')[1] ?? '') });
    if (metodo === 'HEAD') return new Response(null, { status: opcoes.pngNoAr === false ? 404 : 200 });
    if (opcoes.erroNaPublicacao) return new Response(JSON.stringify({ error: opcoes.erroNaPublicacao }), { status: 400 });
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'post-1' }));
    if (u.includes('/media')) return new Response(JSON.stringify({ id: 'cont-1' }));
    if (u.includes('cont-1')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    return new Response(JSON.stringify({ username: 'mulher_empreededoraoficial' }));
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

async function bancoComOfertas() {
  const banco = new Banco(':memory:');
  const config = lerConfig(base);
  banco.guardarParaSocial(oferta('A', 5), new Date(AGORA.getTime() - 60_000));
  banco.guardarParaSocial(oferta('B', 9), new Date(AGORA.getTime() - 120_000));
  await prepararSocial(banco, config, AGORA, (async () => new Response(null, { status: 404 })) as typeof fetch);
  return { banco, config };
}

test('instagram: cria o container, espera ficar pronto e publica; Story vai sem legenda', async () => {
  const { f, chamadas } = apiFalsa();
  const ig = new Instagram('tok', '1789', f, 0);
  assert.equal(await ig.publicarFoto('https://x/a.png', 'Legenda #publi'), 'post-1');
  const criar = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/1789/media'))!;
  assert.equal(criar.corpo.get('image_url'), 'https://x/a.png');
  assert.equal(criar.corpo.get('caption'), 'Legenda #publi');
  assert.equal(criar.corpo.get('access_token'), 'tok');
  assert.ok(chamadas.some((c) => c.url.endsWith('/1789/media_publish') && c.corpo.get('creation_id') === 'cont-1'));
  chamadas.length = 0;
  await ig.publicarStory('https://x/b.png');
  const story = chamadas.find((c) => c.url.endsWith('/1789/media'))!;
  assert.equal(story.corpo.get('media_type'), 'STORIES');
  assert.equal(story.corpo.get('caption'), null);
});

test('instagram: token vencido vira erro fatal com a mensagem da Meta', async () => {
  const { f } = apiFalsa({ erroNaPublicacao: { code: 190, message: 'Invalid OAuth access token' } });
  await assert.rejects(new Instagram('velho', '1789', f, 0).publicarFoto('https://x/a.png', 'x'), (e: any) => e instanceof ErroInstagram && e.fatal && /190/.test(e.message) && /Invalid OAuth/.test(e.message));
});

test('instagram: publica primeiro a oferta de maior pontuação, um feed e um story por rodada, sem repetir', async () => {
  const { banco } = await bancoComOfertas();
  const config = lerConfig({ ...base, INSTAGRAM_INTERVALO_FEED_MIN: '0', INSTAGRAM_INTERVALO_STORY_MIN: '0' });
  const { f, chamadas } = apiFalsa();
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  const r1 = await publicarNoInstagram(banco, config, AGORA, f, cliente);
  assert.deepEqual([r1.feed, r1.stories], [1, 1]);
  const criados = chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/media'));
  assert.match(criados[0].corpo.get('image_url')!, /produto-b|mercadolivre-b/i, 'a de pontuação 9 (B) sai primeiro');
  assert.match(criados[0].corpo.get('caption')!, /#publi/);
  assert.equal(banco.instagramNoDia('feed', AGORA), 1);
  assert.equal(banco.instagramNoDia('story', AGORA), 1);
  const r2 = await publicarNoInstagram(banco, config, AGORA, f, cliente);
  assert.deepEqual([r2.feed, r2.stories], [1, 1], 'a segunda rodada publica a outra (A), não repete a B');
  const urls = chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/media')).map((c) => c.corpo.get('image_url'));
  assert.equal(new Set(urls).size, urls.length, 'nenhuma imagem repetida');
  const r3 = await publicarNoInstagram(banco, config, AGORA, f, cliente);
  assert.deepEqual([r3.feed, r3.stories], [0, 0], 'acabaram as ofertas');
});

test('instagram: publica só nas horas escolhidas (janelas) e as lê de INSTAGRAM_HORARIOS_*', async () => {
  const lida = lerConfig({ ...base, INSTAGRAM_HORARIOS_FEED: '21, 12,18,12, 25, x', INSTAGRAM_HORARIOS_STORIES: '8,10' }).instagram;
  assert.deepEqual(lida.horariosFeed, [12, 18, 21], 'ordena, tira repetidas e ignora valor inválido');
  assert.deepEqual(lida.horariosStories, [8, 10]);
  const padrao = lerConfig({ ...base, INSTAGRAM_HORARIOS_FEED: undefined as any, INSTAGRAM_HORARIOS_STORIES: undefined as any }).instagram;
  assert.deepEqual(padrao.horariosFeed, [12, 18, 21], 'padrão: almoço, fim da tarde e noite');
  assert.ok(padrao.horariosStories.length >= 6 && padrao.horariosStories.every((h) => h >= 8 && h < 23));
  assert.deepEqual(lerConfig({ ...base, INSTAGRAM_HORARIOS_FEED: '' }).instagram.horariosFeed, [], 'vazio = sem restrição');

  const { banco } = await bancoComOfertas();
  const config = lerConfig({ ...base, INSTAGRAM_HORARIOS_FEED: '18', INSTAGRAM_HORARIOS_STORIES: '18,20', INSTAGRAM_INTERVALO_FEED_MIN: '0', INSTAGRAM_INTERVALO_STORY_MIN: '0' });
  const { f } = apiFalsa();
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  const em = (horaDeBrasilia: number, minuto = 7) => new Date(Date.UTC(2026, 9, 3, horaDeBrasilia + 3, minuto));
  // 12h não é janela de nenhum dos dois: nada sai, mesmo havendo oferta pronta.
  const r0 = await publicarNoInstagram(banco, config, em(12), f, cliente);
  assert.deepEqual([r0.feed, r0.stories], [0, 0], 'fora da janela espera');
  assert.equal(banco.instagramNoDia('feed', em(12)), 0);
  // 18h é janela dos dois: sai um de cada.
  const r1 = await publicarNoInstagram(banco, config, em(18), f, cliente);
  assert.deepEqual([r1.feed, r1.stories], [1, 1]);
  // 19h não é janela de nenhum: não sai mais nada.
  const r2 = await publicarNoInstagram(banco, config, em(19), f, cliente);
  assert.deepEqual([r2.feed, r2.stories], [0, 0]);
  // 20h é janela só dos Stories: sai Story, não sai feed.
  const r3 = await publicarNoInstagram(banco, config, em(20), f, cliente);
  assert.deepEqual([r3.feed, r3.stories], [0, 1], 'o feed só sai nas horas do feed');
});

test('instagram: só vai produto bem avaliado, muito vendido e sem cara de genérico', async () => {
  const ig = lerConfig(base).instagram;
  const o = oferta('Z', 5);
  assert.ok(passaNoFiltroDoInstagram({ ...o, nota: 4.8, vendas: 2000 }, ig));
  assert.ok(!passaNoFiltroDoInstagram({ ...o, nota: 4.5, vendas: 2000 }, ig), 'nota abaixo de 4,6');
  assert.ok(!passaNoFiltroDoInstagram({ ...o, nota: 4.8, vendas: 120 }, ig), 'poucas vendas');
  assert.ok(!passaNoFiltroDoInstagram({ ...o, nota: undefined, vendas: 2000 }, ig), 'sem nota não passa');
  assert.ok(!passaNoFiltroDoInstagram({ ...o, nota: 4.8, vendas: undefined }, ig), 'sem vendas informadas não passa');
  for (const titulo of ['Controle Genérico Bluetooth Ps4', 'Relógio Smartwatch Similar Original', 'Fone Paralelo Importado', 'Bolsa sem marca couro']) {
    assert.ok(!passaNoFiltroDoInstagram({ ...o, titulo, nota: 4.9, vendas: 9000 }, ig), titulo);
  }
  assert.ok(passaNoFiltroDoInstagram({ ...o, titulo: 'Smartwatch Amazfit Bip 5', nota: 4.7, vendas: 800 }, ig));

  // Na rodada: se nada passa, nada é publicado e o aviso explica por quê.
  const { banco } = await bancoComOfertas();
  const exigente = lerConfig({ ...base, INSTAGRAM_NOTA_MINIMA: '4.9' });
  const { f, chamadas } = apiFalsa();
  const r = await publicarNoInstagram(banco, exigente, AGORA, f, new Instagram('tok-secreto', '1789', f, 0));
  assert.deepEqual([r.feed, r.stories], [0, 0]);
  assert.match(r.avisos.join(' '), /filtro de qualidade/);
  assert.ok(!chamadas.some((c) => c.url.endsWith('/media')));
});

test('instagram: respeita o intervalo mínimo entre publicações (sem rajada)', async () => {
  const { banco, config } = await bancoComOfertas();
  const { f } = apiFalsa();
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  const r1 = await publicarNoInstagram(banco, config, AGORA, f, cliente);
  assert.deepEqual([r1.feed, r1.stories], [1, 1]);
  const meiaHora = new Date(AGORA.getTime() + 30 * 60_000);
  const r2 = await publicarNoInstagram(banco, config, meiaHora, f, cliente);
  assert.deepEqual([r2.feed, r2.stories], [0, 0], 'ainda dentro do intervalo');
  const umaHora = new Date(AGORA.getTime() + 61 * 60_000);
  const r3 = await publicarNoInstagram(banco, config, umaHora, f, cliente);
  assert.deepEqual([r3.feed, r3.stories], [0, 1], 'Story já pode (60 min), feed ainda não (180 min)');
  const tresHoras = new Date(AGORA.getTime() + 181 * 60_000);
  const r4 = await publicarNoInstagram(banco, config, tresHoras, f, cliente);
  assert.deepEqual([r4.feed, r4.stories], [1, 0], 'feed liberado; as ofertas de Story acabaram');
});

test('instagram: respeita limite diário, horário e PNG que ainda não está no ar', async () => {
  const { banco, config } = await bancoComOfertas();
  const { f } = apiFalsa();
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  const limitado = lerConfig({ ...base, INSTAGRAM_FEED_POR_DIA: '1', INSTAGRAM_STORIES_POR_DIA: '0' });
  const r1 = await publicarNoInstagram(banco, limitado, AGORA, f, cliente);
  assert.deepEqual([r1.feed, r1.stories], [1, 0]);
  const r2 = await publicarNoInstagram(banco, limitado, AGORA, f, cliente);
  assert.deepEqual([r2.feed, r2.stories], [0, 0], 'limite do dia atingido');

  const madrugada = new Date('2026-10-03T05:00:00Z');
  assert.deepEqual(await publicarNoInstagram(banco, config, madrugada, f, cliente), { feed: 0, stories: 0, reels: 0, avisos: [] });

  const { banco: b2, config: c2 } = await bancoComOfertas();
  const sem = apiFalsa({ pngNoAr: false });
  const r3 = await publicarNoInstagram(b2, c2, AGORA, sem.f, new Instagram('tok-secreto', '1789', sem.f, 0));
  assert.deepEqual([r3.feed, r3.stories], [0, 0], 'sem PNG público, não publica');
  assert.ok(!sem.chamadas.some((c) => c.url.endsWith('/media')), 'nem tenta criar o container');
});

test('instagram: avisa de falta de Secrets, desligado não faz nada, erro da API não derruba a rodada', async () => {
  const { banco } = await bancoComOfertas();
  const { f } = apiFalsa();
  assert.deepEqual(await publicarNoInstagram(banco, lerConfig({ ...base, INSTAGRAM_ATIVO: '0' }), AGORA, f), { feed: 0, stories: 0, reels: 0, avisos: [] });
  const semToken = await publicarNoInstagram(banco, lerConfig({ ...base, INSTAGRAM_TOKEN: '' }), AGORA, f);
  assert.match(semToken.avisos.join(' '), /INSTAGRAM_TOKEN/);
  const ruim = apiFalsa({ erroNaPublicacao: { code: 190, message: 'token vencido' } });
  const r = await publicarNoInstagram(banco, lerConfig(base), AGORA, ruim.f, new Instagram('t', '1789', ruim.f, 0));
  assert.match(r.avisos.join(' '), /token vencido/);
  assert.equal(banco.instagramNoDia('feed', AGORA), 0, 'o que falhou não é marcado como publicado');
});

test('instagram: avisa quando o token de 60 dias está perto de vencer', () => {
  const com = (data: string) => lerConfig({ ...base, INSTAGRAM_TOKEN_DATA: data });
  assert.equal(avisoDoToken(com('2026-09-20'), AGORA), undefined);
  assert.match(avisoDoToken(com('2026-08-10'), AGORA)!, /vence em 6 dias/);
  assert.match(avisoDoToken(com('2026-07-01'), AGORA)!, /venceu/);
  assert.match(avisoDoToken(com('ontem'), AGORA)!, /AAAA-MM-DD/);
  assert.equal(avisoDoToken(lerConfig(base), AGORA), undefined, 'sem data informada, sem aviso');
});

test('instagram: grava PNG de verdade (Story 1080x1920 e feed 1080x1350) em blog/social', async (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'ig-'));
  const config = lerConfig({ ...base, BLOG_PASTA: join(pasta, 'blog') });
  const teste = await renderizarPng('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', 10);
  if (!teste) return t.skip('conversor @resvg/resvg-js não instalado neste computador');
  const banco = new Banco(':memory:');
  banco.guardarParaSocial(oferta('A', 5), AGORA);
  await prepararSocial(banco, config, AGORA, (async () => new Response(null, { status: 404 })) as typeof fetch);
  const r = await gravarPngs(banco, config, AGORA);
  assert.deepEqual(r, { gravados: 2, semConversor: false });
  const chave = banco.socialRecentes(12, 5, AGORA)[0].chave;
  for (const [tipo, alt] of [['story', 1920], ['feed', 1350]] as const) {
    const arq = join(pasta, 'blog', 'social', arquivoDaArte(chave, tipo));
    assert.ok(existsSync(arq), tipo);
    const png = readFileSync(arq);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1080, 'largura');
    assert.equal(png.readUInt32BE(20), alt, 'altura');
  }
  assert.match(montarSvgDoFeed(oferta('A', 5), undefined, config), /width="1080" height="1350"/);
});

test('instagram: produto dos mais vendidos da loja passa mesmo sem nota e vendas informadas, mas palavra suspeita continua barrando', () => {
  const ig = lerConfig(base).instagram;
  const semDados = { ...oferta('R', 5), nota: undefined, vendas: undefined };
  assert.equal(passaNoFiltroDoInstagram(semDados, ig), false, 'sem nota e vendas e fora do ranking: não passa');
  assert.equal(passaNoFiltroDoInstagram({ ...semDados, maisVendido: true }, ig), true);
  assert.equal(passaNoFiltroDoInstagram({ ...semDados, maisVendido: true, titulo: 'Fone Genérico Bluetooth' }, ig), false);
  assert.equal(passaNoFiltroDoInstagram({ ...semDados, maisVendido: true, nota: 4.1 }, ig), false, 'nota informada e baixa continua barrando');
});