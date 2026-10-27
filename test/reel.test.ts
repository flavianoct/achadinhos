import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { ESTILOS_DE_MUSICA, estiloDaMusica, sintetizarMusica } from '../src/musica.ts';
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
  assert.match(legenda, /Qual você levaria\? 3 achados de hoje/);
  assert.match(legenda, /O preço de agora está no link da bio/);
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
  assert.match(criar.corpo.get('caption')!, /Qual você levaria\? 3 achados de hoje/);
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

test('reel: dois por dia, cada um na sua janela, depois que o anterior saiu e com produtos diferentes', async () => {
  const banco = bancoComProdutos();
  const config = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '2', INSTAGRAM_HORARIOS_REELS: '12,19' });
  assert.equal(await prepararReel(banco, config, AGORA, foto), true, '12h: o primeiro');
  assert.equal(await prepararReel(banco, config, AGORA, foto), false, 'o primeiro ainda não saiu');
  const primeiro = banco.reelPendente(AGORA)!;
  const idsDoPrimeiro = (JSON.parse(primeiro.dados) as DadosDoReel).itens.map((i) => i.oferta.idProduto);
  banco.marcarReelPublicado(primeiro.chave, AGORA);
  assert.equal(await prepararReel(banco, config, AGORA, foto), false, '12h: o segundo só nasce perto das 19h');
  const noite = new Date('2026-10-03T21:10:00Z');
  assert.equal(await prepararReel(banco, config, noite, foto), true, '18h10: o segundo');
  const segundo = banco.reelPendente(noite)!;
  assert.notEqual(segundo.chave, primeiro.chave);
  const dados = JSON.parse(segundo.dados) as DadosDoReel;
  assert.ok(dados.itens.every((i) => !idsDoPrimeiro.includes(i.oferta.idProduto)), 'produtos diferentes do primeiro');
  assert.match(dados.titulo, /Mais 3 achados/);
  banco.marcarReelPublicado(segundo.chave, noite);
  assert.equal(await prepararReel(banco, config, noite, foto), false, 'dois por dia e pronto');
});

test('música: cada estilo é válido e soa diferente; Reels seguidos (e os dois do mesmo dia) nunca repetem o estilo, e o mesmo Reel mantém o som', () => {
  const wavs = Array.from({ length: ESTILOS_DE_MUSICA }, (_, e) => sintetizarMusica(3, e));
  assert.ok(ESTILOS_DE_MUSICA >= 4, 'há variedade');
  assert.equal(new Set(wavs.map((w) => w.toString('base64'))).size, ESTILOS_DE_MUSICA, 'todos soam diferentes');
  assert.deepEqual(sintetizarMusica(3), wavs[0], 'o estilo 0 é a trilha original');
  for (const wav of wavs) {
    let pico = 0;
    for (let i = 44; i < wav.length; i += 2) pico = Math.max(pico, Math.abs(wav.readInt16LE(i)));
    assert.ok(pico > 4000 && pico < 32767, `volume ok (${pico})`);
  }
  const chaves: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const dia = `2026-10-${String(d).padStart(2, '0')}`;
    chaves.push(`reel-${dia}`, `reel-${dia}-2`);
  }
  for (let i = 1; i < chaves.length; i++) assert.notEqual(estiloDaMusica(chaves[i]!), estiloDaMusica(chaves[i - 1]!), `${chaves[i - 1]} e ${chaves[i]}`);
  assert.equal(estiloDaMusica('reel-2026-10-09'), estiloDaMusica('reel-2026-10-09'));
  assert.ok(estiloDaMusica('qualquer-coisa') >= 0 && estiloDaMusica('qualquer-coisa') < ESTILOS_DE_MUSICA);
});

