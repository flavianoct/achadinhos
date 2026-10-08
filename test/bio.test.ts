import assert from 'node:assert/strict';
import { test } from 'node:test';
import { destinosDoWhatsapp, lerConfig } from '../src/config.ts';
import { paginaDaBio } from '../src/bio.ts';
import { montarLegenda } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({ BLOG_URL: 'https://flavianoct.github.io/achadinhos', BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos' });
const oferta: OfertaAvaliada = {
  loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Chaleira <b>Elétrica</b> 1,8L', preco: 34.41, precoOriginal: 80, desconto: 57,
  link: 'https://produto.mercadolivre.com.br/x?matt_word=topfera', imagem: 'https://img.exemplo/a.png', freteGratis: true, categoria: 'casa', pontos: 10,
};

test('bio: página leva botões do blog e do Telegram, ofertas com link de afiliado e aviso de publi', () => {
  const h = paginaDaBio([oferta], config, new Date('2026-10-03T15:00:00Z'));
  assert.match(h, /href="https:\/\/flavianoct\.github\.io\/achadinhos\/"/);
  assert.match(h, /href="https:\/\/t\.me\/topfera_achadinhos"/);
  assert.match(h, /matt_word=topfera/);
  assert.match(h, /Entrar no canal do Telegram/);
  assert.equal(h.split('href="https://t.me/topfera_achadinhos"').length - 1, 3, 'Telegram no topo, no fim e na mensagem de busca sem resultado');
  assert.match(h, /Publi:/);
  assert.match(h, /noindex/);
  assert.ok(!h.includes('<b>Elétrica'), 'título é escapado');
});

test('bio: sem ofertas mostra aviso amigável e ignora links que não são https', () => {
  const h = paginaDaBio([], config, new Date());
  assert.match(h, /estão chegando/);
  const semBlog = paginaDaBio([], lerConfig({}), new Date());
  assert.ok(!semBlog.includes('Entrar no canal do Telegram'));
});

test('config: BLOG_INSTAGRAM aceita @, nome ou endereço https e rejeita o resto', () => {
  assert.equal(lerConfig({ BLOG_INSTAGRAM: '@meu.perfil' }).blog.instagramLink, 'https://www.instagram.com/meu.perfil/');
  assert.equal(lerConfig({ BLOG_INSTAGRAM: 'meuperfil' }).blog.instagramLink, 'https://www.instagram.com/meuperfil/');
  assert.equal(lerConfig({ BLOG_INSTAGRAM: 'https://instagram.com/x/' }).blog.instagramLink, 'https://instagram.com/x/');
  assert.equal(lerConfig({ BLOG_INSTAGRAM: 'javascript:alert(1)' }).blog.instagramLink, '');
  assert.equal(lerConfig({}).blog.instagramLink, '');
});

test('bio: busca no aparelho filtra por produto sem acento, guarda até 60 ofertas e mostra só 12 antes de digitar', async () => {
  const muitas = Array.from({ length: 70 }, (_, i) => ({ ...oferta, idProduto: `MLB${i}`, titulo: i === 40 ? 'Tênis Corrida Masculino' : `Produto ${i}` }));
  const h = paginaDaBio(muitas.slice(0, 60), config, new Date());
  assert.equal(h.split('<li class="oferta').length - 1, 60);
  assert.equal(h.split('class="oferta extra"').length - 1, 48, 'só 12 aparecem antes de digitar');
  assert.match(h, /id="q" type="search"/);
  assert.match(h, /data-b="[^"]*tenis corrida masculino[^"]*"/, 'texto de busca sem acento');
  assert.match(h, /split\(\/\\s\+\/\)/, 'o JavaScript da página mantém as barras do regex');
  assert.match(h, /\\u0300-\\u036f/);
  assert.match(h, /id="nada"[^>]*>Não achei esse produto/);

  // Executa o script da página de verdade, com um DOM mínimo, para garantir que a busca filtra.
  const js = /<script>([\s\S]*?)<\/script>/.exec(h)![1]!;
  const itens = [...h.matchAll(/<li class="oferta[^"]*" data-b="([^"]*)"/g)].map((m) => ({ b: m[1]!, escondido: false, classList: { toggle(_: string, v: boolean) { this.parent.escondido = v; }, parent: null as any }, getAttribute(n: string) { return n === 'data-b' ? this.b : null; } }));
  for (const it of itens) it.classList.parent = it;
  const el: Record<string, any> = { q: { value: '', addEventListener(_: string, fn: () => void) { this.fn = fn; } }, lista: { children: itens, className: '' }, busca: { hidden: true }, info: { textContent: '' }, nada: { classList: { v: true, toggle(_: string, v: boolean) { this.v = v; } } } };
  new Function('document', js)({ getElementById: (id: string) => ({ q: el.q, lista: el.lista, busca: el.busca, info: el.info, nada: el.nada })[id] });
  el.q.value = 'TENIS';
  el.q.fn();
  assert.equal(itens.filter((i) => !i.escondido).length, 1, 'acha o tênis digitando sem acento e em maiúsculas');
  assert.equal(el.info.textContent, '1 oferta encontrada');
  el.q.value = 'geladeira';
  el.q.fn();
  assert.equal(el.nada.classList.v, false, 'sem resultado mostra a mensagem com o blog e o Telegram');
});
test('whatsapp: BLOG_WHATSAPP só aceita endereço https do WhatsApp; a bio mostra o botão e o blog os links', async () => {
  const canal = 'https://whatsapp.com/channel/0029VbDtCLD2UPBAGBZ4UO1W';
  assert.equal(lerConfig({ BLOG_WHATSAPP: canal }).blog.whatsappLink, canal);
  assert.equal(lerConfig({ BLOG_WHATSAPP: 'https://chat.whatsapp.com/ABC123' }).blog.whatsappLink, 'https://chat.whatsapp.com/ABC123');
  assert.equal(lerConfig({ BLOG_WHATSAPP: 'https://wa.me/5511999999999' }).blog.whatsappLink, 'https://wa.me/5511999999999');
  assert.equal(lerConfig({ BLOG_WHATSAPP: 'https://exemplo.com/channel/x' }).blog.whatsappLink, '');
  assert.equal(lerConfig({ BLOG_WHATSAPP: 'javascript:alert(1)' }).blog.whatsappLink, '');
  assert.equal(lerConfig({}).blog.whatsappLink, '');

  const comWhats = lerConfig({ BLOG_URL: 'https://flavianoct.github.io/achadinhos', BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos', BLOG_WHATSAPP: canal });
  const h = paginaDaBio([oferta], comWhats, new Date());
  assert.match(h, new RegExp(`class="botao whatsapp" href="${canal}"`));
  assert.match(h, /Receber no WhatsApp/);
  assert.ok(!paginaDaBio([oferta], config, new Date()).includes('Receber no WhatsApp'), 'sem o valor, o botão não aparece');
});
test('whatsapp: WHATSAPP_DESTINOS aceita canal e grupo, limpa parâmetros do link, tira repetidos e descarta o que não é do WhatsApp', () => {
  const canal = 'https://whatsapp.com/channel/0029VbDtCLD2UPBAGBZ4UO1W';
  const grupo = 'https://chat.whatsapp.com/KRJ3OtHhmZ10XfReNMTIaw';
  assert.deepEqual(destinosDoWhatsapp(`${canal}, ${grupo}?s=cl&p=a&mlu=4&ilr=4&iam=2`), [canal, grupo]);
  assert.deepEqual(destinosDoWhatsapp(`${grupo} ${grupo}?x=1,${canal}`), [grupo, canal]);
  assert.deepEqual(destinosDoWhatsapp('https://exemplo.com/channel/0029VbDtCLD2UPBAGBZ4UO1W,javascript:alert(1),  ,@g.us'), []);
  assert.deepEqual(lerConfig({ WHATSAPP_DESTINOS: canal }).whatsapp.destinos, [canal]);
  assert.deepEqual(lerConfig({}).whatsapp.destinos, []);
});

test('instagram e bio avisam do WhatsApp: legenda com a linha, bio com os botões de canal e grupo', () => {
  const canal = 'https://whatsapp.com/channel/0029VbDtCLD2UPBAGBZ4UO1W';
  const grupo = 'https://chat.whatsapp.com/KRJ3OtHhmZ10XfReNMTIaw';
  const completo = lerConfig({ BLOG_URL: 'https://flavianoct.github.io/achadinhos', BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos', BLOG_WHATSAPP: canal, WHATSAPP_DESTINOS: `${canal},${grupo}` });
  assert.match(montarLegenda(oferta, completo), /💬 Receba as ofertas também no WhatsApp \(canal e grupo\): link na bio/);
  assert.ok(!montarLegenda(oferta, config).includes('WhatsApp'), 'sem WhatsApp configurado, a legenda não promete');
  const h = paginaDaBio([oferta], completo, new Date());
  assert.match(h, new RegExp(`href="${canal}"[^>]*>Receber no WhatsApp \\(canal\\)`));
  assert.match(h, new RegExp(`href="${grupo}"[^>]*>Entrar no grupo do WhatsApp`));
  assert.ok(!paginaDaBio([oferta], lerConfig({ BLOG_WHATSAPP: canal }), new Date()).includes('Entrar no grupo'), 'sem grupo configurado não aparece o botão do grupo');
});