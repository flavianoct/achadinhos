import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore: módulo .mjs puro, sem tipos
import { itemDaMensagem, linksDoML, podarItens, precosDaMensagem, PublicadorGitHub, textoDaMensagem, tituloDaMensagem } from '../enviador/espelho.mjs';
import { coletarEspelho, converterItemEspelho, lerEspelho } from '../src/fontes/espelho.ts';

const AFIL = { mercadolivre: { mattWord: 'meuword', mattTool: '123' } };
const AGORA = 1_800_000_000_000;

test('espelho: pega UM link do ML e ignora busca, lista e outras lojas', () => {
  assert.deepEqual(linksDoML('olha https://meli.la/2QztGYa!'), ['https://meli.la/2QztGYa']);
  assert.deepEqual(linksDoML('https://lista.mercadolivre.com.br/rtx-5070'), []);
  assert.deepEqual(linksDoML('https://www.mercadolivre.com.br/tv-lg/p/MLB1234567?matt_word=x'), ['https://www.mercadolivre.com.br/tv-lg/p/MLB1234567?matt_word=x']);
  assert.deepEqual(linksDoML('https://www.amazon.com.br/dp/B0ABC12345'), []);
});

test('espelho: preços (de/por, riscado, único) e descarta ambíguos e parcelas', () => {
  assert.deepEqual(precosDaMensagem('De R$ 1.999,00 por R$ 1.499,90'), { preco: 1499.9, precoOriginal: 1999 });
  assert.deepEqual(precosDaMensagem('~R$ 300~ R$ 199'), { preco: 199, precoOriginal: 300 });
  assert.deepEqual(precosDaMensagem('Só R$ 89,90 hoje'), { preco: 89.9 });
  assert.deepEqual(precosDaMensagem('R$ 899 ou 10x de R$ 89,90'), { preco: 899 });
  assert.equal(precosDaMensagem('R$ 10 e R$ 20 e R$ 30'), undefined);
  assert.equal(precosDaMensagem('sem preço'), undefined);
});

test('espelho: título ignora enfeite, link e preço', () => {
  assert.equal(tituloDaMensagem('🔥🔥 OFERTA 🔥\n*Fone JBL Tune 520BT Bluetooth*\n💰 R$ 199\nhttps://meli.la/abc'), 'Fone JBL Tune 520BT Bluetooth');
  assert.equal(tituloDaMensagem('🔥\nR$ 10\nhttps://meli.la/abc'), undefined);
});

test('espelho: item só com 1 link, preço claro e título; descarta lista de ofertas e palavras bloqueadas', () => {
  const ok = '🔥 *Fone JBL Tune 520BT Bluetooth*\nDe R$ 299 por R$ 199,90\nhttps://meli.la/2QztGYa';
  const i = itemDaMensagem(ok, { grupo: 'g@g.us', agora: AGORA });
  assert.equal(i.preco, 199.9);
  assert.equal(i.precoOriginal, 299);
  assert.equal(i.titulo, 'Fone JBL Tune 520BT Bluetooth');
  assert.equal(i.id, itemDaMensagem(ok.replace('2QztGYa', '2QztGYa?x=1'), { agora: AGORA }).id, 'mesmo link, mesmo id');
  assert.equal(itemDaMensagem(`${ok}\nhttps://meli.la/OUTRO12`), undefined, 'dois produtos');
  assert.equal(itemDaMensagem(`${ok}\nhttps://shopee.com.br/x`), undefined, 'link de outra loja junto');
  assert.equal(itemDaMensagem(ok, { palavrasBloqueadas: ['jbl'] }), undefined);
  assert.equal(itemDaMensagem('Fone JBL Tune 520BT\nhttps://meli.la/2QztGYa'), undefined, 'sem preço');
});

test('espelho: texto da mensagem do WhatsApp (legenda de foto, texto, efêmera)', () => {
  assert.equal(textoDaMensagem({ message: { imageMessage: { caption: 'oi' } } }), 'oi');
  assert.equal(textoDaMensagem({ message: { extendedTextMessage: { text: 'a' } } }), 'a');
  assert.equal(textoDaMensagem({ message: { ephemeralMessage: { message: { conversation: 'b' } } } }), 'b');
  assert.equal(textoDaMensagem({}), '');
});

test('espelho: poda por idade e quantidade', () => {
  const itens = [{ id: 'a', criadoEm: AGORA - 1000 }, { id: 'b', criadoEm: AGORA - 30 * 3_600_000 }, { id: 'c', criadoEm: AGORA - 2000 }];
  assert.deepEqual(podarItens(itens, AGORA).map((i: any) => i.id), ['a', 'c']);
  assert.deepEqual(podarItens(itens, AGORA, 48 * 3_600_000, 1).map((i: any) => i.id), ['a']);
});

test('espelho (robô): lerEspelho ignora item quebrado', () => {
  const r = lerEspelho({ itens: [{ id: 'a', criadoEm: 1, titulo: 't', preco: 10, link: 'https://meli.la/x' }, { id: 'b' }, null, { id: 'c', criadoEm: 1, titulo: 't', preco: -1, link: 'l' }] });
  assert.equal(r.length, 1);
  assert.deepEqual(lerEspelho(undefined), []);
});

