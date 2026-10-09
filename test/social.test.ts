import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { baixarImagemComoDataUri, descontoConfiavel, descontoParaArte, ganchoDaOferta, hashtagsDaCategoria, montarGancho, montarLegenda, montarRoteiro, montarSvgDoFeed, montarSvgDoStory, nomeDoCanal, perguntaDaArte, quebrarTexto, tituloParaArte } from '../src/social.ts';
import { linhasDaPergunta, MARCA } from '../src/moldes.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({ BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos' });
const oferta: OfertaAvaliada = {
  loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Chaleira Elétrica 1,8L 1200W <INMA> & Cia', preco: 34.41, precoOriginal: 80, desconto: 57,
  link: 'https://exemplo/x', nota: 4.8, vendas: 5000, freteGratis: true, categoria: 'casa', pontos: 10,
};

test('social: legenda leva o desconto em %, manda o preço para o grupo (sem valor em reais), canal, aviso de publi e hashtags', () => {
  const l = montarLegenda(oferta, config);
  assert.doesNotMatch(l, /R\$/, 'nenhum valor em reais na legenda');
  assert.match(l, /O preço de agora está no grupo/);
  assert.match(l, /57% abaixo do preço informado pela loja/);
  assert.match(l, /link na bio/);
  assert.match(l, /@topfera_achadinhos/); // sem blog publicado, cai no canal
  const comBlog = { ...config, blog: { ...config.blog, url: 'https://flavianoct.github.io/achadinhos/' } };
  assert.match(montarLegenda(oferta, comBlog), /flavianoct\.github\.io\/achadinhos(?!\/)/);
  assert.ok(!montarLegenda(oferta, comBlog).includes('https://'));
  assert.match(l, /Publi: link de afiliado/);
  assert.match(l.split('\n')[0], /#publi/, 'aviso de publicidade já na primeira linha, antes do "mais"');
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

test('social: título completo na legenda, sem reticências; o desconto some quando o histórico mostra preço inflado', () => {
  const longo = 'Câmera de Segurança Wi-Fi iCSee/Yoosee A28B 4K Dupla Lente Giratória Visão Noturna Colorida Detecção de Movimento Áudio Bidirecional';
  const l = montarLegenda({ ...oferta, titulo: longo }, config);
  assert.ok(l.includes(longo) && !l.includes('…'));
  const inflado = montarLegenda({ ...oferta, precoDe: 'inflado' }, config);
  assert.ok(!inflado.includes('57%') && !inflado.includes('preço informado pela loja'));
  assert.match(inflado, /O preço de agora está no grupo/);
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

test('social: o selo da arte dá um motivo (menor preço, desconto em %) e, sem nada melhor, mostra a categoria; nunca "OFERTA" nem reais', () => {
  const com = { ...oferta, menorPrecoEmDias: 15 };
  assert.match(montarSvgDoStory(com, undefined, config), /MENOR PREÇO EM 15 DIAS/);
  assert.match(montarSvgDoFeed(com, undefined, config), /MENOR PREÇO/);
  assert.deepEqual(ganchoDaOferta(com), { gancho: 'MENOR PREÇO EM 15 DIAS', curto: 'MENOR PREÇO', tipo: 'historico' });
  assert.deepEqual(ganchoDaOferta(oferta), { gancho: 'DESCONTO DE 57%', curto: 'DESCONTO DE 57%', tipo: 'desconto' });
  assert.equal(ganchoDaOferta({ ...oferta, desconto: undefined }).gancho, 'DESCONTO DE 57%', 'sem o % da loja, calcula pelo preço "de"');
  assert.equal(descontoParaArte({ ...oferta, desconto: undefined, precoOriginal: 1500, preco: 400 }), 73);
  // Preço "de" inflado ou desconto pequeno: cai para a categoria.
  assert.equal(ganchoDaOferta({ ...oferta, precoDe: 'inflado' }).gancho, 'CASA E COZINHA');
  assert.equal(ganchoDaOferta({ ...oferta, precoOriginal: undefined, desconto: 5 }).tipo, 'categoria');
  assert.equal(ganchoDaOferta({ ...oferta, precoOriginal: undefined, desconto: undefined, categoria: 'tech' }).gancho, 'TECNOLOGIA');
  for (const o of [oferta, com, { ...oferta, precoOriginal: undefined }]) {
    for (const svg of [montarSvgDoStory(o, undefined, config), montarSvgDoFeed(o, undefined, config)]) {
      assert.ok(!svg.includes('>OFERTA<'), 'sem o selo genérico');
      assert.doesNotMatch(svg, /R\$/, 'nenhum valor em reais na arte');
    }
  }
});

test('social: a pergunta da arte é "CAIU MESMO?" quando há motivo e "QUANTO CUSTA AGORA?" quando não há', () => {
  assert.equal(perguntaDaArte({ ...oferta, menorPrecoEmDias: 9 }), 'CAIU MESMO?');
  assert.equal(perguntaDaArte(oferta), 'CAIU MESMO?', 'desconto confiável');
  assert.equal(perguntaDaArte({ ...oferta, precoDe: 'inflado' }), 'QUANTO CUSTA AGORA?', 'sem motivo confiável não promete queda');
  assert.deepEqual(linhasDaPergunta('CAIU MESMO?'), ['CAIU MESMO?']);
  assert.deepEqual(linhasDaPergunta('QUANTO CUSTA AGORA?'), ['QUANTO CUSTA', 'AGORA?']);
});

test('moldes: toda arte da marca é válida, sem preço em reais, com a pergunta, a faixa do grupo, o aviso de publi e o título escapado', () => {
  const categorias = ['tech', 'casa', 'beleza', 'moda', 'esporte', 'games', 'bebe', 'ferramentas', 'pet', 'geral', 'inexistente'];
  for (const categoria of categorias) {
    for (let i = 0; i < 6; i++) {
      const o = { ...oferta, categoria, idProduto: `P${i}`, menorPrecoEmDias: i % 2 ? 9 : undefined, precoDe: i === 4 ? ('inflado' as const) : undefined };
      for (const [svg, w, h] of [[montarSvgDoStory(o, 'data:image/png;base64,AAAA'), 1080, 1920], [montarSvgDoFeed(o, 'data:image/png;base64,AAAA'), 1080, 1350]] as const) {
        assert.match(svg, new RegExp(`^<svg[^>]+width="${w}" height="${h}"`));
        assert.doesNotMatch(svg, /R\$|34,41|80,00/, 'nenhum valor em reais na arte');
        assert.ok(svg.includes('MATA') && svg.includes('PREÇO'), 'a marca');
        assert.ok(svg.includes(MARCA.faixa) && svg.includes(MARCA.faixaCurta), 'a faixa que leva ao grupo');
        assert.ok(svg.includes('Publi · link de afiliado'), 'aviso de publi');
        assert.ok(/CAIU MESMO\?|QUANTO CUSTA|AGORA\?/.test(svg), 'a pergunta');
        assert.ok(svg.includes('4,8') && svg.includes('5 mil vendidos') && svg.includes('<polygon'), 'nota, vendas e estrela no próprio card');
        assert.ok(!svg.includes('<INMA>') && svg.includes('&lt;INMA&gt;'), 'título escapado');
        assert.equal(svg.includes('MENOR PREÇO'), i % 2 === 1, 'selo só com histórico confirmado');
        assert.ok(!svg.includes('ACHADINHOS DO DIA'), 'a marca antiga saiu');
      }
    }
  }
  // O mesmo produto sai sempre igual (um só layout, sem sorteio).
  assert.equal(montarSvgDoStory(oferta, undefined), montarSvgDoStory({ ...oferta }, undefined));
});

test('moldes: a pergunta comprida quebra em duas linhas e nada passa da largura da arte', () => {
  const svg = montarSvgDoStory({ ...oferta, precoDe: 'inflado' }, undefined);
  assert.ok(svg.includes('>QUANTO CUSTA<') && svg.includes('>AGORA?<'));
  const tamanho = (texto: string) => Number(new RegExp(`font-size="(\\d+)"[^>]*>${texto}<`).exec(svg)?.[1]);
  assert.ok(tamanho('QUANTO CUSTA') * 'QUANTO CUSTA'.length * 0.7 <= 960, 'a linha cabe nas margens');
});

test('moldes: título e prova social ficam sempre acima da faixa do grupo, com a pergunta de uma ou de duas linhas e o título de uma ou de duas linhas', () => {
  const casos = [oferta, { ...oferta, precoDe: 'inflado' as const }, { ...oferta, titulo: 'Fone', precoDe: 'inflado' as const }, { ...oferta, titulo: 'Fone Bluetooth Sem Fio Cancelamento de Ruído Ativo Bateria 30h Compatível', menorPrecoEmDias: 9 }];
  for (const o of casos) {
    for (const [svg, yFaixa] of [[montarSvgDoStory(o, undefined), 1660], [montarSvgDoFeed(o, undefined), 1130]] as const) {
      const linhaDasVendas = /<text x="[\d.]+" y="([\d.]+)"[^>]*>[^<]*5 mil vendidos/.exec(svg);
      assert.ok(linhaDasVendas, 'a prova social aparece');
      assert.ok(Number(linhaDasVendas![1]) < yFaixa - 10, `a prova social (y ${linhaDasVendas![1]}) fica acima da faixa (y ${yFaixa})`);
    }
  }
});

test('social: roteiro tem os 4 blocos de tempo e não fala em valor em reais', () => {
  const r = montarRoteiro(oferta, config);
  for (const t of ['0 a 3 s', '3 a 8 s', '8 a 12 s', '12 a 15 s']) assert.ok(r.includes(t), t);
  assert.match(r, /Caiu mesmo/);
  assert.match(r, /está no grupo/);
  assert.ok(!/R\$ ?\d/.test(r), 'sem valor em reais no roteiro');
});

test('social: arte do Story é um SVG válido de 1080x1920, com texto escapado e foto embutida', () => {
  const svg = montarSvgDoStory(oferta, 'data:image/png;base64,AAAA', config);
  assert.match(svg, /^<svg[^>]+width="1080" height="1920"/);
  assert.ok(svg.includes('&lt;INMA&gt; &amp; Cia') || svg.includes('&lt;INMA&gt;'), 'título escapado');
  assert.ok(!svg.includes('<INMA>'));
  assert.ok(svg.includes('data:image/png;base64,AAAA'));
  assert.match(svg, /-57%/);
  assert.doesNotMatch(svg, /R\$|34,41/, 'o preço não vai na arte');
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

test('social: o desconto em % aparece normalmente; só some quando o histórico prova que o "de" é inflado', () => {
  assert.equal(descontoConfiavel(oferta), true);
  assert.equal(descontoConfiavel({ ...oferta, desconto: 65 }), true, 'desconto alto sem histórico continua valendo');
  assert.equal(descontoConfiavel({ ...oferta, maisVendido: true }), true, 'produto do ranking também');
  assert.equal(descontoConfiavel({ ...oferta, precoDe: 'confirmado' }), true);
  assert.equal(descontoConfiavel({ ...oferta, precoDe: 'inflado' }), false, 'histórico prova que o "de" é inflado');

  const ranking = { ...oferta, maisVendido: true, desconto: 43, precoOriginal: 78.9, preco: 44.97 };
  const legenda = montarLegenda(ranking, config);
  assert.match(legenda, /43% abaixo do preço informado pela loja/);
  assert.doesNotMatch(legenda, /R\$/);
  const arte = montarSvgDoStory(ranking, undefined);
  assert.ok(arte.includes('-43%'));
  assert.doesNotMatch(arte, /78,90|44,97|R\$/);
  assert.equal(ganchoDaOferta(ranking).tipo, 'desconto');
});
test('social: lista de modelos do título (iPhone X 11 12 13 14...) sai da legenda sem cortar títulos normais', () => {
  const l = montarLegenda({ ...oferta, titulo: 'Fone Bluetooth Compatível Com Iphone X Xr 11 12 13 14 15 16 17 Pro Max Sem Fio' }, config);
  assert.ok(!/11 12 13 14/.test(l) && l.includes('Fone Bluetooth Compatível Com Iphone X'));
  assert.ok(montarLegenda({ ...oferta, titulo: 'Galaxy S24 Ultra 512GB 5G' }, config).includes('Galaxy S24 Ultra 512GB 5G'));
});