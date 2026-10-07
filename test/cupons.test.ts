import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { chaveDoCupom, cupomVigente, escolherCupom, lerCupons, montarMensagemCupom } from '../src/cupons.ts';
import { Banco } from '../src/db.ts';
import { postarProximoCupom } from '../src/pipeline.ts';
import type { Cupom } from '../src/cupons.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const config = lerConfig({});
// 3 de outubro de 2026, 15h em Brasília.
const AGORA = new Date('2026-10-03T18:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);

const ml: Cupom = { loja: 'mercadolivre', codigo: 'ACHA30', titulo: 'R$ 30 OFF acima de R$ 200', link: 'https://meli.la/abc', validoAte: '2026-10-10' };
const shopee: Cupom = { loja: 'shopee', titulo: 'R$ 10 OFF sem mínimo', link: 'https://shp.ee/xyz' };

class Falso {
  cupons: string[] = [];
  falha?: Error;
  async publicar(_: OfertaAvaliada) {}
  async publicarCupom(c: Cupom) {
    if (this.falha) throw this.falha;
    this.cupons.push(c.titulo);
  }
}

test('cupons: arquivo válido é lido; erros viram avisos e o cupom ruim é ignorado', () => {
  const lido = lerCupons(JSON.stringify([ml, shopee, { loja: 'amazon', titulo: 'x', link: 'https://amazon.com.br/x' }, { loja: 'shopee', titulo: 'Link de outra loja', link: 'https://mercadolivre.com.br/x' }, { loja: 'shopee', titulo: 'sem https', link: 'http://shp.ee/x' }, { loja: 'shopee', titulo: 'data torta', link: 'https://shp.ee/x', validoAte: '10/10/2026' }, { loja: 'shopee', link: 'https://shp.ee/x' }]));
  assert.equal(lido.cupons.length, 2);
  assert.equal(lido.avisos.length, 5);
  assert.match(lido.avisos.join('\n'), /não é do Shopee/);
  assert.deepEqual(lerCupons('').cupons, []);
  assert.deepEqual(lerCupons('[]').avisos, []);
  assert.match(lerCupons('{ quebrado').avisos[0], /JSON válido/);
  assert.match(lerCupons('{}').avisos[0], /lista/);
});

test('cupons: vale até o fim do dia de validade, no horário de Brasília', () => {
  assert.equal(cupomVigente(ml, new Date('2026-10-11T02:30:00Z')), true); // 23h30 do dia 10
  assert.equal(cupomVigente(ml, new Date('2026-10-11T03:30:00Z')), false); // 0h30 do dia 11
  assert.equal(cupomVigente(shopee, dias(400)), true, 'sem data vale sempre');
});

test('cupons: mensagem com código, sem código, aviso de vencimento e HTML escapado', () => {
  const m = montarMensagemCupom(ml, AGORA);
  assert.match(m, /CUPOM MERCADO LIVRE/);
  assert.match(m, /<code>ACHA30<\/code>/);
  assert.match(m, /Válido até 10\/10\/2026/);
  assert.match(montarMensagemCupom(shopee, AGORA), /Sem código/);
  assert.match(montarMensagemCupom(ml, dias(7)), /Vence hoje/);
  assert.ok(montarMensagemCupom({ ...ml, titulo: 'A <b> & B' }, AGORA).includes('A &lt;b&gt; &amp; B'));
});

test('cupons: nunca postado primeiro; depois só após o intervalo; o que vence antes tem prioridade; vencido nunca', () => {
  const postados = new Map<string, number>();
  const ultimo = (k: string) => postados.get(k);
  assert.equal(escolherCupom([shopee, ml], ultimo, 3, AGORA)?.titulo, ml.titulo, 'vence antes');
  postados.set(chaveDoCupom(ml), AGORA.getTime());
  assert.equal(escolherCupom([ml, shopee], ultimo, 3, AGORA)?.titulo, shopee.titulo, 'novo antes de repetir');
  postados.set(chaveDoCupom(shopee), AGORA.getTime());
  assert.equal(escolherCupom([ml, shopee], ultimo, 3, dias(1)), undefined, 'dentro do intervalo');
  assert.equal(escolherCupom([ml, shopee], ultimo, 3, dias(4))?.titulo, ml.titulo, 'passou o intervalo, o que vence antes sai');
  assert.equal(escolherCupom([ml], () => undefined, 3, dias(8)), undefined, 'vencido');
});

test('cupons: pipeline respeita horário, limite por dia e registra o post', async () => {
  const banco = new Banco(':memory:');
  const pub = new Falso();
  const c = [ml, shopee, { ...shopee, titulo: 'Outro' }, { ...shopee, titulo: 'Mais um' }];
  assert.equal((await postarProximoCupom(pub, banco, c, config, new Date('2026-10-03T08:00:00Z'))).postou, false, '5h em Brasília');
  for (let i = 0; i < 3; i++) assert.equal((await postarProximoCupom(pub, banco, c, config, AGORA)).postou, true);
  const quarto = await postarProximoCupom(pub, banco, c, config, AGORA);
  assert.deepEqual(quarto, { postou: false, motivo: 'limite diário' });
  assert.equal(pub.cupons.length, 3);
  assert.equal(new Set(pub.cupons).size, 3, 'sem repetir no mesmo dia');
  assert.deepEqual(await postarProximoCupom(pub, banco, [], config, dias(1)), { postou: false, motivo: 'sem cupom' });
});

test('cupons: erro de envio não registra o cupom, desligado não posta', async () => {
  const banco = new Banco(':memory:');
  const pub = new Falso();
  pub.falha = new Error('rede');
  const r = await postarProximoCupom(pub, banco, [ml], config, AGORA);
  assert.deepEqual(r, { postou: false, motivo: 'erro', detalhe: 'rede' });
  assert.equal(banco.cuponsNoDia(AGORA), 0);
  const off = lerConfig({ CUPONS_ATIVO: '0' });
  assert.deepEqual(await postarProximoCupom(new Falso(), banco, [ml], off, AGORA), { postou: false, motivo: 'desligado' });
});
