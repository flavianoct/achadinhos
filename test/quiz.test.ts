import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { sintetizarEfeitos } from '../src/musica.ts';
import { duracaoDoQuiz, gravarQuiz, legendaDoQuiz, legendaParaTikTokEShorts, opcoesDePreco, prepararQuiz, telasDoQuiz, type DadosDoQuiz } from '../src/quiz.ts';
import { arquivoDoReel, ehVezDoQuiz, prepararReel } from '../src/reel.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília, segunda-feira
const AGORA = new Date('2026-10-12T15:00:00Z');
const base = {
  INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 't', INSTAGRAM_USER_ID: '1', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23',
  INSTAGRAM_HORARIOS_FEED: '', INSTAGRAM_HORARIOS_STORIES: '', INSTAGRAM_HORARIOS_REELS: '', INSTAGRAM_REELS_POR_DIA: '2', QUIZ_ATIVO: '1', INSTAGRAM_REELS_DE_DESTAQUE: '0',
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const foto = (async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
const produto = (n: number, extra: Partial<OfertaAvaliada> = {}): OfertaAvaliada => ({
  loja: 'shopee', idProduto: `S${n}`, titulo: `Produto Bom Numero ${n} Com Nome Bem Longo Para Testar a Quebra de Linha`, preco: 40 + n * 13.9, link: `https://s.shopee.com.br/${n}`,
  imagem: `https://down-br.img.susercontent.com/foto-${n}.png`, nota: 4.8, vendas: 2000 + n, categoria: ['tech', 'casa', 'beleza', 'moda'][n % 4]!, pontos: 100 - n, ...extra,
});
function bancoComProdutos(extra: (n: number) => Partial<OfertaAvaliada> = () => ({})) {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 12; i++) banco.guardarProduto(produto(i, extra(i)), new Date(AGORA.getTime() - i * 60_000));
  return banco;
}

test('quiz: os três preços têm os mesmos centavos do real, são distintos, crescentes e o certo está entre eles', () => {
  const posicoes = new Set<number>();
  for (const preco of [15.9, 29.9, 49.9, 89.9, 129, 199.9, 349.9, 899, 1299.9, 24.37]) {
    for (let k = 0; k < 40; k++) {
      const { opcoes, correta } = opcoesDePreco(preco, `semente-${k}`);
      assert.equal(opcoes.length, 3);
      assert.ok(opcoes.every((v, i) => i === 0 || v > opcoes[i - 1]!), `crescente: ${opcoes}`);
      assert.equal(opcoes[correta], preco, 'o certo está lá');
      const cents = (v: number) => Math.round((v - Math.floor(v)) * 100);
      assert.ok(opcoes.every((v) => cents(v) === cents(preco)), `mesmos centavos do real: ${opcoes}`);
      assert.ok(opcoes.every((v) => v > 0));
      const folga = Math.max(1, Math.floor(preco) * 0.08);
      assert.ok(opcoes.every((v, i) => i === 0 || v - opcoes[i - 1]! >= folga - 0.001), `distantes entre si: ${opcoes}`);
      posicoes.add(correta);
    }
  }
  assert.deepEqual([...posicoes].sort(), [0, 1, 2], 'o certo cai em A, B e C ao longo das rodadas');
  assert.deepEqual(opcoesDePreco(89.9, 'x'), opcoesDePreco(89.9, 'x'), 'mesma semente, mesmas opções');
  assert.notDeepEqual(opcoesDePreco(89.9, 'x'), opcoesDePreco(89.9, 'y'), 'outra semente, outras opções');
});

test('quiz: só é a vez dele quando ligado, no último Reel do dia e nos dias escolhidos', () => {
  const c = lerConfig(base);
  assert.equal(ehVezDoQuiz(c, 0, AGORA), false, 'o primeiro Reel é o normal');
  assert.equal(ehVezDoQuiz(c, 1, AGORA), true, 'o segundo é o quiz');
  assert.equal(ehVezDoQuiz(lerConfig({ ...base, QUIZ_ATIVO: '0' }), 1, AGORA), false, 'desligado');
  assert.equal(ehVezDoQuiz(lerConfig({ ...base, QUIZ_DIAS: '2,4' }), 1, AGORA), false, 'segunda não está nos dias');
  assert.equal(ehVezDoQuiz(lerConfig({ ...base, QUIZ_DIAS: '1' }), 1, AGORA), true);
  assert.equal(ehVezDoQuiz(lerConfig({ ...base, QUIZ_POR_DIA: '2' }), 0, AGORA), true, 'dois quizzes: os dois Reels');
  assert.equal(ehVezDoQuiz(lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' }), 0, AGORA), true, 'com um Reel só, ele é o quiz');
});

test('quiz: nasce na vez dele com 3 produtos da Shopee, e o Reel normal não ocupa essa vaga', async () => {
  const banco = bancoComProdutos();
  const config = lerConfig(base);
  // Vaga 1: o Reel normal "Caiu mesmo?"
  assert.equal(await prepararQuiz(banco, config, AGORA, foto), false, 'ainda não é a vez do quiz');
  assert.equal(await prepararReel(banco, config, AGORA, foto), true);
  assert.equal(banco.reelPendente(AGORA)!.chave, `reel-2026-10-12`);
  banco.marcarReelPublicado('reel-2026-10-12', AGORA);
  // Vaga 2: é o quiz, e o Reel normal não cria nada.
  assert.equal(await prepararReel(banco, config, AGORA, foto), false, 'a vaga é do quiz');
  assert.equal(await prepararQuiz(banco, config, AGORA, foto), true);
  const pendente = banco.reelPendente(AGORA)!;
  assert.equal(pendente.chave, 'quiz-2026-10-12-2');
  const dados = JSON.parse(pendente.dados) as DadosDoQuiz;
  assert.equal(dados.formato, 'quiz');
  assert.equal(dados.rodadas.length, 3);
  assert.ok(dados.rodadas.every((r) => r.oferta.loja === 'shopee' && r.opcoes[r.correta] === r.oferta.preco && r.imagem.startsWith('data:image')));
  assert.equal(new Set(dados.rodadas.map((r) => r.oferta.categoria)).size, 3, 'categorias diferentes');
  assert.equal(await prepararQuiz(banco, config, AGORA, foto), false, 'um quiz só por vez');
});

test('quiz: produto do Mercado Livre fica de fora por padrão, entra com QUIZ_LOJAS e preço fora da faixa não serve', async () => {
  const soMl = bancoComProdutos(() => ({ loja: 'mercadolivre' }));
  assert.equal(await prepararQuiz(soMl, lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' }), AGORA, foto), false, 'só a Shopee por padrão');
  assert.equal(await prepararQuiz(soMl, lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1', QUIZ_LOJAS: 'shopee,mercadolivre' }), AGORA, foto), true);
  const baratos = bancoComProdutos(() => ({ preco: 5 }));
  assert.equal(await prepararQuiz(baratos, lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' }), AGORA, foto), false, 'abaixo de R$ 15 não rende palpite');
  const pouca = new Banco(':memory:');
  pouca.guardarProduto(produto(1), AGORA);
  assert.equal(await prepararQuiz(pouca, lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' }), AGORA, foto), false, 'sem 3 produtos, não cria');
});

test('quiz: telas, tempos e efeitos: 3 rodadas com pergunta, contagem 3-2-1 e revelação; ding na revelação e tic-tac na contagem', async () => {
  const banco = bancoComProdutos((n) => (n === 1 ? { menorPrecoEmDias: 21 } : {}));
  const config = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' });
  assert.equal(await prepararQuiz(banco, config, AGORA, foto), true);
  const dados = JSON.parse(banco.reelPendente(AGORA)!.dados) as DadosDoQuiz;
  const { svgs, duracoes, efeitos } = telasDoQuiz(dados);
  assert.equal(svgs.length, 1 + 3 * 5 + 1, 'abertura, 3 rodadas de 5 telas e fechamento');
  assert.equal(duracoes.length, svgs.length);
  assert.equal(efeitos.filter((e) => e.tipo === 'ding').length, 3);
  assert.equal(efeitos.filter((e) => e.tipo !== 'ding').length, 9, 'um tique ou taque por número da contagem');
  const total = duracaoDoQuiz(dados);
  assert.ok(total > 25 && total < 45, `duração ${total}`);
  assert.ok(efeitos.every((e) => e.t > 0 && e.t < total));
  // A pergunta não revela; a revelação mostra o preço de hoje com o aviso e, se houver, o selo de menor preço.
  const pergunta = svgs[1]!;
  const revelacao = svgs[5]!;
  assert.ok(pergunta.includes('QUAL É O PREÇO?') && !pergunta.includes('O PREÇO DE HOJE É') && !pergunta.includes('Preço de hoje, pode mudar'));
  assert.ok(revelacao.includes('O PREÇO DE HOJE É') && revelacao.includes('Preço de hoje, pode mudar'));
  for (const p of dados.rodadas[0]!.opcoes) assert.ok(pergunta.includes(p.toFixed(2).replace('.', ',')), `mostra ${p}`);
  assert.ok(svgs.slice(2, 5).every((s, i) => s.includes(`>${3 - i}</text>`)), 'contagem 3, 2, 1');
  assert.ok(svgs.some((s) => s.includes('MENOR PREÇO EM 21 DIAS')) && !pergunta.includes('MENOR PREÇO'), 'o selo só aparece na revelação');
  // Nada importante abaixo de y=1520 (o conteúdo desce 60 px dentro de um grupo) (a legenda e os botões do Instagram cobrem a parte de baixo).
  for (const s of svgs.slice(1, -1)) for (const y of [...s.matchAll(/<text[^>]* y="(\d+)"/g)].map((m) => Number(m[1]))) assert.ok(y <= 1520, `texto em y=${y}`);
});

test('quiz: legenda desafia, lista os produtos, avisa que o preço muda e leva o aviso de publi', async () => {
  const banco = bancoComProdutos();
  const config = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1', BLOG_TELEGRAM: 'https://t.me/canal' });
  await prepararQuiz(banco, config, AGORA, foto);
  const legenda = legendaDoQuiz(JSON.parse(banco.reelPendente(AGORA)!.dados), config);
  assert.match(legenda, /^🎯 Preço certo: acerte o preço de 3 achados/);
  assert.match(legenda, /Quantos você acertou\?/);
  assert.match(legenda, /1\. Produto Bom Numero/);
  assert.match(legenda, /podem mudar a qualquer momento/);
  assert.match(legenda, /Publi: links de afiliado/);
  assert.ok(!/R\$/.test(legenda), 'a legenda não entrega os preços: eles estão no vídeo');
});

test('quiz: o Instagram publica o quiz como Reel, com a legenda do quiz, e conta no dia', async () => {
  const banco = bancoComProdutos();
  const config = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' });
  await prepararQuiz(banco, config, AGORA, foto);
  const chamadas: Array<{ url: string; corpo: URLSearchParams }> = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    chamadas.push({ url: u, corpo: new URLSearchParams(init.body ? String(init.body) : '') });
    if (init.method === 'HEAD') return new Response(null, { status: 200 });
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'p1' }));
    if (u.includes('/media')) return new Response(JSON.stringify({ id: 'c1' }));
    return new Response(JSON.stringify({ status_code: 'FINISHED' }));
  }) as unknown as typeof fetch;
  const r = await publicarNoInstagram(banco, config, AGORA, f, new Instagram('t', '1', f, 0));
  assert.equal(r.reels, 1);
  const criar = chamadas.find((c) => c.corpo.get('media_type') === 'REELS')!;
  assert.ok(criar.corpo.get('video_url')!.endsWith(`/social/${arquivoDoReel('quiz-2026-10-12')}`));
  assert.match(criar.corpo.get('caption')!, /^🎯 Preço certo/);
  assert.equal(banco.reelsPublicadosNoDia(AGORA), 1);
});

test('quiz: com QUIZ_ENVIAR_PARA, o vídeo pronto e a legenda do TikTok/Shorts vão para o Telegram privado do dono (e só o quiz, uma vez)', async () => {
  const banco = bancoComProdutos();
  const config = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1', TELEGRAM_BOT_TOKEN: 'bot-tok', TELEGRAM_CHAT_ID: '@canal', QUIZ_ENVIAR_PARA: '123456789' });
  assert.equal(config.quiz.enviarPara, '123456789');
  assert.equal(lerConfig({ ...base, QUIZ_ENVIAR_PARA: '@alguem' }).quiz.enviarPara, '', 'só ID numérico vale');
  await prepararQuiz(banco, config, AGORA, foto);
  const telegram: Array<{ url: string; corpo: any }> = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) {
      telegram.push({ url: u, corpo: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }
    if (init.method === 'HEAD') return new Response(null, { status: 200 });
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'p1' }));
    if (u.includes('/media')) return new Response(JSON.stringify({ id: 'c1' }));
    return new Response(JSON.stringify({ status_code: 'FINISHED' }));
  }) as unknown as typeof fetch;
  const r = await publicarNoInstagram(banco, config, AGORA, f, new Instagram('t', '1', f, 0));
  assert.equal(r.reels, 1);
  assert.doesNotMatch(r.avisos.join(' '), /Quiz:/);
  assert.equal(telegram.length, 1);
  assert.match(telegram[0]!.url, /\/botbot-tok\/sendVideo$/);
  assert.equal(telegram[0]!.corpo.chat_id, '123456789');
  assert.ok(telegram[0]!.corpo.video.endsWith(`/social/${arquivoDoReel('quiz-2026-10-12')}`));
  assert.match(telegram[0]!.corpo.caption, /#fyp #shorts/);
  assert.ok(telegram[0]!.corpo.caption.length <= 1024);
  await publicarNoInstagram(banco, config, AGORA, f, new Instagram('t', '1', f, 0));
  assert.equal(telegram.length, 1, 'não repete');

  // Sem o ajuste, nada vai para o Telegram.
  const banco2 = bancoComProdutos();
  const sem = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1', TELEGRAM_BOT_TOKEN: 'bot-tok', TELEGRAM_CHAT_ID: '@canal' });
  await prepararQuiz(banco2, sem, AGORA, foto);
  telegram.length = 0;
  await publicarNoInstagram(banco2, sem, AGORA, f, new Instagram('t', '1', f, 0));
  assert.equal(telegram.length, 0);
});

test('quiz: a legenda do TikTok e dos Shorts é curta, pede o placar e não lista os produtos', async () => {
  const banco = bancoComProdutos();
  await prepararQuiz(banco, lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1' }), AGORA, foto);
  const dados = JSON.parse(banco.reelPendente(AGORA)!.dados) as DadosDoQuiz;
  const legenda = legendaParaTikTokEShorts(dados);
  assert.match(legenda, /Comenta o placar/);
  assert.match(legenda, /link na bio/);
  assert.ok(legenda.length < 400);
  assert.doesNotMatch(legenda, /Produto Bom/);
});

test('quiz: efeitos sonoros são um WAV válido, com som nos instantes certos e silêncio entre eles', () => {
  const wav = sintetizarEfeitos(4, [{ t: 1, tipo: 'tic' }, { t: 2, tipo: 'tac' }, { t: 3, tipo: 'ding' }]);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.length, 44 + 4 * 44_100 * 4);
  const amostra = (t: number) => Math.abs(wav.readInt16LE(44 + Math.round(t * 44_100) * 4));
  const pico = (de: number, ate: number) => Math.max(...Array.from({ length: 300 }, (_, k) => amostra(de + ((ate - de) * k) / 300)));
  assert.ok(pico(1, 1.05) > 3000 && pico(2, 2.05) > 3000 && pico(3, 3.1) > 5000, 'som onde há efeito');
  assert.ok(pico(0.2, 0.9) === 0 && pico(1.5, 1.9) === 0, 'silêncio no resto');
});

const temFfmpeg = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version']).status === 0;
test('quiz: monta o mp4 vertical com áudio, tic-tac e ding', { skip: !temFfmpeg && 'ffmpeg não instalado nesta máquina' }, async () => {
  const banco = bancoComProdutos();
  const pasta = mkdtempSync(join(tmpdir(), 'quiz-teste-'));
  const config = lerConfig({ ...base, INSTAGRAM_REELS_POR_DIA: '1', BLOG_PASTA: pasta });
  assert.equal(await prepararQuiz(banco, config, AGORA, foto), true);
  const aviso = await gravarQuiz(banco, config, AGORA);
  assert.equal(aviso, undefined);
  const arquivo = join(pasta, 'social', arquivoDoReel(banco.reelPendente(AGORA)!.chave));
  assert.ok(existsSync(arquivo));
  assert.ok(statSync(arquivo).size > 100_000, 'vídeo com conteúdo');
  const sonda = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-i', arquivo], { encoding: 'utf8' });
  assert.match(sonda.stderr, /1080x1920/);
  assert.match(sonda.stderr, /Audio: aac/);
  const duracao = /Duration: 00:00:(\d+\.\d+)/.exec(sonda.stderr);
  assert.ok(duracao && Number(duracao[1]) > 25 && Number(duracao[1]) < 45, `duração ${duracao?.[1]}`);
});