test('reel: o primeiro quadro já mostra os produtos, cada produto tem número, barra e prova, e o fim repete o começo pedindo o número', async () => {
  const { svgDoGancho, svgDoItem, svgDoFim, DURACOES_DO_REEL, TRANSICAO_DO_REEL } = await import('../src/reel.ts');
  const itens = [1, 2, 3].map((n) => ({ oferta: { ...produto(n), maisVendido: n === 2, freteGratis: true }, imagem: 'data:image/png;base64,AAAA' }));
  const gancho = svgDoGancho(itens);
  assert.equal((gancho.match(/<image /g) ?? []).length, 3, 'o gancho mostra os 3 produtos (nada de tela só de texto)');
  assert.ok(gancho.includes('QUAL VOCÊ LEVARIA?') && gancho.includes('1, 2 OU 3?'));
  assert.ok(gancho.includes('O QUE TÁ TODO MUNDO COMPRANDO'), 'a prova do gancho vem dos dados (um deles é mais vendido)');
  const fim = svgDoFim(itens, true);
  assert.equal((fim.match(/<image /g) ?? []).length, 3, 'o fim é igual ao começo: o vídeo emenda num loop');
  assert.ok(fim.includes('COMENTA 1, 2 OU 3') && fim.includes('NO DIRECT'));
  assert.ok(svgDoFim(itens, false).includes('NA BIO'), 'sem o comenta QUERO, o link fica na bio');
  for (let i = 0; i < 3; i++) {
    const svg = svgDoItem(itens[i]!, i, 3);
    assert.match(svg, /^<svg[^>]+width="1080" height="1920"/);
    assert.ok(svg.includes(`>${i + 1}<`), 'o número do produto');
    assert.equal((svg.match(/fill-opacity="1"/g) ?? []).length, i + 1, 'a barra de progresso preenche até o produto atual');
    assert.ok(svg.includes('vendidos') && svg.includes('Frete grátis'), 'a prova real');
    assert.doesNotMatch(svg, /R\$/, 'nunca preço em reais');
  }
  assert.ok(svgDoItem(itens[1]!, 1, 3).includes('EM ALTA'));
  // Toda tela precisa virar imagem de verdade (um SVG inválido derrubaria o vídeo inteiro).
  const { renderizarPng } = await import('../src/social.ts');
  for (const svg of [gancho, fim, ...itens.map((it, i) => svgDoItem(it, i, 3))]) assert.ok(await renderizarPng(svg, 200), 'a tela vira PNG');
  // Nenhuma linha de texto passa da largura da tela (a conta de largura: letras × 0,72 × tamanho).
  for (const svg of [gancho, fim, ...itens.map((it, i) => svgDoItem(it, i, 3))]) for (const m of svg.matchAll(/font-size="(\d+)"[^>]*>([^<]+)</g)) assert.ok(Number(m[1]) * m[2]!.length * 0.72 <= 950, `"${m[2]}" cabe na tela`);
  const total = DURACOES_DO_REEL.gancho + 3 * DURACOES_DO_REEL.item + DURACOES_DO_REEL.fim - 4 * TRANSICAO_DO_REEL.duracao;
  assert.ok(total <= 12, `Reel curto (${total.toFixed(1)} s): mais gente assiste até o fim`);
});

test('reel: quem comenta o número recebe o link daquele produto; "quero" sem número recebe todos', async () => {
  const { mensagemParaOComentario } = await import('../src/instagram.ts');
  const { normalizar } = await import('../src/categoria.ts');
  const config = lerConfig(base);
  const palavras = config.instagram.palavrasDoComentario.map(normalizar);
  const midia = { titulo: 'Qual você levaria?', link: JSON.stringify([1, 2, 3].map((n) => ({ titulo: `Produto ${n}`, link: `https://l/${n}` }))) };
  const m = (t: string) => mensagemParaOComentario(normalizar(t), midia, palavras, config);
  assert.ok(m('2')!.includes('https://l/2') && !m('2')!.includes('https://l/1'));
  assert.ok(m('quero o 3 🙏')!.includes('https://l/3'));
  const varios = m('1 e 3')!;
  assert.ok(varios.includes('https://l/1') && varios.includes('https://l/3') && !varios.includes('https://l/2'));
  const todos = m('QUERO')!;
  assert.ok(['1', '2', '3'].every((n) => todos.includes(`https://l/${n}`)));
  assert.equal(m('lindo demais'), undefined, 'comentário sem pedido não recebe nada');
  assert.equal(m('10/10'), undefined, 'número fora da lista não conta');
  // Post de um produto só: precisa de uma das palavras.
  const um = { titulo: 'Fone', link: 'https://l/f' };
  assert.ok(mensagemParaOComentario('quero', um, palavras, config)!.includes('https://l/f'));
  assert.equal(mensagemParaOComentario('2', um, palavras, config), undefined);
});

