import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { ESTRATEGIAS, Pinterest, feedDosPins, galeriaDosPins, gravarPins, planilhaDosPins, prepararPins, publicarNoPinterest, svgDoPin, type DadosDoPin } from '../src/pinterest.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-12T15:00:00Z');
const base = {
  BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23', BLOG_TELEGRAM: 'https://t.me/mataprecocanal', BLOG_WHATSAPP: 'https://whatsapp.com/channel/abc',
  PINTEREST_ATIVO: '1', PINTEREST_PINS_POR_DIA: '6', BLOG_PASTA: '',
};

/** Foto de produto de mentira: fundo branco com uma forma escura no meio (serve para a silhueta). */
async function fotoDeProduto(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#fff"/><rect x="110" y="90" width="180" height="220" rx="40" fill="#1d3557"/><circle cx="200" cy="200" r="40" fill="#e63946"/></svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const produto = (n: number): OfertaAvaliada => ({
  loja: 'shopee', idProduto: `S${n}`, titulo: `Fone de Ouvido Bluetooth Modelo ${n} Sem Fio com Cancelamento de Ruido`, preco: 40 + n * 13.9, link: `https://s.shopee.com.br/${n}`,
  imagem: `https://down-br.img.susercontent.com/foto-${n}.png`, nota: 4.8, vendas: 2000 + n, categoria: 'tech', pontos: 100 - n, menorPrecoEmDias: n % 2 ? 30 : undefined,
});

function bancoComProdutos() {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 12; i++) banco.guardarParaSocial(produto(i), new Date(AGORA.getTime() - i * 60_000));
  return banco;
}

async function configComPasta(extra: Record<string, string> = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'pin-'));
  return lerConfig({ ...base, BLOG_PASTA: pasta, ...extra });
}

