import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ganchoDoReel } from '../src/ganchos.ts';
import { PROBLEMAS, problemaDoProduto } from '../src/problemas.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const o = (titulo: string, categoria = 'casa') => ({ titulo, categoria }) as OfertaAvaliada;

test('problema → solução só quando o título comprova a solução', () => {
  assert.equal(problemaDoProduto(o('Jogo de Lençol Queen 400 fios'))?.pergunta, undefined, 'sem "elástico" no título, não promete');
  const p = problemaDoProduto(o('Jogo de Lençol Queen com Elástico 400 fios'))!;
  assert.equal(p.pergunta, 'Lençol que solta do colchão?');
  assert.match(p.resposta, /elástico/);
  assert.match(problemaDoProduto(o('Fone Bluetooth com Cancelamento de Ruído ANC', 'tech'))!.pergunta, /barulho/i);
});

test('nunca usa problema em promessa de corpo ou saúde', () => {
  assert.equal(problemaDoProduto(o('Calça Modeladora Cintura Alta Emagrecedora', 'moda')), undefined);
  assert.equal(problemaDoProduto(o('Cinta Modeladora Cintura Alta', 'moda')), undefined);
});

test('o gancho de problema só entra ligado e em Reel de um produto', () => {
  const lencol = o('Lençol Casal com Elástico');
  assert.notEqual(ganchoDoReel([lencol], '2026-11-02-1').tipo, 'problema', 'desligado: ganchos de sempre');
  assert.equal(ganchoDoReel([lencol], '2026-11-02-1', true).tipo, 'problema');
  assert.notEqual(ganchoDoReel([lencol, o('Pote'), o('Copo')], '2026-11-02-1', true).tipo, 'problema', 'Reel de 3 achados não usa um problema de um só');
});

test('as linhas cabem no gancho e nenhum par fala em preço', () => {
  for (const p of PROBLEMAS) {
    assert.ok(p.linhas.every((l) => l.length <= 20), p.linhas.join(' '));
    assert.ok(!/R\$|barat|preço/i.test(p.linhas.join(' ') + p.resposta));
  }
});

test('"cabo de aço" de mochila não vira gancho de cabo de celular', () => {
  const mochila = problemaDoProduto(o('Mochila Executiva Impermeável Unissex Reforçada com Cabo de Aço para Notebook', 'moda'))!;
  assert.equal(mochila.pergunta, 'Medo de molhar na chuva?');
  assert.match(problemaDoProduto(o('Cabo USB-C Reforçado Nylon Trançado 2m', 'tech'))!.pergunta, /cabo que quebra/i);
});