test('reel: os efeitos acompanham a imagem: whoosh em cada troca, pop em cada produto e ding no fim, todos audíveis', async () => {
  const { efeitosDoReel, DURACOES_DO_REEL } = await import('../src/reel.ts');
  const { sintetizarEfeitos } = await import('../src/musica.ts');
  const duracoes = [DURACOES_DO_REEL.gancho, DURACOES_DO_REEL.item, DURACOES_DO_REEL.item, DURACOES_DO_REEL.item, DURACOES_DO_REEL.fim];
  const efeitos = efeitosDoReel(duracoes);
  assert.equal(efeitos.filter((e) => e.tipo === 'whoosh').length, 4, 'uma troca entre cada tela');
  assert.equal(efeitos.filter((e) => e.tipo === 'pop').length, 3, 'um por produto');
  assert.equal(efeitos.filter((e) => e.tipo === 'ding').length, 1);
  assert.ok(efeitos.every((e, i) => i === 0 || e.t >= efeitos[i - 1]!.t), 'em ordem');
  for (const tipo of ['whoosh', 'pop'] as const) {
    const wav = sintetizarEfeitos(1, [{ t: 0.1, tipo }]);
    let pico = 0;
    for (let i = 44; i < wav.length; i += 2) pico = Math.max(pico, Math.abs(wav.readInt16LE(i)));
    assert.ok(pico > 3000 && pico < 32767, `${tipo} audível e sem estourar`);
  }
});

test('remotion: os tempos do robô batem com os do vídeo, e os dados só dizem o que é verdade (nunca preço em reais)', async () => {
  const { readFileSync } = await import('node:fs');
  const { QUADROS_DO_REMOTION, propsDoRemotion, efeitosDoRemotion, fatoDoGancho, duracaoDoRemotion } = await import('../src/remotion.ts');
  const tsx = readFileSync(new URL('../remotion/src/Achados.tsx', import.meta.url), 'utf8');
  const m = /QUADROS = \{ gancho: (\d+), item: (\d+), fim: (\d+) \}/.exec(tsx)!;
  assert.deepEqual({ gancho: Number(m[1]), item: Number(m[2]), fim: Number(m[3]) }, QUADROS_DO_REMOTION, 'o áudio e o vídeo usam os mesmos tempos');
  const itens = [1, 2, 3].map((n) => ({ oferta: { ...produto(n), vendas: n === 1 ? 9000 : 2000, freteGratis: true }, imagem: 'data:image/png;base64,AAAA' }));
  const props = propsDoRemotion(itens, true);
  assert.equal(props.promessa, 'O Nº 1 É O MAIS VENDIDO', 'o nº 1 vende mais que os outros: pode dizer');
  assert.equal(propsDoRemotion([itens[1]!, itens[0]!, itens[2]!], true).promessa, 'ESPERA O Nº 1', 'se não é verdade, não diz');
  assert.equal(props.fato, '9 MIL VENDIDOS');
  assert.equal(fatoDoGancho({ ...produto(1), precoDe: 'confirmado', desconto: 41, precoOriginal: 100, preco: 59 }), '-41% OFF');
  assert.ok(props.itens.every((it) => it.provas.includes('Frete grátis') && it.nome.length <= 2));
  assert.doesNotMatch(JSON.stringify({ ...props, itens: props.itens.map((it) => ({ ...it, imagem: '' })) }), /R\$/);
  const ef = efeitosDoRemotion(3);
  assert.equal(ef.filter((e) => e.tipo === 'whoosh').length, 4);
  assert.ok(ef.every((e) => e.t >= 0 && e.t < duracaoDoRemotion(3)));
});

