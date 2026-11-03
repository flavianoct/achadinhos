import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerComandosDoTelegram } from '../src/comandos.ts';
import { Banco } from '../src/db.ts';
// @ts-ignore: módulo .mjs puro, sem tipos
import { ehToqueQueMuda, iniciar, menuPrincipal, respostaDeNavegacao, respostaDeRecebido, respostaDeTexto } from '../enviador/menu-telegram.mjs';

const sexta = new Date('2026-11-06T15:00:00-03:00');

test('menu da VPS: navega sem mudar nada e usa a lista de temas publicada pelo robô', () => {
  const estado = { atualizadoEm: new Date().toISOString(), temaAtivo: 'Dia dos vestidos', temas: [{ chave: 'vestidos', nome: 'V' }, { chave: 'calcas', nome: 'Dia: calcas' }] };
  const temas = respostaDeNavegacao('temas', estado);
  assert.deepEqual(temas.teclado.flat().map((b: any) => b.callback_data), ['t:vestidos', 't:calcas', 'menu'], 'os temas criados aparecem como botão');
  assert.match(respostaDeNavegacao('status', estado).texto, /Tema de hoje: Dia dos vestidos/);
  assert.ok(respostaDeNavegacao('t:calcas', estado).teclado.flat().some((b: any) => b.callback_data === 'd:calcas:sexta'));
  assert.equal(respostaDeNavegacao('h:vestidos', estado), undefined, 'o que muda não é navegação');
  assert.ok(respostaDeNavegacao('temas', undefined).teclado.flat().some((b: any) => b.callback_data === 't:games'), 'sem o arquivo do robô, vale a lista de fábrica');
  assert.ok([...menuPrincipal().teclado.flat(), ...temas.teclado.flat()].every((b: any) => Buffer.byteLength(b.callback_data) <= 64));
});

test('menu da VPS: mudança só confirma o recebimento (quem aplica é o robô)', () => {
  assert.equal(ehToqueQueMuda('h:vestidos'), true);
  assert.equal(ehToqueQueMuda('d:vestidos:sexta'), true);
  assert.equal(ehToqueQueMuda('desligar'), true);
  assert.equal(ehToqueQueMuda('temas'), false);
  assert.match(respostaDeRecebido('d:games:sexta').texto, /Recebi.*games toda sexta.*próxima rodada/s);
  assert.equal(respostaDeTexto('/tema vestidos', undefined).tipo, 'muda');
  assert.equal(respostaDeTexto('/novotema calcas calça, jeans', undefined).tipo, 'muda');
  assert.equal(respostaDeTexto('/menu', undefined).tipo, 'navega');
  assert.equal(respostaDeTexto('/qualquer', undefined), undefined, 'o que não é conhecido fica para o robô');
});

test('menu da VPS: só o dono é atendido, cada update é respondido uma vez, e erro de rede não derruba', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'menu-'));
  const vistosPath = join(dir, 'vistos.json');
  const chamadas: string[] = [];
  const msg = (id: number, chat: number, tipo: string, text: string) => ({ update_id: id, message: { text, chat: { id: chat, type: tipo } } });
  let rede = true;
  const falso = (async (url: string) => {
    if (!rede) throw new Error('sem rede');
    const metodo = String(url).split('/').pop()!.split('?')[0]!;
    chamadas.push(metodo);
    if (metodo === 'getUpdates') return { ok: true, json: async () => ({ ok: true, result: [msg(1, 999, 'private', '/menu'), msg(2, 123456, 'group', '/menu'), msg(3, 123456, 'private', '/menu'), msg(4, 123456, 'private', 'oi')] }) } as Response;
    return { ok: true, json: async () => ({ ok: true }) } as Response;
  }) as unknown as typeof fetch;
  const parar = iniciar({ token: 'TOKEN', chat: '123456', urlDoSite: 'https://exemplo', vistosPath, fetchFn: falso, intervaloMs: 20 });
  await new Promise((r) => setTimeout(r, 150));
  parar();
  assert.equal(chamadas.filter((c) => c === 'sendMessage').length, 1, 'uma resposta só, ao /menu do chat privado do dono, mesmo com vários ciclos');
  assert.equal(JSON.parse(readFileSync(vistosPath, 'utf8')).ultimo, 4);
  // erro de rede: não lança
  rede = false;
  const parar2 = iniciar({ token: 'TOKEN', chat: '123456', urlDoSite: 'https://exemplo', vistosPath: join(dir, 'outro.json'), fetchFn: falso, intervaloMs: 20 });
  await new Promise((r) => setTimeout(r, 80));
  parar2();
  // sem token ou sem ID: nem liga
  assert.equal(typeof iniciar({ token: '', chat: '123456', urlDoSite: '', vistosPath }), 'function');
});

test('robô com o menu na VPS: não responde a navegação (a VPS já respondeu), mas aplica as mudanças', async () => {
  const banco = new Banco(':memory:');
  const metodos: string[] = [];
  const cb = (id: number, data: string) => ({ update_id: id, callback_query: { id: `c${id}`, data, from: { id: 123456 }, message: { message_id: 5, chat: { id: 123456, type: 'private' } } } });
  const msg = (id: number, text: string) => ({ update_id: id, message: { text, chat: { id: 123456, type: 'private' } } });
  const falso = (async (url: string) => {
    const metodo = String(url).split('/').pop()!.split('?')[0]!;
    metodos.push(metodo);
    if (metodo === 'getUpdates') return { ok: true, json: async () => ({ ok: true, result: [msg(1, '/menu'), cb(2, 'temas'), cb(3, 't:vestidos'), msg(4, '/status'), cb(5, 'h:vestidos')] }) } as Response;
    return { ok: true, json: async () => ({ ok: true }) } as Response;
  }) as unknown as typeof fetch;
  assert.equal(await lerComandosDoTelegram(banco, 'TOKEN', '123456', sexta, { menuNaVps: true }, falso), true);
  assert.equal(banco.ajustesDeComando().TEMA_DO_DIA, 'vestidos', 'a mudança foi aplicada');
  assert.equal(metodos.filter((m) => m === 'sendMessage').length, 0, 'sem resposta de navegação em texto');
  assert.equal(metodos.filter((m) => m === 'editMessageText').length, 1, 'só a mudança confirma (trocando a mensagem de "recebi")');
});
