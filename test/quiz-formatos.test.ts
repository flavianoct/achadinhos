import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { gravarQuiz, formatoDoDia, legendaDoQuiz, prepararQuiz, telasDoQuiz, tipoDoQuiz, type DadosDoQuiz, type RodadaDaSombra, type RodadaDoPrefere } from '../src/quiz.ts';
import { arquivoDoReel } from '../src/reel.ts';
import { criarSilhueta } from '../src/silhueta.ts';
import { renderizarPng } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// Segunda-feira, 12h em Brasília (0 = domingo ... 1 = segunda ... 6 = sábado)
const AGORA = new Date('2026-10-12T15:00:00Z');
const base = {
  INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 't', INSTAGRAM_USER_ID: '1', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23',
  INSTAGRAM_HORARIOS_FEED: '', INSTAGRAM_HORARIOS_STORIES: '', INSTAGRAM_HORARIOS_REELS: '', INSTAGRAM_REELS_POR_DIA: '1', QUIZ_ATIVO: '1',
};
const comFormato = (f: string) => lerConfig({ ...base, QUIZ_FORMATOS: `preco,${f},preco,preco,preco,preco,preco` }); // segunda = o formato f

/** Fotos de verdade (PNG): produto escuro num fundo branco, ou numa cor (sem fundo branco). */
async function fotoPng(opcoes: { fundo: string; forma?: string }): Promise<Buffer> {
  const forma = opcoes.forma ?? '<rect x="150" y="140" width="300" height="320" rx="60" fill="#1f2937"/><rect x="200" y="190" width="200" height="90" rx="20" fill="#ffffff"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${opcoes.fundo}"/>${forma}</svg>`;
  return (await renderizarPng(svg, 600))!;
}
const comoDataUri = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

