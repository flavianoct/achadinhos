import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginaDaBio } from '../src/bio.ts';
import { comCodigo, linhaDoCodigo } from '../src/codigo.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';

const AGORA = new Date('2026-11-28T12:00:00-03:00');

test('oferta numerada: o mesmo link tem sempre o mesmo número, e um número apagado não volta', () => {
  const banco = new Banco(':memory:');
  const a = banco.numeroDaOferta({ titulo: 'Fone', link: 'https://s.shopee.com.br/a' }, AGORA);
  const b = banco.numeroDaOferta({ titulo: 'Panela', link: 'https://s.shopee.com.br/b' }, AGORA);
  assert.deepEqual([a, b], [101, 102]);
  assert.equal(banco.numeroDaOferta({ titulo: 'Fone novo nome', link: 'https://s.shopee.com.br/a' }, AGORA), 101);
  // 200 dias depois, a limpeza apaga os antigos, mas guarda o mais alto: o próximo continua a contagem.
  const depois = new Date(AGORA.getTime() + 200 * 86_400_000);
  banco.limpar(depois);
  assert.equal(banco.numeroDaOferta({ titulo: 'Tênis', link: 'https://s.shopee.com.br/c' }, depois), 103);
});

test('oferta numerada: a linha vai logo depois da primeira; convite de canal e página da bio não ganham número', () => {
  const banco = new Banco(':memory:');
  const legenda = comCodigo('Gancho #publi\n💬 Comenta QUERO\nresto', [{ titulo: 'Fone', link: 'https://s.shopee.com.br/a' }], banco, AGORA);
  assert.deepEqual(legenda.split('\n'), ['Gancho #publi', linhaDoCodigo([101]), '💬 Comenta QUERO', 'resto']);
  for (const link of ['https://whatsapp.com/channel/abc', 'https://chat.whatsapp.com/x', 'https://t.me/canal', 'https://site.com/bio.html']) {
    assert.equal(comCodigo('Convite', [{ titulo: 'Canal', link }], banco, AGORA), 'Convite');
  }
  assert.equal(linhaDoCodigo([101, 102, 103]), '🔎 Ofertas nº 101, 102 e 103 · link na bio (digite o número)');
});

test('bio: a busca por número só aparece quando há ofertas numeradas, e um título não consegue fechar o script', () => {
  const config = lerConfig({ BLOG_ATIVO: '1', BLOG_URL: 'https://x.github.io/y' });
  assert.ok(!paginaDaBio([], config, AGORA).includes('id="numero"'));
  const html = paginaDaBio([], config, AGORA, [{ numero: 247, titulo: 'Fone </script><img src=x onerror=alert(1)>', link: 'https://s.shopee.com.br/a', loja: 'shopee' }]);
  assert.ok(html.includes('id="numero"') && html.includes('"247":'));
  assert.ok(!html.includes('</script><img'), 'o "<" do título vai escapado');
  // O script da página é JavaScript válido.
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]!);
});

test('blog: numeros.json tem o número, o título e o link de cada oferta', async () => {
  const { indiceDosNumeros } = await import('../src/bio.ts');
  assert.deepEqual(indiceDosNumeros([{ numero: 247, titulo: 'Fone', link: 'https://s.shopee.com.br/a', loja: 'shopee' }, { numero: 248, titulo: 'Sem link', link: 'javascript:alert(1)' }]), { '247': ['Fone', 'https://s.shopee.com.br/a', 'Shopee'] });
});

test('reel agendado: o número desenhado no vídeo é reservado para o link, e os próximos continuam depois dele', async () => {
  const { reservarNumerosDosAgendados } = await import('../src/agendados.ts');
  const banco = new Banco(':memory:');
  banco.numeroDaOferta({ titulo: 'Fone', link: 'https://s.shopee.com.br/a' }, AGORA);
  const reel = { id: 'r', arquivo: 'r.mp4', quando: '2026-11-29T14:00:00-03:00', titulo: 'Sacos', link: 'https://s.shopee.com.br/s', legenda: 'x', numero: 7777 };
  reservarNumerosDosAgendados(banco, AGORA, [reel]);
  reservarNumerosDosAgendados(banco, AGORA, [reel]);
  assert.equal(banco.numeroDaOferta(reel, AGORA), 7777);
  assert.equal(banco.numeroDaOferta({ titulo: 'Panela', link: 'https://s.shopee.com.br/b' }, AGORA), 7778);
});