test('remotion: desligado ou sem instalação, devolve o motivo (o robô cai para o Reel simples)', async () => {
  const { gravarComRemotion, remotionInstalado } = await import('../src/remotion.ts');
  const itens = [{ oferta: produto(1), imagem: 'data:image/png;base64,AAAA' }];
  assert.match((await gravarComRemotion(itens, 'reel-x', 'x.mp4', lerConfig({ ...base, REEL_REMOTION: '0' }), true))!, /desligado/);
  assert.equal(remotionInstalado(tmpdir()), undefined, 'pasta sem o Remotion');
});

test('remotion: a IA escreve o nome curto de cada produto, e o robô só aceita o que é curto, sem promessa e do produto certo', async () => {
  const { nomesDaIa, nomeDaIaServe, propsDoRemotion } = await import('../src/remotion.ts');
  const titulos = ['Taiff Black Ion Secador De Cabelo Profissional 2000w Cor Preto', 'Bola Voadora Mágica Interativa Disco Voador Brinquedo', 'Fone Bluetooth Sem Fio TWS'];
  assert.equal(nomeDaIaServe('Secador profissional Taiff', titulos[0]!), true);
  assert.equal(nomeDaIaServe('Secador com 40% de desconto', titulos[0]!), false, 'nada de %');
  assert.equal(nomeDaIaServe('O melhor secador do Brasil', titulos[0]!), false, 'nada de promessa');
  assert.equal(nomeDaIaServe('Air Fryer 5 litros', titulos[0]!), false, 'outro produto');
  assert.equal(nomeDaIaServe('x'.repeat(41), titulos[0]!), false, 'comprido demais');

  const config = lerConfig({ ...base, BLOG_IA: 'gemini', GEMINI_API_KEY: 'chave' });
  const resposta = (conteudo: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: conteudo } }] }), { status: 200 })) as unknown as typeof fetch;
  const nomes = await nomesDaIa(titulos, config, resposta('```json\n{"nomes": ["Secador profissional Taiff", "Bola mágica que vira disco", "Fone barato e bom"]}\n```'));
  assert.deepEqual(nomes, ['Secador profissional Taiff', 'Bola mágica que vira disco', ''], 'o terceiro tinha "barato": fica com o título da loja');
  assert.equal(await nomesDaIa(titulos, lerConfig(base), resposta('{}')), undefined, 'sem IA configurada, nada muda');
  assert.equal(await nomesDaIa(titulos, config, (async () => new Response('erro', { status: 401 })) as unknown as typeof fetch), undefined, 'IA fora do ar: usa os títulos');

  const itens = titulos.map((t, i) => ({ oferta: { ...produto(i + 1), titulo: t }, imagem: 'data:image/png;base64,AAAA' }));
  const props = propsDoRemotion(itens, true, nomes);
  assert.deepEqual(props.itens[0]!.nome, ['Secador profissional', 'Taiff']);
  assert.ok(props.itens[2]!.nome.join(' ').startsWith('Fone Bluetooth'), 'sem nome da IA, o título cortado');
});

test('remotion: o vídeo vai para o caminho pedido mesmo quando ele é relativo (o Remotion roda dentro de remotion/)', async () => {
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(new URL('../src/remotion.ts', import.meta.url), 'utf8');
  assert.match(fonte, /const destino = resolve\(saida\)/);
  assert.match(fonte, /'Achados', destino,/, 'o Remotion recebe o caminho absoluto');
  assert.match(fonte, /existsSync\(destino\)/);
});
