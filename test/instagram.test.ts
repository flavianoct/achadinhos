import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { avisoDoToken, ErroInstagram, Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { arquivoDaArte, gravarPngs, montarSvgDoFeed, prepararSocial, renderizarPng } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-03T15:00:00Z');
const base = { INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok-secreto', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23' };
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
  const { banco, config } = await bancoComOfertas();
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
  assert.deepEqual(await publicarNoInstagram(banco, config, madrugada, f, cliente), { feed: 0, stories: 0, avisos: [] });

  const { banco: b2, config: c2 } = await bancoComOfertas();
  const sem = apiFalsa({ pngNoAr: false });
  const r3 = await publicarNoInstagram(b2, c2, AGORA, sem.f, new Instagram('tok-secreto', '1789', sem.f, 0));
  assert.deepEqual([r3.feed, r3.stories], [0, 0], 'sem PNG público, não publica');
  assert.ok(!sem.chamadas.some((c) => c.url.endsWith('/media')), 'nem tenta criar o container');
});

test('instagram: avisa de falta de Secrets, desligado não faz nada, erro da API não derruba a rodada', async () => {
  const { banco } = await bancoComOfertas();
  const { f } = apiFalsa();
  assert.deepEqual(await publicarNoInstagram(banco, lerConfig({ ...base, INSTAGRAM_ATIVO: '0' }), AGORA, f), { feed: 0, stories: 0, avisos: [] });
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
