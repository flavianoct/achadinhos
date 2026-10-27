import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { GATILHOS_DE_EXCLUSIVIDADE, GATILHOS_DE_URGENCIA, baixarImagemComoDataUri, descontoConfiavel, ganchoDaOferta, hashtagsDaCategoria, montarGancho, montarLegenda, montarRoteiro, montarSvgDoFeed, montarSvgDoStory, nomeDoCanal, perguntaDaArte, quebrarTexto, seloDaOferta, tituloParaArte } from '../src/social.ts';
import { CORES_DO_NICHO, linhasDaPergunta, MARCA } from '../src/moldes.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({ BLOG_TELEGRAM: 'https://t.me/topfera_achadinhos' });
const oferta: OfertaAvaliada = {
  loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Chaleira Elétrica 1,8L 1200W <INMA> & Cia', preco: 34.41, precoOriginal: 80, desconto: 57,
  link: 'https://exemplo/x', nota: 4.8, vendas: 5000, freteGratis: true, categoria: 'casa', pontos: 10,
};

test('social: legenda sem valor nenhum, manda o preço para o grupo com gatilho, canal, aviso de publi e hashtags', () => {
  const l = montarLegenda(oferta, config);
  assert.doesNotMatch(l, /R\$/, 'nenhum valor em reais na legenda');
  assert.match(l, /O preço de agora está no link da bio/, "sem grupo configurado, manda para a bio");
  assert.doesNotMatch(l, /\d+% /, 'nem porcentagem de desconto');
  assert.match(l, /some rápido/, 'gatilho de urgência');
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

test('social: título completo na legenda, sem reticências', () => {
  const longo = 'Câmera de Segurança Wi-Fi iCSee/Yoosee A28B 4K Dupla Lente Giratória Visão Noturna Colorida Detecção de Movimento Áudio Bidirecional';
  const l = montarLegenda({ ...oferta, titulo: longo }, config);
  assert.ok(l.includes(longo) && !l.includes('…'));
  const inflado = montarLegenda({ ...oferta, precoDe: 'inflado' }, config);
  assert.ok(!inflado.includes('57%'));
  assert.match(inflado, /O preço de agora está no link da bio/);
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

test('social: o selo da arte é "menor preço" (só com histórico) ou o assunto; nunca "OFERTA" nem valor (reais ou %)', () => {
  const com = { ...oferta, menorPrecoEmDias: 15 };
  assert.match(montarSvgDoStory(com, undefined, config), /MENOR PREÇO/);
  assert.doesNotMatch(montarSvgDoStory(oferta, undefined, config), /MENOR PREÇO/, 'sem histórico confirmado, nenhum selo (o assunto não vira texto na arte)');
  assert.match(montarSvgDoFeed(com, undefined, config), /MENOR PREÇO/);
  assert.deepEqual(ganchoDaOferta(com), { gancho: 'MENOR PREÇO EM 15 DIAS', curto: 'MENOR PREÇO', tipo: 'historico' });
  assert.equal(ganchoDaOferta(oferta).gancho, 'CASA E COZINHA', 'sem histórico, o assunto (nunca o desconto)');
  assert.equal(ganchoDaOferta({ ...oferta, precoOriginal: undefined, desconto: undefined, categoria: 'tech' }).gancho, 'TECNOLOGIA');
  for (const o of [oferta, com, { ...oferta, precoOriginal: undefined }]) {
    for (const svg of [montarSvgDoStory(o, undefined, config), montarSvgDoFeed(o, undefined, config)]) {
      assert.ok(!svg.includes('>OFERTA<'), 'sem o selo genérico');
      assert.doesNotMatch(svg, /R\$|\d%/, 'nenhum valor na arte, nem em reais nem em %');
    }
  }
});

test('social: a pergunta da arte é "CAIU MESMO?" só com histórico; senão, uma pergunta de curiosidade', () => {
  assert.equal(perguntaDaArte({ ...oferta, menorPrecoEmDias: 9 }), 'CAIU MESMO?');
  const perguntas = new Set(Array.from({ length: 30 }, (_, i) => perguntaDaArte({ ...oferta, idProduto: `P${i}` })));
  assert.ok(perguntas.size > 1 && !perguntas.has('CAIU MESMO?'), 'sem histórico não promete queda, e as perguntas variam');
  assert.equal(perguntaDaArte(oferta), perguntaDaArte({ ...oferta }), 'o mesmo produto repete a pergunta');
  assert.deepEqual(linhasDaPergunta('CAIU MESMO?'), ['CAIU MESMO?']);
  assert.deepEqual(linhasDaPergunta('QUANTO CUSTA AGORA?'), ['QUANTO CUSTA', 'AGORA?']);
});

test('moldes: toda arte é válida, sem preço em reais, com a prova real, a chamada, o aviso de publi e o título escapado', () => {
  const categorias = ['tech', 'casa', 'beleza', 'moda', 'esporte', 'games', 'bebe', 'ferramentas', 'pet', 'geral', 'inexistente'];
  for (const categoria of categorias) {
    for (let i = 0; i < 6; i++) {
      const o = { ...oferta, categoria, idProduto: `P${i}`, menorPrecoEmDias: i % 2 ? 9 : undefined, precoDe: i === 4 ? ('inflado' as const) : undefined };
      for (const comentaQuero of [false, true]) {
        for (const [svg, w, h] of [[montarSvgDoStory(o, 'data:image/png;base64,AAAA', config, comentaQuero), 1080, 1920], [montarSvgDoFeed(o, 'data:image/png;base64,AAAA', config, comentaQuero), 1080, 1350]] as const) {
          assert.match(svg, new RegExp(`^<svg[^>]+width="${w}" height="${h}"`));
          assert.doesNotMatch(svg, /R\$|34,41|80,00/, 'nenhum valor em reais na arte');
          assert.equal((svg.match(/>MATA</g) ?? []).length, 1, 'a marca aparece uma vez só');
          assert.ok(svg.includes('Publi · link de afiliado'), 'aviso de publi');
          assert.ok(!svg.includes('<INMA>') && svg.includes('&lt;INMA&gt;'), 'título escapado');
          assert.equal(svg.includes('MENOR PREÇO'), i % 2 === 1, 'selo de menor preço só com histórico confirmado');
          assert.ok(/5 mil vendidos/.test(svg) && svg.includes('Frete grátis'), 'a prova real (vendidos, frete) aparece');
          if (comentaQuero) assert.ok(svg.includes('COMENTA &quot;QUERO&quot;') && svg.includes('NO DIRECT'), 'a chamada do comenta QUERO');
          else assert.ok(svg.includes('LINK NA BIO'), 'sem o comenta QUERO, leva ao link da bio');
          assert.ok(!GATILHOS_DE_URGENCIA.some((g) => svg.includes(`>${g}<`)) && !GATILHOS_DE_EXCLUSIVIDADE.some((g) => svg.includes(`>${g}<`)), 'sem adesivos de gatilho sobre o produto');
          assert.ok((svg.match(/<text /g) ?? []).length <= 12, 'poucos textos na arte');
        }
      }
    }
  }
  // Cada nicho com a sua cor de destaque.
  assert.ok(montarSvgDoFeed({ ...oferta, categoria: 'pet' }, undefined).includes(CORES_DO_NICHO.pet!));
  assert.ok(montarSvgDoFeed({ ...oferta, categoria: 'moda' }, undefined).includes(CORES_DO_NICHO.moda!));
  // O mesmo produto sai sempre igual.
  assert.equal(montarSvgDoStory(oferta, undefined), montarSvgDoStory({ ...oferta }, undefined));
});

test('moldes: o selo da foto só diz o que é verdade: % só com o preço "de" confirmado, menor preço só com histórico, "EM ALTA" com a febre', () => {
  const base = { ...oferta, menorPrecoEmDias: undefined, maisVendido: false, vendasPorDia: undefined, desconto: 45, precoOriginal: 200, preco: 110 };
  assert.deepEqual(seloDaOferta({ ...base, precoDe: 'confirmado' }), { texto: '-45%', tipo: 'desconto' });
  assert.equal(seloDaOferta({ ...base, precoDe: 'nao-confirmado' }), undefined, 'desconto sem prova não vira selo');
  assert.equal(seloDaOferta({ ...base, precoDe: 'inflado' }), undefined, '"de" inflado nunca');
  assert.equal(seloDaOferta({ ...base, precoDe: 'confirmado', desconto: 10, precoOriginal: 120 })?.tipo, undefined, 'desconto pequeno não vira selo');
  assert.deepEqual(seloDaOferta({ ...base, menorPrecoEmDias: 20 }), { texto: 'MENOR PREÇO', tipo: 'historico' });
  assert.deepEqual(seloDaOferta({ ...base, vendasPorDia: 80 }), { texto: 'EM ALTA', tipo: 'febre' });
  assert.deepEqual(seloDaOferta({ ...base, maisVendido: true }), { texto: 'EM ALTA', tipo: 'febre' });
  // Na arte: o selo aparece por cima da foto; sem selo, nada no canto (o produto fala sozinho).
  const comSelo = montarSvgDoFeed({ ...base, precoDe: 'confirmado' }, undefined);
  assert.ok(comSelo.includes('>-45%<') && comSelo.includes('>OFF<'));
  assert.ok(!montarSvgDoFeed(base, undefined).includes('>?<'));
});

test('moldes: o produto em primeiro plano: a foto ocupa a parte de cima inteira e a arte tem uma chamada só (sem a pergunta repetida)', () => {
  for (const [svg, hFoto] of [[montarSvgDoStory(oferta, 'data:image/png;base64,AAAA'), 1250], [montarSvgDoFeed(oferta, 'data:image/png;base64,AAAA'), 900]] as const) {
    assert.ok(svg.includes(`<rect x="0" y="0" width="1080" height="${hFoto}" fill="#ffffff"/>`), 'a foto vai de ponta a ponta');
    assert.doesNotMatch(svg, /CAIU MESMO\?|QUANTO CUSTA AGORA\?|ADIVINHA O PREÇO\?|QUANTO VOCÊ PAGARIA\?/, 'sem a pergunta: uma chamada só');
    const m = /font-size="(\d+)"[^>]*font-style="italic"[^>]*>([^<]+)</.exec(svg)!;
    assert.ok(Number(m[1]) * m[2]!.length * 0.7 <= 920, `a chamada "${m[2]}" cabe`);
  }
  assert.ok(montarSvgDoStory(oferta, undefined, config, false, '+80 ACHADOS POR DIA NO GRUPO').includes('+80 ACHADOS POR DIA NO GRUPO'), 'a linha do grupo vai na chamada');
});

test('moldes: no Story, o logo, o selo, a pergunta e o aviso ficam na área segura (fora do que o Instagram cobre no topo e na base)', async () => {
  const { STORY_TOPO_SEGURO, STORY_BASE_SEGURA, svgDoResumoDoDia } = await import('../src/moldes.ts');
  const ys = (svg: string, texto: string) => [...svg.matchAll(new RegExp(`y="([\\d.]+)"[^>]*>${texto}<`, 'g'))].map((m) => Number(m[1]));
  for (const svg of [montarSvgDoStory(oferta, undefined), montarSvgDoStory({ ...oferta, precoDe: 'inflado' }, undefined), montarSvgDoStory({ ...oferta, menorPrecoEmDias: 9 }, undefined)]) {
    for (const t of ['MATA', 'LINK NA BIO', 'MENOR PREÇO', 'Publi · link de afiliado · preço pode mudar']) {
      for (const y of ys(svg, t)) assert.ok(y > STORY_TOPO_SEGURO && y < STORY_BASE_SEGURA, `${t} em y ${y}`);
    }
  }
  const resumo = svgDoResumoDoDia({ achados: 24, maiorDesconto: 62, noMenorPreco: 5, assuntos: ['Moda'], fotos: ['data:image/png;base64,AAAA'] });
  for (const t of ['HOJE NO GRUPO', 'ENTRE NO GRUPO', 'É GRÁTIS · LINK NA BIO']) for (const y of ys(resumo, t)) assert.ok(y > STORY_TOPO_SEGURO && y < STORY_BASE_SEGURA, `${t} em y ${y}`);
});

test('moldes: o título, de uma ou de duas linhas, fica sempre acima da prova e da chamada', () => {
  const casos = [oferta, { ...oferta, precoDe: 'inflado' as const }, { ...oferta, titulo: 'Fone', precoDe: 'inflado' as const }, { ...oferta, titulo: 'Fone Bluetooth Sem Fio Cancelamento de Ruído Ativo Bateria 30h Compatível', menorPrecoEmDias: 9 }];
  for (const o of casos) {
    for (const [svg, yBotao, tamanho] of [[montarSvgDoStory(o, undefined), 1440, 54], [montarSvgDoFeed(o, undefined), 1120, 46]] as const) {
      const linhas = [...svg.matchAll(new RegExp(`<text x="540" y="([\\d.]+)" font-size="${tamanho}"[^>]*fill="#ffffff"`, 'g'))].map((m) => Number(m[1]));
      assert.ok(linhas.length >= 1 && linhas.length <= 2, 'o título tem uma ou duas linhas');
      assert.ok(Math.max(...linhas) < yBotao - 10, `o título (y ${Math.max(...linhas)}) fica acima da pergunta (y ${yBotao})`);
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
  assert.doesNotMatch(svg, /R\$|34,41/, 'o preço não vai na arte');
  assert.match(svg, /Frete grátis/, 'a prova real vai na arte');
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

test('social: o desconto não aparece em lugar nenhum da arte nem da legenda (a intenção é levar ao grupo, não mostrar valor)', () => {
  assert.equal(descontoConfiavel(oferta), true);
  assert.equal(descontoConfiavel({ ...oferta, precoDe: 'inflado' }), false, 'histórico prova que o "de" é inflado');
  const ranking = { ...oferta, maisVendido: true, desconto: 43, precoOriginal: 78.9, preco: 44.97 };
  assert.doesNotMatch(montarLegenda(ranking, config), /R\$|43%/);
  assert.doesNotMatch(montarSvgDoStory(ranking, undefined), /78,90|44,97|R\$|43%/);
  assert.equal(ganchoDaOferta(ranking).tipo, 'categoria');
});

test('social: lista de modelos do título (iPhone X 11 12 13 14...) sai da legenda sem cortar títulos normais', () => {
  const l = montarLegenda({ ...oferta, titulo: 'Fone Bluetooth Compatível Com Iphone X Xr 11 12 13 14 15 16 17 Pro Max Sem Fio' }, config);
  assert.ok(!/11 12 13 14/.test(l) && l.includes('Fone Bluetooth Compatível Com Iphone X'));
  assert.ok(montarLegenda({ ...oferta, titulo: 'Galaxy S24 Ultra 512GB 5G' }, config).includes('Galaxy S24 Ultra 512GB 5G'));
});
test('comenta QUERO: quem pede recebe o link no direct uma vez só, e a legenda e a arte do feed chamam para comentar', async () => {
  const { responderComentarios, mensagemDoDirect, ErroInstagram } = await import('../src/instagram.ts');
  const { Banco } = await import('../src/db.ts');
  const c = lerConfig({ INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 't', INSTAGRAM_USER_ID: 'u', BLOG_URL: 'https://site', BLOG_WHATSAPP: 'https://chat.whatsapp.com/ABC' });
  const agora = new Date('2026-10-27T15:00:00Z');
  const banco = new Banco(':memory:');
  banco.registrarMidiaDoInstagram('M1', 'feed', 'Fone Bluetooth Sem Fio', 'https://meli.la/abc', agora);
  const directs: Array<{ id: string; texto: string }> = [];
  const publicas: string[] = [];
  const falso: any = {
    comentarios: async () => [
      { id: 'C1', texto: 'QUERO!!' },
      { id: 'C2', texto: 'que lindo' },
      { id: 'C3', texto: 'eu quero o link 🙏' },
      { id: 'C4', texto: 'Quero' },
    ],
    mandarNoDirect: async (id: string, texto: string) => {
      if (id === 'C4') throw new ErroInstagram('Instagram recusou (400/10/2534022): fora da janela', true);
      directs.push({ id, texto });
    },
    responderComentario: async (id: string) => void publicas.push(id),
  };
  const r = await responderComentarios(banco, c, agora, fetch, falso);
  assert.deepEqual(directs.map((d) => d.id), ['C1', 'C3'], 'só quem pediu; o que o Instagram recusou fica para trás sem derrubar o resto');
  assert.deepEqual(publicas, ['C1', 'C3'], 'responde em público que mandou no direct');
  assert.equal(r.respondidos, 2);
  assert.ok(directs[0]!.texto.includes('https://meli.la/abc') && directs[0]!.texto.includes('afiliado') && directs[0]!.texto.includes('chat.whatsapp.com/ABC'));
  // Na rodada seguinte, ninguém recebe de novo.
  directs.length = 0;
  await responderComentarios(banco, c, agora, fetch, falso);
  assert.equal(directs.length, 0);
  assert.equal(banco.respostasNoDirect(1, agora), 2);

  // Sem permissão no token: desliga o comenta QUERO por 3 dias e a legenda volta para o link da bio.
  const semPermissao: any = { comentarios: async () => { throw new ErroInstagram('Instagram recusou (403/200): permissão', true); } };
  const b2 = new Banco(':memory:');
  b2.registrarMidiaDoInstagram('M2', 'feed', 'Fone', 'https://x', agora);
  const r2 = await responderComentarios(b2, c, agora, fetch, semPermissao);
  assert.match(r2.avisos[0]!, /instagram_business_manage_comments/);
  const { comentaQueroAtivo } = await import('../src/social.ts');
  assert.equal(comentaQueroAtivo(b2, c, agora), false);
  assert.equal(comentaQueroAtivo(b2, c, new Date(agora.getTime() + 10 * 86_400_000)), false, 'com o mesmo token, continua desligado');
  assert.equal(comentaQueroAtivo(b2, lerConfig({ INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'token-novo-com-permissao', INSTAGRAM_USER_ID: 'u' }), agora), true, 'token novo: tenta de novo');

  // App sem acesso para mandar direct ao público: 3 recusas seguidas, nenhum entregue, desliga.
  const semAcesso: any = { comentarios: async () => ['A', 'B', 'C', 'D'].map((id) => ({ id, texto: 'quero' })), mandarNoDirect: async () => { throw new Error('(#3) Application does not have the capability'); }, responderComentario: async () => {} };
  const b3 = new Banco(':memory:');
  b3.registrarMidiaDoInstagram('M3', 'feed', 'Fone', 'https://x', agora);
  const r3 = await responderComentarios(b3, c, agora, fetch, semAcesso);
  assert.match(r3.avisos[0]!, /acesso avançado/);
  assert.equal(comentaQueroAtivo(b3, c, agora), false);

  // Legenda: a chamada logo na 2ª linha, e o preço "vai no direct".
  const legenda = montarLegenda(oferta, config, true).split('\n');
  assert.equal(legenda[1], '💬 Comenta QUERO que eu te mando o link no direct');
  assert.ok(legenda.some((l) => l.includes('vai junto com o link, no seu direct')));
  assert.ok(!montarLegenda(oferta, config, false).includes('Comenta QUERO'));
  assert.doesNotMatch(mensagemDoDirect('x'.repeat(200), 'https://l', c), /x{81}/, 'título comprido é encurtado');
});
