import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { baixarImagemComoDataUri, descontoConfiavel, ganchoDaOferta, hashtagsDaCategoria, montarGancho, montarLegenda, montarRoteiro, montarSvgDoFeed, montarSvgDoStory, nomeDoCanal, quebrarTexto, tituloParaArte } from '../src/social.ts';
import { layoutDoProduto, temaDaCategoria } from '../src/moldes.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({ BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos' });
const oferta: OfertaAvaliada = {
  loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Chaleira Elétrica 1,8L 1200W <INMA> & Cia', preco: 34.41, precoOriginal: 80, desconto: 57,
  link: 'https://exemplo/x', nota: 4.8, vendas: 5000, freteGratis: true, categoria: 'casa', pontos: 10,
};

test('social: legenda leva preço, canal, aviso de publi e hashtags da categoria', () => {
  const l = montarLegenda(oferta, config);
  assert.match(l, /De R\$ 80,00 por R\$ 34,41 \(-57%\)/);
  assert.match(l, /link na bio/);
  assert.match(l, /@topfera_achadinhos/); // sem blog publicado, cai no canal
  const comBlog = { ...config, blog: { ...config.blog, url: 'https://flavianoct.github.io/achadinhos/' } };
  assert.match(montarLegenda(oferta, comBlog), /flavianoct\.github\.io\/achadinhos(?!\/)/);
  assert.ok(!montarLegenda(oferta, comBlog).includes('https://'));
  assert.match(l, /Publi: link de afiliado/);
  assert.match(l.split('\n')[0], /#publi/, 'aviso de publicidade já na primeira linha, antes do "mais"');
  assert.match(l, /Desconto sobre o preço informado pela loja/);
  assert.match(l, /#cozinha/);
  assert.ok(!l.includes('https://exemplo/x'), 'link não vai na legenda, só na bio');
  assert.equal(nomeDoCanal(config), '@topfera_achadinhos');
  assert.ok(hashtagsDaCategoria('inexistente').includes('#achadinhos'));
});

test('social: o gancho só afirma o que o histórico e os dados provam', () => {
  const comHistorico = { ...oferta, menorPrecoEmDias: 12, quedaHistorica: 8 };
  assert.match(montarGancho(comHistorico), /8%.*12 dias|12 dias/);
  assert.match(montarGancho({ ...oferta, menorPrecoEmDias: 12, quedaHistorica: 0 }), /12 dias/);
  // Sem histórico confirmado, nunca fala em "menor preço" nem em "dias".
  const semHistorico = montarGancho({ ...oferta, menorPrecoEmDias: undefined, quedaHistorica: 30, desconto: 20, vendas: 10, nota: 4.0 });
  assert.doesNotMatch(semHistorico, /menor|registr|dias|vendas|queridinho/i);
  // "Campeão de vendas" só com muitas vendas e nota alta.
  assert.match(montarGancho({ ...oferta, desconto: 20, vendas: 5000, nota: 4.8 }), /5 ?mil|5\.000|vendidos|nota 4,8/i);
  assert.doesNotMatch(montarGancho({ ...oferta, desconto: 20, vendas: 5000, nota: 4.2 }), /vendidos|nota/i);
  // O mesmo produto repete a frase; produtos diferentes variam.
  assert.equal(montarGancho(oferta), montarGancho({ ...oferta }));
  const frases = new Set(Array.from({ length: 30 }, (_, i) => montarGancho({ ...oferta, idProduto: `MLB${i}`, desconto: 20, vendas: 10, nota: 4.0, menorPrecoEmDias: undefined })));
  assert.ok(frases.size > 1, 'ganchos variam entre produtos');
});

test('social: legenda abre com o gancho, tem no máximo 10 hashtags e mantém #publi', () => {
  const l = montarLegenda({ ...oferta, menorPrecoEmDias: 20, quedaHistorica: 12 }, config);
  assert.match(l.split('\n')[0], /20 dias/);
  const hashtags = l.match(/#\w+/g) ?? [];
  assert.ok(hashtags.length <= 10, `hashtags: ${hashtags.length}`);
  assert.equal(hashtags.filter((h) => h === '#publi').length, 1, '#publi uma vez só, na primeira linha');
  for (const cat of ['tech', 'casa', 'geral', 'pet']) assert.ok(hashtagsDaCategoria(cat).length <= 9 && !hashtagsDaCategoria(cat).includes('#publi'));
});

test('social: título completo na legenda, sem reticências; "De" some quando o histórico mostra preço inflado', () => {
  const longo = 'Câmera de Segurança Wi-Fi iCSee/Yoosee A28B 4K Dupla Lente Giratória Visão Noturna Colorida Detecção de Movimento Áudio Bidirecional';
  const l = montarLegenda({ ...oferta, titulo: longo }, config);
  assert.ok(l.includes(longo) && !l.includes('…'));
  const inflado = montarLegenda({ ...oferta, precoDe: 'inflado' }, config);
  assert.ok(!inflado.includes('De R$ 80,00') && !inflado.includes('(-57%)') && !inflado.includes('preço informado pela loja'));
  assert.match(inflado, /Por R\$ 34,41/);
});

test('social: título da arte é curto, sem reticências e sem terminar em palavra de ligação', () => {
  const casos = [
    'Câmera de Segurança Wi-Fi iCSee/Yoosee A28B 4K Dupla Lente Giratória Visão Noturna Colorida',
    'Fone Bluetooth TWS - Cancelamento de Ruído Ativo Bateria 30h Compatível Android iOS',
    'Kit 10 Pote De Vidro Marmita Hermético 640ml Freezer Fitness Rishon (Promoção Imperdível)',
    'Controle Sem Fio Joystick Genérico Bluetooth Compatível Para Ps4 Videogame Tv Samsung Pc P4 Ps 4 Manete',
  ];
  for (const t of casos) {
    const linhas = tituloParaArte(t, 34);
    assert.ok(linhas.length >= 1 && linhas.length <= 2, t);
    assert.ok(linhas.every((x) => x.length <= 34 && !x.includes('…')), linhas.join(' | '));
    assert.ok(!/\s(de|da|do|com|para|e|em)$/i.test(linhas.join(' ')), `termina em ligação: ${linhas.join(' ')}`);
  }
  assert.deepEqual(tituloParaArte('Fone Bluetooth TWS - Cancelamento de Ruído Ativo Bateria 30h', 34), ['Fone Bluetooth TWS']);
  assert.ok(!tituloParaArte(casos[2]!, 34).join(' ').match(/Promo|Imperd/i), 'parênteses e palavras de enchimento saem');
  assert.deepEqual(tituloParaArte('Chaleira Elétrica 1,8L', 34), ['Chaleira Elétrica 1,8L'], 'título curto fica como está');
});

test('social: o selo da arte dá um motivo (menor preço, economia) e, sem nada melhor, mostra a categoria; nunca "OFERTA"', () => {
  const com = { ...oferta, menorPrecoEmDias: 15 };
  assert.match(montarSvgDoStory(com, undefined, config), /MENOR PREÇO EM 15 DIAS/);
  assert.match(montarSvgDoFeed(com, undefined, config), /MENOR PREÇO/);
  assert.deepEqual(ganchoDaOferta(com), { gancho: 'MENOR PREÇO EM 15 DIAS', curto: 'MENOR PREÇO', tipo: 'historico' });
  assert.deepEqual(ganchoDaOferta(oferta), { gancho: 'ECONOMIZE R$ 46', curto: 'ECONOMIZE R$ 46', tipo: 'economia' }, '80 - 34,41');
  assert.equal(ganchoDaOferta({ ...oferta, precoOriginal: 1500, preco: 400 }).gancho, 'ECONOMIZE R$ 1.100');
  // Preço "de" inflado ou economia pequena: cai para a categoria.
  assert.equal(ganchoDaOferta({ ...oferta, precoDe: 'inflado' }).gancho, 'CASA E COZINHA');
  assert.equal(ganchoDaOferta({ ...oferta, precoOriginal: 40 }).tipo, 'categoria');
  assert.equal(ganchoDaOferta({ ...oferta, precoOriginal: undefined, desconto: undefined, categoria: 'tech' }).gancho, 'TECNOLOGIA');
  for (const o of [oferta, com, { ...oferta, precoOriginal: undefined }]) {
    for (const svg of [montarSvgDoStory(o, undefined, config), montarSvgDoFeed(o, undefined, config)]) assert.ok(!svg.includes('>OFERTA<'), 'sem o selo genérico');
  }
});

test('moldes: todo tema e todo layout geram arte válida, com preço, aviso de publi e título escapado', () => {
  const categorias = ['tech', 'casa', 'beleza', 'moda', 'esporte', 'games', 'bebe', 'ferramentas', 'pet', 'geral', 'inexistente'];
  const layouts = new Set<number>();
  for (const categoria of categorias) {
    for (let i = 0; i < 12; i++) {
      const o = { ...oferta, categoria, idProduto: `P${i}`, menorPrecoEmDias: i % 2 ? 9 : undefined };
      layouts.add(layoutDoProduto(o.idProduto));
      for (const [svg, w, h] of [[montarSvgDoStory(o, 'data:image/png;base64,AAAA'), 1080, 1920], [montarSvgDoFeed(o, 'data:image/png;base64,AAAA'), 1080, 1350]] as const) {
        assert.match(svg, new RegExp(`^<svg[^>]+width="${w}" height="${h}"`));
        assert.ok(svg.includes('R$ 34,41') && svg.includes('Publi · link de afiliado') && svg.includes('Link na bio') && svg.includes('MATA PREÇO'));
        assert.ok(!svg.includes('Ofertas no link da bio'), 'sem botão falso: a chamada é texto simples');
        assert.ok(svg.includes('4,8') && svg.includes('5 mil vendidos') && svg.includes('<polygon'), 'nota, vendas e estrela no próprio card');
        assert.ok(!svg.includes('<INMA>') && svg.includes('&lt;INMA&gt;'), 'título escapado');
        assert.equal(svg.includes('MENOR PREÇO'), i % 2 === 1, 'selo só com histórico confirmado');
      }
    }
  }
  assert.deepEqual([...layouts].sort(), [0, 1, 2], 'os três layouts são usados');
  assert.equal(layoutDoProduto('MLB123'), layoutDoProduto('MLB123'), 'o mesmo produto sempre sai com o mesmo layout');
  assert.notDeepEqual(temaDaCategoria('tech'), temaDaCategoria('casa'));
  assert.deepEqual(temaDaCategoria('inexistente'), temaDaCategoria('geral'));
});

test('moldes: preço longo encolhe para caber, preço normal mantém o tamanho', () => {
  const tamanho = (svg: string, preco: string) => Number(new RegExp(`font-size="(\\d+)"[^>]*>${preco.replace('$', '\\$')}<`).exec(svg)?.[1]);
  const normal = tamanho(montarSvgDoStory({ ...oferta, preco: 129.9, idProduto: 'X' }), 'R$ 129,90');
  const longo = tamanho(montarSvgDoStory({ ...oferta, preco: 4299.9, idProduto: 'X' }), 'R$ 4.299,90');
  assert.ok(normal > 0 && longo > 0 && longo < normal, `normal ${normal}, longo ${longo}`);
});

test('social: roteiro tem os 4 blocos de tempo', () => {
  const r = montarRoteiro(oferta, config);
  for (const t of ['0 a 3 s', '3 a 8 s', '8 a 12 s', '12 a 15 s']) assert.ok(r.includes(t), t);
});

test('social: arte do Story é um SVG válido de 1080x1920, com texto escapado e foto embutida', () => {
  const svg = montarSvgDoStory(oferta, 'data:image/png;base64,AAAA', config);
  assert.match(svg, /^<svg[^>]+width="1080" height="1920"/);
  assert.ok(svg.includes('&lt;INMA&gt; &amp; Cia') || svg.includes('&lt;INMA&gt;'), 'título escapado');
  assert.ok(!svg.includes('<INMA>'));
  assert.ok(svg.includes('data:image/png;base64,AAAA'));
  assert.match(svg, /-57%/);
  assert.match(svg, /R\$ 34,41/);
  assert.match(svg, /Frete grátis/);
  const semFoto =montarSvgDoStory({ ...oferta, precoOriginal: undefined, desconto: undefined, freteGratis: false }, undefined, config);
  assert.ok(!semFoto.includes('<image'));
  assert.ok(!semFoto.includes('line-through'));
});

test('social: quebra de texto respeita linhas e corta com reticências', () => {
  assert.deepEqual(quebrarTexto('um dois três', 30, 2), ['um dois três']);
  const l = quebrarTexto('palavra1 palavra2 palavra3 palavra4 palavra5 palavra6 palavra7', 20, 2);
  assert.equal(l.length, 2);
  assert.ok(l[1].endsWith('…'));
});

test('social: foto que falha ou não é imagem é ignorada sem derrubar a rodada', async () => {
  const resposta = (status: number, tipo: string, corpo: string) => (async () => new Response(corpo, { status, headers: { 'content-type': tipo } })) as typeof fetch;
  assert.equal(await baixarImagemComoDataUri('http://inseguro/x.png', resposta(200, 'image/png', 'x')), undefined);
  assert.equal(await baixarImagemComoDataUri('https://x/a.png', resposta(404, 'image/png', 'x')), undefined);
  assert.equal(await baixarImagemComoDataUri('https://x/a.png', resposta(200, 'text/html', '<html>')), undefined);
  assert.equal(await baixarImagemComoDataUri('https://x/a.png', (async () => { throw new Error('rede'); }) as typeof fetch), undefined);
  assert.match((await baixarImagemComoDataUri('https://x/a.png', resposta(200, 'image/png', 'abc'))) ?? '', /^data:image\/png;base64,/);
});

test('social: foto WebP (Mercado Livre) vira JPEG para o conversor de PNG conseguir desenhar', async () => {
  const { imagemParaPng } = await import('../src/social.ts');
  assert.equal(await imagemParaPng('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(await imagemParaPng(undefined), undefined);
  assert.equal(await imagemParaPng('data:image/webp;base64,lixo'), undefined);
});

test('social: preço "de", economia e porcentagem aparecem normalmente; só somem quando o histórico prova que o "de" é inflado', () => {
  assert.equal(descontoConfiavel(oferta), true);
  assert.equal(descontoConfiavel({ ...oferta, desconto: 65 }), true, 'desconto alto sem histórico continua valendo');
  assert.equal(descontoConfiavel({ ...oferta, maisVendido: true }), true, 'produto do ranking também');
  assert.equal(descontoConfiavel({ ...oferta, precoDe: 'confirmado' }), true);
  assert.equal(descontoConfiavel({ ...oferta, precoDe: 'inflado' }), false, 'histórico prova que o "de" é inflado');

  const ranking = { ...oferta, maisVendido: true, desconto: 43, precoOriginal: 78.9, preco: 44.97 };
  const legenda = montarLegenda(ranking, config);
  assert.match(legenda, /De R\$ 78,90 por R\$ 44,97 \(-43%\)/);
  assert.match(legenda, /preço informado pela loja/);
  const arte = montarSvgDoStory(ranking, undefined);
  assert.ok(arte.includes('-43%') && arte.includes('78,90') && arte.includes('44,97'));
  assert.equal(ganchoDaOferta(ranking).tipo, 'economia');
});
test('social: lista de modelos do título (iPhone X 11 12 13 14...) sai da legenda sem cortar títulos normais', () => {
  const l = montarLegenda({ ...oferta, titulo: 'Fone Bluetooth Compatível Com Iphone X Xr 11 12 13 14 15 16 17 Pro Max Sem Fio' }, config);
  assert.ok(!/11 12 13 14/.test(l) && l.includes('Fone Bluetooth Compatível Com Iphone X'));
  assert.ok(montarLegenda({ ...oferta, titulo: 'Galaxy S24 Ultra 512GB 5G' }, config).includes('Galaxy S24 Ultra 512GB 5G'));
});