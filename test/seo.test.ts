import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gerarBlog } from '../src/blog.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { avisarIndexNow, chaveDoIndexNow, llmsTxt, paginasParaAvisar } from '../src/seo.ts';

const AGORA = new Date('2026-11-10T15:00:00Z');
const base = { BLOG_ATIVO: '1', BLOG_URL: 'https://fulano.github.io/achadinhos', BLOG_NOME: 'Mata Preço' };

test('seo: llms.txt resume o site, lista guias e ofertas e avisa que o preço muda', () => {
  const config = lerConfig(base);
  const t = llmsTxt(config, [{ titulo: 'Melhores air fryers', url: 'https://x/melhores-air-fryers.html', nota: '5 produtos comparados' }], [{ titulo: 'Ofertas de hoje [tech]', url: 'https://x/post.html' }]);
  assert.match(t, /^# Mata Preço\n\n> /);
  assert.match(t, /- \[Melhores air fryers\]\(https:\/\/x\/melhores-air-fryers\.html\): 5 produtos comparados/);
  assert.match(t, /\[Ofertas de hoje tech\]/, 'colchetes do título não quebram o link');
  assert.match(t, /preços mudam/);
  assert.match(llmsTxt(config, [], []), /\(em breve\)/);
});

test('seo: a chave do IndexNow é estável por site e tem 32 caracteres', () => {
  const k = chaveDoIndexNow('https://fulano.github.io/achadinhos');
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.equal(k, chaveDoIndexNow('https://fulano.github.io/achadinhos'));
  assert.notEqual(k, chaveDoIndexNow('https://outro.github.io/x'));
});

test('seo: o IndexNow avisa só o que é novo ou mudou, com a chave e o local dela, e tenta de novo se for recusado', async () => {
  const banco = new Banco(':memory:');
  const config = lerConfig(base);
  const chamadas: any[] = [];
  let status = 422;
  const f = (async (url: string, init: any) => {
    chamadas.push({ url: String(url), corpo: JSON.parse(init.body) });
    return new Response('', { status });
  }) as unknown as typeof fetch;
  const paginas = [
    { url: 'https://fulano.github.io/achadinhos/a.html', alteradoEm: 1000 },
    { url: 'https://fulano.github.io/achadinhos/b.html', alteradoEm: 2000 },
  ];
  let r = await avisarIndexNow(banco, config, paginas, AGORA, f);
  assert.equal(r.avisadas, 0);
  assert.match(r.avisos.join(' '), /recusou \(422\)/);
  status = 200;
  r = await avisarIndexNow(banco, config, paginas, AGORA, f);
  assert.equal(r.avisadas, 2);
  const c = chamadas.at(-1);
  assert.equal(c.url, 'https://api.indexnow.org/indexnow');
  assert.equal(c.corpo.host, 'fulano.github.io');
  assert.equal(c.corpo.key, chaveDoIndexNow(config.blog.url));
  assert.equal(c.corpo.keyLocation, `https://fulano.github.io/achadinhos/${c.corpo.key}.txt`);
  assert.deepEqual(c.corpo.urlList, [paginas[1]!.url, paginas[0]!.url], 'as mais recentes primeiro');
  const antes = chamadas.length;
  r = await avisarIndexNow(banco, config, paginas, AGORA, f);
  assert.equal(chamadas.length, antes, 'nada mudou: não avisa de novo');
  const mudou = [{ ...paginas[0]!, alteradoEm: 5000 }, paginas[1]!];
  assert.deepEqual(paginasParaAvisar(banco, mudou, AGORA).map((p) => p.url), [paginas[0]!.url]);
  assert.equal((await avisarIndexNow(banco, lerConfig({ ...base, BLOG_INDEXNOW: '0' }), mudou, AGORA, f)).avisadas, 0, 'desligado');
  assert.equal((await avisarIndexNow(banco, lerConfig({ ...base, BLOG_URL: '' }), mudou, AGORA, f)).avisadas, 0, 'sem endereço público');
});

test('seo: o blog grava llms.txt, o arquivo da chave e a lista de endereços', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'blogseo-'));
  const config = lerConfig({ ...base, BLOG_PASTA: pasta });
  const banco = new Banco(':memory:');
  const r = await gerarBlog(banco, config, AGORA, (async () => new Response('', { status: 500 })) as unknown as typeof fetch);
  assert.equal(r.gerou, true);
  assert.ok(existsSync(join(pasta, 'llms.txt')));
  assert.match(readFileSync(join(pasta, 'llms.txt'), 'utf8'), /^# Mata Preço/);
  const chave = chaveDoIndexNow(config.blog.url);
  assert.equal(readFileSync(join(pasta, `${chave}.txt`), 'utf8'), chave);
  assert.ok((r.enderecos ?? []).some((e) => e.url === 'https://fulano.github.io/achadinhos/'));
  assert.ok((r.enderecos ?? []).every((e) => !e.url.endsWith('404.html')));
});
