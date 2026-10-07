import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');

interface Rodada {
  codigo: number;
  saida: string;
}

/** Executa o programa de verdade, como o GitHub Actions faz, numa pasta vazia e com a internet simulada. */
function rodarNaNuvem(pasta: string, env: Record<string, string>): Promise<Rodada> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--import', pathToFileURL(join(RAIZ, 'test', 'apoio', 'fetch-falso.mjs')).href, join(RAIZ, 'src', 'index.ts'), '--nuvem'],
      { cwd: pasta, env: { PATH: process.env.PATH ?? '', REGISTRO_DO_FETCH: join(pasta, 'fetch.log'), GITHUB_STEP_SUMMARY: join(pasta, 'resumo.md'), ...env }, timeout: 60_000 },
      (erro, stdout, stderr) => resolve({ codigo: erro ? (typeof (erro as any).code === 'number' ? (erro as any).code : 1) : 0, saida: `${stdout}${stderr}` }),
    );
  });
}

function chamadas(pasta: string): any[] {
  const arq = join(pasta, 'fetch.log');
  return existsSync(arq) ? readFileSync(arq, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

const SEGREDOS = { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '@canal_teste', SHOPEE_APP_ID: 'app', SHOPEE_SECRET: 'segredo', GITHUB_TOKEN: 'token-do-workflow', BLOG_URL: 'https://fulano.github.io/achadinhos' };

test('nuvem: rodadas seguidas coletam, postam sem repetir, escrevem o blog com IA e guardam o estado em dados.db', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'nuvem-'));
  writeFileSync(join(pasta, 'ajustes.env'), 'SHOPEE_ATIVO=1\nPOSTS_POR_RODADA=2\nHORA_INICIO=0\nHORA_FIM=24\nBLOG_ATIVO=1\nBLOG_IA=github\nGITHUB_PAUSA_MS=0\nBLOG_NOME=Blog de Teste\n');

  // 1ª execução, antes de cadastrar as chaves: termina em erro, mas já deixa um site no ar.
  const semChaves = await rodarNaNuvem(pasta, {});
  assert.equal(semChaves.codigo, 1, semChaves.saida);
  assert.match(semChaves.saida, /ainda não pode rodar/);
  assert.match(semChaves.saida, /TELEGRAM_BOT_TOKEN/);
  assert.match(readFileSync(join(pasta, 'blog', 'index.html'), 'utf8'), /Os primeiros posts chegam em breve/);
  assert.equal(chamadas(pasta).length, 0, 'sem chaves, não chama nenhum serviço');

  // 2ª execução, com as chaves.
  const r1 = await rodarNaNuvem(pasta, SEGREDOS);
  assert.equal(r1.codigo, 0, r1.saida);
  const c1 = chamadas(pasta);
  const posts1 = c1.filter((c) => c.servico === 'telegram');
  assert.equal(posts1.length, 2, 'posta POSTS_POR_RODADA ofertas');
  assert.ok(posts1.every((p) => p.metodo === 'sendPhoto' && p.chat === '@canal_teste'));
  assert.match(posts1[0].texto, /Fone Bluetooth Modelo 1<\/b>/, 'a melhor oferta sai primeiro');
  const ia = c1.filter((c) => c.servico === 'ia');
  assert.equal(ia.length, 12, 'a IA escreve até o teto da rodada');
  assert.ok(ia.every((c) => c.auth === 'Bearer token-do-workflow' && c.modelo === 'openai/gpt-4o-mini'));

  // Painel e fila do WhatsApp saem junto com o site, sem nenhum segredo.
  const zap = JSON.parse(readFileSync(join(pasta, 'blog', 'whatsapp.json'), 'utf8'));
  assert.equal(zap.mensagens.length, 2, 'cada oferta postada no Telegram vira uma mensagem de WhatsApp');
  assert.match(zap.mensagens[0].texto, /^🔥 \*Fone Bluetooth Modelo 1\*/);
  assert.ok(zap.mensagens[0].id && zap.mensagens[0].criadoEm && zap.mensagens[0].link);
  const status = JSON.parse(readFileSync(join(pasta, 'blog', 'status.json'), 'utf8'));
  assert.equal(status.postsHoje, 2);
  assert.equal(status.whatsappPendentes, 2);
  assert.equal(status.canais.telegram, true);
  assert.equal(status.rodada.postados, 2);
  const publico = readFileSync(join(pasta, 'blog', 'status.json'), 'utf8') + readFileSync(join(pasta, 'blog', 'whatsapp.json'), 'utf8');
  for (const segredo of ['123:abc', 'segredo', 'token-do-workflow']) assert.ok(!publico.includes(segredo), `status público não pode conter ${segredo}`);
  assert.match(readFileSync(join(pasta, 'blog', 'painel.html'), 'utf8'), /noindex/);
  const bio = readFileSync(join(pasta, 'blog', 'bio.html'), 'utf8');
  assert.match(bio, /noindex/);
  assert.match(bio, /Ver oferta n[ao] /, 'a página do link da bio lista as ofertas postadas');
  assert.match(bio, /rel="sponsored nofollow noopener"/);
  const social = JSON.parse(readFileSync(join(pasta, 'blog', 'social.json'), 'utf8'));
  assert.equal(social.itens.length, 2, 'cada oferta postada ganha conteúdo de Story e Reels');
  assert.match(social.itens[0].svg, /^<svg[^>]+1080/);
  assert.match(social.itens[0].svg, /data:image\/png;base64,/, 'a foto do produto vai embutida na arte');
  assert.match(social.itens[0].legenda, /Todas as ofertas no blog, link na bio: fulano\.github\.io\/achadinhos/);
  assert.match(social.itens[0].legenda, /#publi/);
  assert.match(social.itens[0].roteiro, /0 a 3 s/);

  const arquivos = readdirSync(join(pasta, 'blog'));
  const postDoDia = arquivos.find((a) => /^post-\d{4}-\d{2}-\d{2}-ofertas-do-dia\.html$/.test(a));
  assert.ok(postDoDia, `post do dia em ${arquivos.join(', ')}`);
  const html = readFileSync(join(pasta, 'blog', postDoDia), 'utf8');
  assert.match(html, /<h1>Top 10 ofertas do dia \d{2}\/\d{2}\/\d{4}<\/h1>/);
  assert.ok(html.includes('Texto da IA de teste'));
  assert.ok(html.includes(`<link rel="canonical" href="https://fulano.github.io/achadinhos/${postDoDia}">`), 'o endereço do blog vem do workflow');
  assert.ok(html.includes('https://t.me/canal_teste'));
  assert.ok(existsSync(join(pasta, 'blog', 'sitemap.xml')) && existsSync(join(pasta, 'dados.db')));
  const resumo = readFileSync(join(pasta, 'resumo.md'), 'utf8');
  assert.match(resumo, /Coleta: 12 ofertas vistas, 12 aprovadas/);
  assert.match(resumo, /Telegram: 2 ofertas postadas/);

  // 3ª execução: um processo novo, que só sabe o que está em dados.db. Não pode repetir oferta.
  const r2 = await rodarNaNuvem(pasta, SEGREDOS);
  assert.equal(r2.codigo, 0, r2.saida);
  const posts2 = chamadas(pasta).filter((c) => c.servico === 'telegram');
  assert.equal(posts2.length, 4);
  assert.equal(new Set(posts2.map((p) => p.texto.split('\n')[0])).size, 4, 'quatro ofertas diferentes');
  const prompts = chamadas(pasta).filter((c) => c.servico === 'ia').map((c) => c.prompt);
  assert.ok(prompts.length > 12, 'a segunda rodada escreve o que faltou no teto da primeira');
  assert.equal(new Set(prompts).size, prompts.length, 'nenhum texto já escrito é pedido de novo');

  // Loja fora do ar: a rodada termina em vermelho, mas o blog continua lá e a fila segue sendo postada.
  const r3 = await rodarNaNuvem(pasta, { ...SEGREDOS, SHOPEE_FORA_DO_AR: '1' });
  assert.equal(r3.codigo, 1, r3.saida);
  assert.match(r3.saida, /Erro em shopee/);
  assert.equal(chamadas(pasta).filter((c) => c.servico === 'telegram').length, 6);
  assert.ok(existsSync(join(pasta, 'blog', postDoDia)));
});