const foto = (async () => new Response(await fotoDeProduto(), { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;

test('pinterest: cria os pins do dia (2 por rodada), com estratégias diferentes, link do canal e sem preço', async () => {
  const config = await configComPasta();
  const banco = bancoComProdutos();
  assert.equal(await prepararPins(banco, config, AGORA, foto), 2);
  assert.equal(await prepararPins(banco, config, new Date(AGORA.getTime() + 1_800_000), foto), 2);
  assert.equal(await prepararPins(banco, config, new Date(AGORA.getTime() + 3_600_000), foto), 2);
  assert.equal(await prepararPins(banco, config, new Date(AGORA.getTime() + 5_400_000), foto), 0, 'limite do dia (6)');
  const pins = banco.pinsRecentes(1, new Date(AGORA.getTime() + 5_400_000));
  assert.equal(pins.length, 6);
  const estrategias = pins.map((p) => p.estrategia);
  assert.equal(new Set(estrategias).size, 6, `uma de cada: ${estrategias}`);
  for (const p of pins) {
    const d = JSON.parse(p.dados) as DadosDoPin;
    assert.ok(d.titulo.length <= 100 && d.descricao.length <= 800);
    assert.match(d.link, /^https:\/\/fulano\.github\.io\/achadinhos\/bio\.html\?utm_source=pinterest&utm_medium=pin&utm_campaign=/);
    assert.doesNotMatch(`${d.titulo} ${d.descricao} ${d.gancho.join(' ')}`, /R\$ ?\d/, 'sem preço em reais');
    assert.match(d.descricao, /Publi/);
  }
  // Os produtos não se repetem entre os pins.
  const ids = pins.flatMap((p) => (JSON.parse(p.dados) as DadosDoPin).produtos);
  assert.equal(new Set(ids).size, ids.length);
});

test('pinterest: desligado, sem URL do site ou fora do horário não cria nada', async () => {
  const banco = bancoComProdutos();
  assert.equal(await prepararPins(banco, await configComPasta({ PINTEREST_ATIVO: '0' }), AGORA, foto), 0);
  assert.equal(await prepararPins(banco, await configComPasta({ BLOG_URL: '' }), AGORA, foto), 0);
  assert.equal(await prepararPins(banco, await configComPasta(), new Date('2026-10-12T04:00:00Z'), foto), 0, '1h da manhã');
});

test('pinterest: sem produtos ainda há pins que não dependem de produto (benefícios e dica)', async () => {
  const config = await configComPasta();
  const banco = new Banco(':memory:');
  assert.equal(await prepararPins(banco, config, AGORA, foto), 2);
  const tipos = banco.pinsRecentes(1, AGORA).map((p) => p.estrategia).sort();
  assert.ok(tipos.every((t) => t === 'beneficio' || t === 'dica'), `${tipos}`);
});

test('pinterest: o desenho de cada estratégia é um SVG 1000x1500 com a chamada final e sem preço', async () => {
  const config = await configComPasta();
  const banco = bancoComProdutos();
  const config2 = await configComPasta({ PINTEREST_PINS_POR_DIA: '15' });
  for (let i = 0; i < 8; i++) await prepararPins(banco, config2, new Date(AGORA.getTime() + i * 1_800_000), foto);
  const vistas = new Set<string>();
  for (const p of banco.pinsRecentes(1, new Date(AGORA.getTime() + 8 * 1_800_000))) {
    const d = JSON.parse(p.dados) as DadosDoPin;
    const svg = svgDoPin(d, config);
    assert.match(svg, /width="1000" height="1500"/);
    assert.match(svg, /Publi: links de afiliado/);
    assert.match(svg, /WhatsApp e Telegram/);
    assert.doesNotMatch(svg, /R\$ ?\d/);
    vistas.add(d.estrategia);
  }
  assert.equal(vistas.size, ESTRATEGIAS.length, `todas as estratégias: ${[...vistas]}`);
});

test('pinterest: grava as imagens, a planilha de envio em massa, o feed RSS e a galeria', async () => {
  const config = await configComPasta({ PINTEREST_QUADRO: 'Meu quadro' });
  const banco = bancoComProdutos();
  await prepararPins(banco, config, AGORA, foto);
  const r = await gravarPins(banco, config, AGORA);
  assert.equal(r.semConversor, false);
  assert.equal(r.gravados, 2);
  const pasta = join(config.blog.pasta, 'pinterest');
  assert.equal(readdirSync(pasta).filter((f) => f.endsWith('.png')).length, 2);
  const png = readFileSync(join(pasta, readdirSync(pasta).find((f) => f.endsWith('.png'))!));
  assert.equal(png.readUInt32BE(16), 1000);
  assert.equal(png.readUInt32BE(20), 1500);
  const csv = readFileSync(join(pasta, 'pins.csv'), 'utf8');
  assert.match(csv, /^"Title","Media URL","Pinterest board"/);
  assert.match(csv, /"https:\/\/fulano\.github\.io\/achadinhos\/pinterest\/pin-2026-10-12-01-[a-z]+\.png","Meu quadro"/);
  const feed = readFileSync(join(pasta, 'feed.xml'), 'utf8');
  assert.match(feed, /<rss version="2.0">/);
  assert.equal((feed.match(/<item>/g) ?? []).length, 2);
  const galeria = readFileSync(join(config.blog.pasta, 'pinterest.html'), 'utf8');
  assert.match(galeria, /pinterest\.com\/pin\/create\/button\//);
  assert.match(galeria, /Salvar no Pinterest/);
  // As funções de texto também funcionam sem o disco.
  assert.ok(planilhaDosPins([], config).startsWith('"Title"'));
  assert.ok(feedDosPins([], config).includes('<channel>'));
  assert.ok(galeriaDosPins([], config).includes('estão chegando'));
});

test('pinterest: o código de verificação entra na meta tag do site', async () => {
  const config = await configComPasta({ PINTEREST_VERIFICACAO: 'abc123DEF456' });
  assert.equal(config.pinterest.verificacao, 'abc123DEF456');
  assert.equal(lerConfig({ ...base, PINTEREST_VERIFICACAO: '<script>' }).pinterest.verificacao, '', 'valor estranho é ignorado');
});

test('pinterest: publica pela API só com token e quadro, 1 por rodada, com a imagem no ar, e não repete', async () => {
  const config = await configComPasta({ PINTEREST_TOKEN: 'tok-pin', PINTEREST_BOARD_ID: '12345', PINTEREST_PINS_POR_DIA: '3' });
  const banco = bancoComProdutos();
  await prepararPins(banco, config, AGORA, foto);
  const chamadas: Array<{ url: string; metodo: string; auth: string; corpo: any }> = [];
  const noAr = { ok: false };
  const f = (async (url: string, init: any = {}) => {
    const metodo = init.method ?? 'GET';
    if (metodo === 'HEAD') return new Response(null, { status: noAr.ok ? 200 : 404 });
    chamadas.push({ url: String(url), metodo, auth: init.headers?.authorization, corpo: init.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ id: 'pin-1' }), { status: 201 });
  }) as unknown as typeof fetch;

  let r = await publicarNoPinterest(banco, config, AGORA, f);
  assert.equal(r.publicados, 0, 'imagem ainda fora do ar');
  noAr.ok = true;
  r = await publicarNoPinterest(banco, config, AGORA, f);
  assert.equal(r.publicados, 1);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0]!.url, 'https://api.pinterest.com/v5/pins');
  assert.equal(chamadas[0]!.auth, 'Bearer tok-pin');
  assert.equal(chamadas[0]!.corpo.board_id, '12345');
  assert.equal(chamadas[0]!.corpo.media_source.source_type, 'image_url');
  assert.match(chamadas[0]!.corpo.media_source.url, /^https:\/\/fulano\.github\.io\/achadinhos\/pinterest\/pin-2026-10-12-/);
  assert.match(chamadas[0]!.corpo.link, /utm_source=pinterest/);
  assert.equal(banco.pinsPublicadosNoDia(AGORA), 1);
  r = await publicarNoPinterest(banco, config, AGORA, f);
  assert.equal(r.publicados, 1, 'o segundo pin sai na próxima rodada');
  assert.notEqual(chamadas[1]!.corpo.media_source.url, chamadas[0]!.corpo.media_source.url);

  const semToken = await configComPasta();
  chamadas.length = 0;
  assert.deepEqual(await publicarNoPinterest(banco, semToken, AGORA, f), { publicados: 0, avisos: [] });
  assert.equal(chamadas.length, 0);
});

test('pinterest: token vencido vira aviso claro e a falha é contada (desiste depois de 3)', async () => {
  const config = await configComPasta({ PINTEREST_TOKEN: 'velho', PINTEREST_BOARD_ID: '1', PINTEREST_SANDBOX: '1' });
  const banco = bancoComProdutos();
  await prepararPins(banco, config, AGORA, foto);
  const urls: string[] = [];
  const f = (async (url: string, init: any = {}) => {
    if ((init.method ?? 'GET') === 'HEAD') return new Response(null, { status: 200 });
    urls.push(String(url));
    return new Response(JSON.stringify({ code: 2, message: 'Authentication failed.' }), { status: 401 });
  }) as unknown as typeof fetch;
  for (let i = 0; i < 3; i++) {
    const r = await publicarNoPinterest(banco, config, AGORA, f);
    assert.match(r.avisos.join(' '), /Pinterest recusou \(401\/2\).*PINTEREST_TOKEN/);
  }
  assert.ok(urls.every((u) => u.startsWith('https://api-sandbox.pinterest.com/v5/')), 'sandbox');
  const r = await publicarNoPinterest(banco, config, AGORA, f);
  assert.ok(!r.avisos.some((a) => a.includes('tentativa 4')));
  const cliente = new Pinterest('t', '1', false, (async () => new Response(JSON.stringify({ username: 'mataprecooficial', name: 'Achados' }))) as unknown as typeof fetch);
  assert.match(await cliente.checar(), /mataprecooficial/);
  assert.ok(existsSync(config.blog.pasta));
});