test('espelho (robô): converte com o NOSSO código e usa o preço da vitrine; descarta preço muito diferente', () => {
  const item = { id: 'a', criadoEm: 1, titulo: 'Fone JBL Tune 520BT', preco: 199.9, precoOriginal: 299, link: 'https://meli.la/x', imagem: 'https://raw.githubusercontent.com/o/r/espelho/fotos/a.jpg' };
  const o = converterItemEspelho(item, 'https://www.mercadolivre.com.br/fone-jbl/p/MLB1234567?matt_word=outro&matt_tool=9', AFIL, 189.9)!;
  assert.equal(o.idProduto, 'MLB1234567');
  assert.equal(o.preco, 189.9);
  assert.match(o.link, /matt_word=meuword/);
  assert.match(o.link, /matt_tool=123/);
  assert.doesNotMatch(o.link, /outro/);
  assert.equal(o.imagem, item.imagem);
  assert.equal(converterItemEspelho(item, 'https://www.mercadolivre.com.br/fone-jbl/p/MLB1234567', AFIL, 90), undefined);
  assert.equal(converterItemEspelho(item, 'https://www.mercadolivre.com.br/fone-jbl/p/MLB1234567', {}), undefined);
});

test('espelho (robô): coleta de ponta a ponta com a vitrine do ML (rede simulada)', async () => {
  const espelho = { itens: [{ id: 'a', criadoEm: AGORA - 60_000, titulo: 'Fone JBL Tune 520BT Bluetooth', preco: 199.9, link: 'https://meli.la/abc123', imagem: 'https://raw.githubusercontent.com/o/r/espelho/fotos/a.jpg' }, { id: 'velho', criadoEm: AGORA - 10 * 3_600_000, titulo: 'Velho', preco: 5, link: 'https://meli.la/zzz' }] };
  const vitrine = '<meta property="og:title" content="Fone JBL Tune 520BT Bluetooth - R$ 189,90"/><script>{"url":"www.mercadolivre.com.br\\u002Ffone-jbl-tune-520bt-bluetooth\\u002Fp\\u002FMLB1234567"}</script>';
  const fetchFalso = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('espelho.json')) return new Response(JSON.stringify(espelho), { status: 200 });
    if (u.startsWith('https://meli.la/abc123')) return new Response('', { status: 301, headers: { location: 'https://www.mercadolivre.com.br/social/outro?matt_word=outro&ref=x' } });
    if (u.includes('/social/outro')) return new Response(vitrine, { status: 200 });
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
  const r = await coletarEspelho({ url: 'https://raw.githubusercontent.com/o/r/espelho/espelho.json', afiliados: AFIL, agora: AGORA, intervaloMs: 0 }, fetchFalso);
  assert.equal(r.lidos, 1, 'o item velho fica de fora');
  assert.equal(r.ofertas.length, 1);
  assert.equal(r.ofertas[0]!.preco, 189.9);
  assert.match(r.ofertas[0]!.link, /MLB1234567.*matt_word=meuword/);
});

test('espelho (robô): branch inexistente não derruba, e produto não identificado é descartado', async () => {
  const f404 = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
  const r = await coletarEspelho({ url: 'https://x/espelho.json', afiliados: AFIL }, f404);
  assert.equal(r.ofertas.length, 0);
  assert.match(r.erro!, /espelho/);
});

test('espelho (enviador): publica a foto, o json e apaga foto antiga', async () => {
  const chamadas: string[] = [];
  const fetchFalso = (async (url: string, init: any) => {
    const m = init.method;
    const caminho = String(url).replace('https://api.github.com/repos/o/r', '');
    chamadas.push(`${m} ${caminho.split('?')[0]}`);
    if (m === 'GET' && caminho.startsWith('/git/ref/heads/espelho')) return new Response('{}', { status: 404 });
    if (m === 'GET' && caminho === '') return new Response(JSON.stringify({ default_branch: 'main' }));
    if (m === 'GET' && caminho === '/git/ref/heads/main') return new Response(JSON.stringify({ object: { sha: 'abc' } }));
    if (m === 'POST') return new Response('{}', { status: 201 });
    if (m === 'GET' && caminho.startsWith('/contents/fotos')) return new Response(JSON.stringify([{ name: 'a.jpg', sha: '1' }, { name: 'velha.jpg', sha: '2' }]));
    if (m === 'GET') return new Response('{}', { status: 404 });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const p = new PublicadorGitHub({ token: 't', repo: 'o/r', fetchFn: fetchFalso });
  const finais = await p.publicar([{ id: 'a', criadoEm: AGORA, titulo: 'x', preco: 1, link: 'l' }], new Map([['a', Buffer.from('jpg')]]), AGORA);
  assert.equal(finais[0].imagem, 'https://raw.githubusercontent.com/o/r/espelho/fotos/a.jpg');
  assert.ok(chamadas.includes('POST /git/refs'));
  assert.ok(chamadas.includes('PUT /contents/fotos/a.jpg'));
  assert.ok(chamadas.includes('PUT /contents/espelho.json'));
  assert.ok(chamadas.includes('DELETE /contents/fotos/velha.jpg'));
  assert.ok(!chamadas.includes('DELETE /contents/fotos/a.jpg'));
});
