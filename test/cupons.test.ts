import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { readFileSync } from 'node:fs';
import { chaveDoCupom, cupomVigente, escolherCupom, lerCupons, montarMensagemCupom, urlDoBannerDoCupom } from '../src/cupons.ts';
import { svgDoBannerDoCupom } from '../src/moldes.ts';
import { Telegram } from '../src/telegram.ts';
import { Banco } from '../src/db.ts';
import { postarProximoCupom } from '../src/pipeline.ts';
import type { Cupom } from '../src/cupons.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({});
// 3 de outubro de 2026, 15h em Brasília.
const AGORA = new Date('2026-10-03T18:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);

const ml: Cupom = { loja: 'mercadolivre', codigo: 'ACHA30', titulo: 'R$ 30 OFF acima de R$ 200', link: 'https://meli.la/abc', validoAte: '2026-10-10' };
const shopee: Cupom = { loja: 'shopee', titulo: 'R$ 10 OFF sem mínimo', link: 'https://shp.ee/xyz' };

class Falso {
  cupons: string[] = [];
  falha?: Error;
  async publicar(_: OfertaAvaliada) {}
  async publicarCupom(c: Cupom) {
    if (this.falha) throw this.falha;
    this.cupons.push(c.titulo);
  }
}

test('cupons: arquivo válido é lido; erros viram avisos e o cupom ruim é ignorado', () => {
  const lido = lerCupons(JSON.stringify([ml, shopee, { loja: 'amazon', titulo: 'x', link: 'https://amazon.com.br/x' }, { loja: 'shopee', titulo: 'Link de outra loja', link: 'https://mercadolivre.com.br/x' }, { loja: 'shopee', titulo: 'sem https', link: 'http://shp.ee/x' }, { loja: 'shopee', titulo: 'data torta', link: 'https://shp.ee/x', validoAte: '10/10/2026' }, { loja: 'shopee', link: 'https://shp.ee/x' }]));
  assert.equal(lido.cupons.length, 2);
  assert.equal(lido.avisos.length, 5);
  assert.match(lido.avisos.join('\n'), /não é do Shopee/);
  assert.deepEqual(lerCupons('').cupons, []);
  assert.deepEqual(lerCupons('[]').avisos, []);
  assert.match(lerCupons('{ quebrado').avisos[0], /JSON válido/);
  assert.match(lerCupons('{}').avisos[0], /lista/);
});

test('cupons: vale até o fim do dia de validade, no horário de Brasília', () => {
  assert.equal(cupomVigente(ml, new Date('2026-10-11T02:30:00Z')), true); // 23h30 do dia 10
  assert.equal(cupomVigente(ml, new Date('2026-10-11T03:30:00Z')), false); // 0h30 do dia 11
  assert.equal(cupomVigente(shopee, dias(400)), true, 'sem data vale sempre');
});

test('cupons: mensagem com código, sem código, aviso de vencimento e HTML escapado', () => {
  const m = montarMensagemCupom(ml, AGORA);
  assert.match(m, /CUPOM MERCADO LIVRE/);
  assert.match(m, /<code>ACHA30<\/code>/);
  assert.match(m, /Válido até 10\/10\/2026/);
  assert.match(montarMensagemCupom(shopee, AGORA), /Sem código/);
  assert.match(montarMensagemCupom(ml, dias(7)), /Vence hoje/);
  assert.ok(montarMensagemCupom({ ...ml, titulo: 'A <b> & B' }, AGORA).includes('A &lt;b&gt; &amp; B'));
});

test('cupons: nunca postado primeiro; depois só após o intervalo; o que vence antes tem prioridade; vencido nunca', () => {
  const postados = new Map<string, number>();
  const ultimo = (k: string) => postados.get(k);
  assert.equal(escolherCupom([shopee, ml], ultimo, 3, AGORA)?.titulo, ml.titulo, 'vence antes');
  postados.set(chaveDoCupom(ml), AGORA.getTime());
  assert.equal(escolherCupom([ml, shopee], ultimo, 3, AGORA)?.titulo, shopee.titulo, 'novo antes de repetir');
  postados.set(chaveDoCupom(shopee), AGORA.getTime());
  assert.equal(escolherCupom([ml, shopee], ultimo, 3, dias(1)), undefined, 'dentro do intervalo');
  assert.equal(escolherCupom([ml, shopee], ultimo, 3, dias(4))?.titulo, ml.titulo, 'passou o intervalo, o que vence antes sai');
  assert.equal(escolherCupom([ml], () => undefined, 3, dias(8)), undefined, 'vencido');
});

test('cupons: pipeline respeita horário, limite por dia e registra o post', async () => {
  const banco = new Banco(':memory:');
  const pub = new Falso();
  const c = [ml, shopee, { ...shopee, titulo: 'Outro' }, { ...shopee, titulo: 'Mais um' }];
  assert.equal((await postarProximoCupom(pub, banco, c, config, new Date('2026-10-03T08:00:00Z'))).postou, false, '5h em Brasília');
  for (let i = 0; i < 3; i++) assert.equal((await postarProximoCupom(pub, banco, c, config, AGORA)).postou, true);
  const quarto = await postarProximoCupom(pub, banco, c, config, AGORA);
  assert.deepEqual(quarto, { postou: false, motivo: 'limite diário' });
  assert.equal(pub.cupons.length, 3);
  assert.equal(new Set(pub.cupons).size, 3, 'sem repetir no mesmo dia');
  assert.deepEqual(await postarProximoCupom(pub, banco, [], config, dias(1)), { postou: false, motivo: 'sem cupom' });
});

test('cupons: erro de envio não registra o cupom, desligado não posta', async () => {
  const banco = new Banco(':memory:');
  const pub = new Falso();
  pub.falha = new Error('rede');
  const r = await postarProximoCupom(pub, banco, [ml], config, AGORA);
  assert.deepEqual(r, { postou: false, motivo: 'erro', detalhe: 'rede' });
  assert.equal(banco.cuponsNoDia(AGORA), 0);
  const off = lerConfig({ CUPONS_ATIVO: '0' });
  assert.deepEqual(await postarProximoCupom(new Falso(), banco, [ml], off, AGORA), { postou: false, motivo: 'desligado' });
});

// ───────────── banner do cupom ─────────────

function telegramFalso(recusaDaFoto?: { status: number }) {
  const chamadas: Array<{ metodo: string; corpo: any }> = [];
  const f = (async (url: any, init: any) => {
    const metodo = String(url).split('/').pop()!;
    chamadas.push({ metodo, corpo: JSON.parse(init.body) });
    if (metodo === 'sendPhoto' && recusaDaFoto) return new Response(JSON.stringify({ ok: false, description: 'wrong file identifier/HTTP URL specified' }), { status: recusaDaFoto.status });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;
  return { telegram: new Telegram('token', '-1001234567890', f), chamadas };
}

test('cupom: o banner é um ticket na cor da loja, com o nome dela, sem valor nenhum', () => {
  const ml = svgDoBannerDoCupom('mercadolivre');
  const sp = svgDoBannerDoCupom('shopee');
  for (const svg of [ml, sp]) {
    assert.match(svg, /^<svg[^>]+width="1280" height="720"/);
    assert.ok(svg.includes('>CUPOM<'));
    assert.equal((svg.match(/>MATA</g) ?? []).length, 1, 'a marca aparece uma vez só');
    assert.doesNotMatch(svg, /R\$|\d%/, 'o valor do cupom fica na legenda, nunca na imagem');
  }
  assert.ok(ml.includes('DO MERCADO LIVRE') && ml.includes('#FFE600'));
  assert.ok(sp.includes('DA SHOPEE') && sp.includes('#EE4D2D'));
  assert.ok(!ml.includes('SHOPEE') && !sp.includes('MERCADO'), 'cada banner cita só a sua loja');
});

test('cupom: os banners são arquivos do repositório e o endereço aponta para eles', () => {
  assert.equal(urlDoBannerDoCupom('shopee', 'flavianoct/achadinhos'), 'https://raw.githubusercontent.com/flavianoct/achadinhos/main/marca/cupons/cupom-shopee.png');
  assert.match(urlDoBannerDoCupom('mercadolivre', 'outro/repo'), /outro\/repo\/main\/marca\/cupons\/cupom-mercadolivre\.png$/);
  for (const loja of ['mercadolivre', 'shopee']) {
    const png = readFileSync(new URL(`../marca/cupons/cupom-${loja}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 1280, `${loja}: largura`);
    assert.equal(png.readUInt32BE(20), 720, `${loja}: altura`);
  }
});

test('cupom: sai como foto com a mensagem na legenda e o botão de pegar o cupom', async () => {
  const { telegram, chamadas } = telegramFalso();
  await telegram.publicarCupom(ml);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0]!.metodo, 'sendPhoto');
  const corpo = chamadas[0]!.corpo;
  assert.match(corpo.photo, /marca\/cupons\/cupom-mercadolivre\.png$/);
  assert.match(corpo.caption, /CUPOM MERCADO LIVRE/);
  assert.match(corpo.caption, /ACHA30/);
  assert.equal(corpo.reply_markup.inline_keyboard[0][0].url, ml.link);
  await telegram.publicarCupom(shopee);
  assert.match(chamadas[1]!.corpo.photo, /cupom-shopee\.png$/, 'cada loja com o seu banner');
});

test('cupom: se a foto for recusada, o cupom sai em texto e não se perde; erro de rede não duplica', async () => {
  const recusada = telegramFalso({ status: 400 });
  await recusada.telegram.publicarCupom(shopee);
  assert.deepEqual(recusada.chamadas.map((c) => c.metodo), ['sendPhoto', 'sendMessage']);
  assert.match(recusada.chamadas[1]!.corpo.text, /CUPOM SHOPEE/);
  assert.equal(recusada.chamadas[1]!.corpo.reply_markup.inline_keyboard[0][0].url, shopee.link);

  // Erro que não é definitivo (Telegram fora do ar): sobe para tentar de novo na rodada seguinte, sem mandar duas vezes.
  const fora = telegramFalso({ status: 500 });
  await assert.rejects(() => fora.telegram.publicarCupom(ml));
  assert.deepEqual(fora.chamadas.map((c) => c.metodo), ['sendPhoto']);

  // Mensagem comprida demais para legenda (mais de 1024 caracteres): vai direto em texto.
  const comprido = telegramFalso();
  await comprido.telegram.publicarCupom({ ...ml, detalhe: 'x'.repeat(1100) });
  assert.deepEqual(comprido.chamadas.map((c) => c.metodo), ['sendMessage']);
});