const produto = (n: number, extra: Partial<OfertaAvaliada> = {}): OfertaAvaliada => ({
  loja: 'shopee', idProduto: `S${n}`, titulo: `Produto Bom Numero ${n} Com Nome Bem Longo Para Testar a Quebra de Linha`, preco: 40 + n * 13.9, link: `https://s.shopee.com.br/${n}`,
  imagem: `https://down-br.img.susercontent.com/${n % 2 ? 'branca' : 'branca'}-${n}.png`, nota: 4.8, vendas: 2000 + n, categoria: ['tech', 'casa', 'beleza', 'moda'][n % 4]!, pontos: 100 - n, ...extra,
});
function bancoComProdutos(extra: (n: number) => Partial<OfertaAvaliada> = () => ({}), quantos = 12) {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= quantos; i++) banco.guardarProduto(produto(i, extra(i)), new Date(AGORA.getTime() - i * 60_000));
  return banco;
}
const servidor = (png: Buffer) => (async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;

test('silhueta: foto de fundo branco vira silhueta preta com fundo transparente, e o branco cercado pelo produto continua sendo produto', async () => {
  const r = await criarSilhueta(comoDataUri(await fotoPng({ fundo: '#ffffff' })));
  assert.ok('sombra' in r, JSON.stringify(r));
  assert.match(r.sombra, /^data:image\/png;base64,/);
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(Buffer.from(r.sombra.split(',')[1]!, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (fx: number, fy: number) => {
    const i = (Math.round(info.height * fy) * info.width + Math.round(info.width * fx)) * 4;
    return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
  };
  assert.equal(px(0.05, 0.05).a, 0, 'o fundo (canto) é transparente');
  assert.deepEqual(px(0.5, 0.65), { r: 0, g: 0, b: 0, a: 255 }, 'o produto é preto e opaco');
  assert.equal(px(0.5, 0.4).a, 255, 'o retângulo branco DENTRO do produto não vira buraco (não toca a borda)');
});

test('silhueta: foto sem fundo branco, produto minúsculo, produto que ocupa tudo e foto inválida são recusados com o motivo', async () => {
  const motivo = async (uri: string | undefined) => {
    const r = await criarSilhueta(uri);
    return 'motivo' in r ? r.motivo : 'SERVIU';
  };
  assert.match(await motivo(comoDataUri(await fotoPng({ fundo: '#7dd3fc' }))), /fundo da foto não é branco/);
  assert.match(await motivo(comoDataUri(await fotoPng({ fundo: '#ffffff', forma: '<rect x="290" y="290" width="20" height="20" fill="#111"/>' }))), /pequeno demais/);
  assert.match(await motivo(comoDataUri(await fotoPng({ fundo: '#ffffff', forma: '<rect x="20" y="20" width="560" height="560" fill="#111"/>' }))), /ocupa a foto toda|fundo/);
  assert.match(await motivo(undefined), /sem foto/);
  assert.match(await motivo('data:image/png;base64,AAAA'), /não consegui ler/);
});

test('quiz: o formato de cada dia vem de QUIZ_FORMATOS (domingo a sábado); valor inválido ou faltando vira preço', () => {
  const c = lerConfig({ ...base, QUIZ_FORMATOS: 'sombra,prefere,preco,xis' });
  assert.deepEqual(c.quiz.formatos, ['sombra', 'prefere', 'preco', 'preco', 'preco', 'preco', 'preco']);
  assert.equal(formatoDoDia(c, new Date('2026-10-11T15:00:00Z')), 'sombra', 'domingo');
  assert.equal(formatoDoDia(c, AGORA), 'prefere', 'segunda');
  assert.deepEqual(lerConfig(base).quiz.formatos, Array(7).fill('preco'), 'sem o ajuste, tudo é preço');
});

test('quiz sombra: usa 3 produtos de foto de fundo branco, mostra só a silhueta e revela foto, nome e preço', async () => {
  const banco = bancoComProdutos();
  const config = comFormato('sombra');
  assert.equal(await prepararQuiz(banco, config, AGORA, servidor(await fotoPng({ fundo: '#ffffff' }))), true);
  const dados = JSON.parse(banco.reelPendente(AGORA)!.dados) as DadosDoQuiz;
  assert.equal(tipoDoQuiz(dados), 'sombra');
  assert.match(dados.titulo, /^Que produto é esse\?/);
  const rodadas = dados.rodadas as RodadaDaSombra[];
  assert.equal(rodadas.length, 3);
  assert.ok(rodadas.every((r) => r.sombra.startsWith('data:image/png') && r.imagem.startsWith('data:image')));
  const { svgs, efeitos } = telasDoQuiz(dados);
  assert.equal(svgs.length, 17);
  const pergunta = svgs[1]!;
  assert.ok(pergunta.includes('ADIVINHE PELA SOMBRA') && pergunta.includes(rodadas[0]!.sombra) && !pergunta.includes(rodadas[0]!.imagem), 'a pergunta mostra só a silhueta');
  assert.ok(pergunta.includes('Dica: '), 'dica de categoria');
  const revelacao = svgs[5]!;
  assert.ok(revelacao.includes('ERA ESTE!') && revelacao.includes(rodadas[0]!.imagem) && !revelacao.includes(rodadas[0]!.sombra), 'a revelação mostra a foto');
  assert.ok(revelacao.includes('R$') && revelacao.includes('Preço de hoje, pode mudar'));
  assert.equal(efeitos.filter((e) => e.tipo === 'ding').length, 3);
  const legenda = legendaDoQuiz(dados, config);
  assert.ok(!legenda.includes('Produto Bom Numero'), 'a legenda não entrega a resposta');
  assert.match(legenda, /Quantos produtos você adivinhou\?/);
  assert.match(legenda, /Publi: links de afiliado/);
});

test('quiz sombra: sem fotos de fundo branco, cai no quiz de preço (a vaga do dia não se perde)', async () => {
  const banco = bancoComProdutos();
  assert.equal(await prepararQuiz(banco, comFormato('sombra'), AGORA, servidor(await fotoPng({ fundo: '#7dd3fc' }))), true);
  assert.equal(tipoDoQuiz(JSON.parse(banco.reelPendente(AGORA)!.dados)), 'preco');
});

test('quiz prefere: duelos de dois produtos da mesma categoria e preço parecido, A e B em tela dividida e os dois preços no fim', async () => {
  // 12 produtos de 4 categorias, 3 de cada, com preços próximos dentro da categoria.
  const banco = bancoComProdutos((n) => ({ categoria: ['tech', 'casa', 'beleza'][n % 3]!, preco: 60 + (n % 3) * 20 + n }));
  const config = comFormato('prefere');
  assert.equal(await prepararQuiz(banco, config, AGORA, servidor(await fotoPng({ fundo: '#ffffff' }))), true);
  const dados = JSON.parse(banco.reelPendente(AGORA)!.dados) as DadosDoQuiz;
  assert.equal(tipoDoQuiz(dados), 'prefere');
  const rodadas = dados.rodadas as RodadaDoPrefere[];
  assert.equal(rodadas.length, 3);
  for (const r of rodadas) {
    assert.notEqual(r.a.oferta.idProduto, r.b.oferta.idProduto);
    assert.equal(r.a.oferta.categoria, r.b.oferta.categoria, 'mesma categoria');
    assert.ok(Math.max(r.a.oferta.preco, r.b.oferta.preco) / Math.min(r.a.oferta.preco, r.b.oferta.preco) <= 2.2, 'preço parecido');
  }
  const todos = rodadas.flatMap((r) => [r.a.oferta.idProduto, r.b.oferta.idProduto]);
  assert.equal(new Set(todos).size, 6, 'nenhum produto repete');
  const { svgs } = telasDoQuiz(dados);
  const pergunta = svgs[1]!;
  assert.ok(pergunta.includes('QUAL VOCÊ PREFERE?') && pergunta.includes('>VS<') && !pergunta.includes('R$'), 'a pergunta não mostra preço');
  assert.ok(pergunta.includes('>A<') && pergunta.includes('>B<'));
  assert.ok(svgs.slice(2, 5).every((s, i) => s.includes(`>${3 - i}</text>`)), 'a contagem 3-2-1 toma o lugar do VS');
  const revelacao = svgs[5]!;
  assert.ok(revelacao.includes('OS DOIS PREÇOS') && (revelacao.match(/R\$/g) ?? []).length === 2 && revelacao.includes('Preço de hoje, pode mudar'));
  assert.ok(svgs[16]!.includes('QUAL ESCOLHE?'), 'fechamento pede A ou B');
  const legenda = legendaDoQuiz(dados, config);
  assert.match(legenda, /Comenta A ou B/);
  assert.match(legenda, / x /, 'lista os duelos');
  for (const s of svgs.slice(1, -1)) for (const y of [...s.matchAll(/<text[^>]* y="(\d+)"/g)].map((m) => Number(m[1]))) assert.ok(y <= 1520, `texto em y=${y}`);
});

test('quiz prefere: sem pares de preço parecido não cria o duelo e cai no quiz de preço, que também precisa de 3 produtos', async () => {
  const so = new Banco(':memory:');
  so.guardarProduto(produto(1, { preco: 20 }), AGORA);
  so.guardarProduto(produto(2, { preco: 900 }), new Date(AGORA.getTime() - 60_000));
  so.guardarProduto(produto(3, { preco: 5000 }), new Date(AGORA.getTime() - 120_000)); // fora da faixa de preço do quiz
  assert.equal(await prepararQuiz(so, comFormato('prefere'), AGORA, servidor(await fotoPng({ fundo: '#ffffff' }))), false);
  assert.equal(so.reelPendente(AGORA), undefined);
});

const temFfmpeg = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version']).status === 0;
for (const formato of ['sombra', 'prefere'] as const) {
  test(`quiz ${formato}: monta o mp4 vertical com áudio`, { skip: !temFfmpeg && 'ffmpeg não instalado nesta máquina' }, async () => {
    const banco = bancoComProdutos((n) => ({ categoria: ['tech', 'casa', 'beleza'][n % 3]!, preco: 60 + (n % 3) * 20 + n }));
    const pasta = mkdtempSync(join(tmpdir(), `quiz-${formato}-`));
    const config = lerConfig({ ...base, QUIZ_FORMATOS: `preco,${formato},preco,preco,preco,preco,preco`, BLOG_PASTA: pasta });
    assert.equal(await prepararQuiz(banco, config, AGORA, servidor(await fotoPng({ fundo: '#ffffff' }))), true);
    assert.equal(tipoDoQuiz(JSON.parse(banco.reelPendente(AGORA)!.dados)), formato);
    assert.equal(await gravarQuiz(banco, config, AGORA), undefined);
    const arquivo = join(pasta, 'social', arquivoDoReel(banco.reelPendente(AGORA)!.chave));
    assert.ok(existsSync(arquivo) && statSync(arquivo).size > 100_000);
    const sonda = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-i', arquivo], { encoding: 'utf8' });
    assert.match(sonda.stderr, /1080x1920/);
    assert.match(sonda.stderr, /Audio: aac/);
  });
}
