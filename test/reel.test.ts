import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { sintetizarMusica } from '../src/musica.ts';
import { arquivoDoReel, gravarReel, legendaDoReel, prepararReel, type DadosDoReel } from '../src/reel.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-03T15:00:00Z');
const base = { INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok-secreto', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23', INSTAGRAM_HORARIOS_FEED: '', INSTAGRAM_HORARIOS_STORIES: '', INSTAGRAM_HORARIOS_REELS: '' };

const produto = (n: number): OfertaAvaliada => ({
  loja: 'mercadolivre', idProduto: `MLB${n}`, titulo: `Produto Bom Numero ${n} Com Nome Longo Para Testar Legenda`, preco: 20 + n, link: `https://www.mercadolivre.com.br/p/MLB${n}`,
  imagem: `https://http2.mlstatic.com/foto-${n}.png`, nota: 4.8, vendas: 2000 + n, categoria: ['tech', 'casa', 'beleza'][n % 3]!, pontos: 100 - n,
});
const foto = (async () => new Response('abc', { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;

function bancoComProdutos() {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 12; i++) banco.guardarProduto(produto(i), new Date(AGORA.getTime() - i * 60_000));
  return banco;
}

test('música: WAV estéreo válido, com som, sem estourar e terminando em silêncio', () => {
  const wav = sintetizarMusica(4);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 44_100);
  assert.equal(wav.length, 44 + 4 * 44_100 * 4);
  let pico = 0;
  for (let i = 44; i < wav.length; i += 2) pico = Math.max(pico, Math.abs(wav.readInt16LE(i)));
  assert.ok(pico > 4000, 'tem som audível');
  assert.ok(pico < 32767, 'sem estourar');
  assert.ok(Math.abs(wav.readInt16LE(wav.length - 4)) < 50, 'termina com o fade no fim');
});

test('reel: cria um por dia com 3 produtos bons e a legenda não traz preço', async () => {
  const banco = bancoComProdutos();
  const config = lerConfig(base);
  assert.equal(await prepararReel(banco, config, AGORA, foto), true);
  assert.equal(await prepararReel(banco, config, AGORA, foto), false, 'só um por dia');
  const pendente = banco.reelPendente(AGORA)!;
  const dados = JSON.parse(pendente.dados) as DadosDoReel;
  assert.equal(dados.itens.length, 3);
  const legenda = legendaDoReel(dados, config);
  assert.match(legenda, /Caiu mesmo\? 3 achados de hoje/);
  assert.match(legenda, /O preço de agora está no grupo/);
  assert.match(legenda, /Publi:/);
  assert.ok(!/R\$/.test(legenda), 'o preço não vai na legenda: fica no grupo');
  assert.equal(await prepararReel(bancoComProdutos(), lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '0' }), AGORA, foto), false, 'desligado');
  // Com janela às 19h e 20h, o vídeo só é preparado a partir das 18h (o desconto e o selo de menor preço são de agora).
  const janela = lerConfig({ ...base, INSTAGRAM_HORARIOS_REELS: '19,20' });
  assert.equal(await prepararReel(bancoComProdutos(), janela, AGORA, foto), false, '12h: cedo demais');
  assert.equal(await prepararReel(bancoComProdutos(), janela, new Date('2026-10-03T21:10:00Z'), foto), true, '18h10: pode preparar');
});

test('reel: publica como REELS com o vídeo do site, só quando o vídeo está no ar e na hora certa; conta no dia e não repete', async () => {
  const banco = bancoComProdutos();
  await prepararReel(banco, lerConfig(base), AGORA, foto);
  const chamadas: Array<{ metodo: string; url: string; corpo: URLSearchParams }> = [];
  const noAr = { ok: true };
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    const metodo = init.method ?? 'GET';
    chamadas.push({ metodo, url: u, corpo: new URLSearchParams(init.body ? String(init.body) : u.split('?')[1] ?? '') });
    if (metodo === 'HEAD') return new Response(null, { status: noAr.ok ? 200 : 404 });
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'reel-1' }));
    if (u.includes('/media')) return new Response(JSON.stringify({ id: 'cont-1' }));
    if (u.includes('cont-1')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    return new Response(JSON.stringify({}));
  }) as unknown as typeof fetch;
  const cliente = new Instagram('tok-secreto', '1789', f, 0);

  noAr.ok = false;
  let r = await publicarNoInstagram(banco, lerConfig(base), AGORA, f, cliente);
  assert.equal(r.reels, 0, 'vídeo ainda fora do ar: espera');

  noAr.ok = true;
  r = await publicarNoInstagram(banco, lerConfig({ ...base, INSTAGRAM_HORARIOS_REELS: '20' }), AGORA, f, cliente);
  assert.equal(r.reels, 0, 'fora da hora dos Reels (12h, janela às 20h)');

  r = await publicarNoInstagram(banco, lerConfig(base), AGORA, f, cliente);
  assert.equal(r.reels, 1);
  const criar = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/1789/media') && c.corpo.get('media_type') === 'REELS')!;
  assert.match(criar.corpo.get('video_url')!, /^https:\/\/fulano\.github\.io\/achadinhos\/social\/reel-2026-10-03\.mp4$/);
  assert.match(criar.corpo.get('caption')!, /Caiu mesmo\? 3 achados de hoje/);
  assert.equal(banco.reelsPublicadosNoDia(AGORA), 1);

  r = await publicarNoInstagram(banco, lerConfig(base), AGORA, f, cliente);
  assert.equal(r.reels, 0, 'um por dia');
});

test('reel: falha ao publicar anota a tentativa e desiste depois de 3', async () => {
  const banco = bancoComProdutos();
  await prepararReel(banco, lerConfig(base), AGORA, foto);
  const f = (async (url: string, init: any = {}) => {
    if ((init.method ?? 'GET') === 'HEAD') return new Response(null, { status: 200 });
    return new Response(JSON.stringify({ error: { code: 2207026, message: 'video invalido' } }), { status: 400 });
  }) as unknown as typeof fetch;
  const cliente = new Instagram('tok-secreto', '1789', f, 0);
  for (let i = 0; i < 3; i++) {
    const r = await publicarNoInstagram(banco, lerConfig(base), AGORA, f, cliente);
    assert.match(r.avisos.join(' '), /o Reel não saiu/);
  }
  assert.equal(banco.reelPendente(AGORA), undefined, 'desistiu');
});

const temFfmpeg = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version']).status === 0;
test('reel: monta o mp4 vertical com o ffmpeg', { skip: !temFfmpeg && 'ffmpeg não instalado nesta máquina' }, async () => {
  const banco = bancoComProdutos();
  const pasta = mkdtempSync(join(tmpdir(), 'reel-teste-'));
  const config = lerConfig({ ...base, BLOG_PASTA: pasta });
  // As fotos do teste não são imagens de verdade: usa um PNG mínimo válido.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const fotoPng = (async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
  assert.equal(await prepararReel(banco, config, AGORA, fotoPng), true);
  const aviso = await gravarReel(banco, config, AGORA);
  assert.equal(aviso, undefined);
  const arquivo = join(pasta, 'social', arquivoDoReel(banco.reelPendente(AGORA)!.chave));
  assert.ok(existsSync(arquivo));
  assert.ok(statSync(arquivo).size > 100_000, 'vídeo com conteúdo');
  const sonda = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-i', arquivo], { encoding: 'utf8' });
  assert.match(sonda.stderr, /1080x1920/);
  assert.match(sonda.stderr, /Audio: aac/);
});
