import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarComandos, executarComando, lerComandosDoTelegram, palavrasDoTema } from '../src/comandos.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { temaDeHoje } from '../src/temas.ts';

const sexta = new Date('2026-11-06T15:00:00-03:00');
const quinta = new Date('2026-11-05T15:00:00-03:00');

test('comandos: /tema liga hoje, com dia liga toda semana, e desligar apaga', () => {
  const banco = new Banco(':memory:');
  assert.match(executarComando('/tema vestidos', banco, sexta).resposta, /HOJE/);
  const hoje = aplicarComandos({}, banco);
  assert.equal(hoje.TEMA_DO_DIA, 'vestidos');
  assert.equal(temaDeHoje(hoje, sexta)?.chave, 'vestidos');
  assert.equal(temaDeHoje(hoje, quinta), undefined, 'o tema de hoje não vale amanhã');
  executarComando('/tema games sexta', banco, quinta);
  assert.equal(temaDeHoje(aplicarComandos({}, banco), sexta)?.chave, 'games');
  assert.equal(temaDeHoje(aplicarComandos({}, banco), quinta), undefined);
  assert.match(executarComando('/tema desligar', banco, sexta).resposta, /desligado/);
  assert.equal(temaDeHoje(aplicarComandos({}, banco), sexta), undefined);
});

test('comandos: /novotema cria um tema que vale de verdade (as palavras viram o filtro TEMA) e /apagartema remove', () => {
  const banco = new Banco(':memory:');
  assert.match(executarComando('/novotema calcas calça, jeans, Legging', banco, sexta).resposta, /criado com 3 palavras/);
  executarComando('/tema calcas', banco, sexta);
  const env = aplicarComandos({}, banco);
  const tema = temaDeHoje(env, sexta)!;
  assert.equal(tema.tema.ajustes.TEMA, 'calca,jeans,legging');
  assert.equal(lerConfig(env, sexta).temaDoDia, 'Dia: calcas');
  assert.match(executarComando('/temas', banco, sexta).resposta, /calcas.*criado por você/);
  assert.match(executarComando('/apagartema calcas', banco, sexta).resposta, /apagado/);
  assert.equal(temaDeHoje(aplicarComandos({}, banco), sexta), undefined, 'apagar o tema o desliga');
});

test('comandos: nomes reservados, temas inexistentes, dia inválido e lixo não quebram nem mudam nada', () => {
  const banco = new Banco(':memory:');
  for (const c of ['/novotema vestidos a, b, c', '/novotema desligar abc', '/novotema x', '/tema inexistente', '/tema vestidos domingão', '/coisa', '/tema', '/apagartema nada']) {
    const r = executarComando(c, banco, sexta);
    assert.equal(r.mudou, false, c);
    assert.ok(r.resposta.length > 5);
  }
  assert.deepEqual(banco.ajustesDeComando(), {});
});

test('comandos: JSON de temas estragado é ignorado e não derruba a configuração', () => {
  const env = { TEMA_DO_DIA: 'qualquer', TEMA_DO_DIA_DATA: '2026-11-06', TEMAS_EXTRAS: '{ isso nao e json' };
  assert.equal(temaDeHoje(env, sexta), undefined);
  assert.doesNotThrow(() => lerConfig(env, sexta));
  assert.deepEqual(palavrasDoTema('calça, jeans, ab, legging'), ['calca', 'jeans', 'legging']);
});

test('telegram: só o chat privado do dono é obedecido; sem ID configurado, nem consulta o Telegram', async () => {
  const banco = new Banco(':memory:');
  const chamadas: string[] = [];
  const msg = (id: number, chat: number, tipo: string, text: string) => ({ update_id: id, message: { text, chat: { id: chat, type: tipo } } });
  const falso = (async (url: string, init?: RequestInit) => {
    chamadas.push(String(url).replace(/bot[^/]+/, 'bot'));
    const json = (o: unknown) => ({ ok: true, json: async () => o }) as Response;
    if (String(url).includes('getUpdates')) return json({ ok: true, result: [msg(10, 999, 'private', '/tema games'), msg(11, 123456, 'group', '/tema games'), msg(12, 123456, 'private', '/tema vestidos'), msg(13, 123456, 'private', 'oi')] });
    return json({ ok: true, init: init?.body });
  }) as unknown as typeof fetch;

  assert.equal(await lerComandosDoTelegram(banco, 'TOKEN', '', sexta, {}, falso), false, 'sem ID do dono: desligado');
  assert.equal(chamadas.length, 0, 'e nem fala com o Telegram');

  assert.equal(await lerComandosDoTelegram(banco, 'TOKEN', '123456', sexta, {}, falso), true);
  assert.equal(banco.ajustesDeComando().TEMA_DO_DIA, 'vestidos', 'só a mensagem do chat privado do dono valeu (não a de outro chat, nem a de grupo)');
  assert.equal(banco.ajustesDeComando().TELEGRAM_OFFSET, '14', 'as mensagens lidas não são lidas de novo');
  assert.equal(chamadas.filter((c) => c.includes('sendMessage')).length, 1, 'uma resposta, só para o comando do dono');
});

test('telegram: erro de rede ou resposta estranha nunca lança', async () => {
  const banco = new Banco(':memory:');
  assert.equal(await lerComandosDoTelegram(banco, 'T', '123456', sexta, {}, (async () => { throw new Error('sem rede'); }) as unknown as typeof fetch), false);
  assert.equal(await lerComandosDoTelegram(banco, 'T', '123456', sexta, {}, (async () => ({ ok: true, json: async () => ({ ok: false }) }) as Response) as unknown as typeof fetch), false);
});

test('menu: os botões levam do menu ao tema e à data, e mexem nos ajustes pelas mesmas regras dos comandos', async () => {
  const { respostaDeBotao, menuPrincipal } = await import('../src/comandos.ts');
  const banco = new Banco(':memory:');
  assert.ok(menuPrincipal().teclado.flat().every((b) => Buffer.byteLength(b.callback_data) <= 64), 'o Telegram só aceita 64 bytes por botão');
  const temas = respostaDeBotao('temas', banco, sexta);
  assert.ok(temas.teclado.flat().some((b) => b.callback_data === 't:vestidos'));
  assert.ok(respostaDeBotao('t:vestidos', banco, sexta).teclado.flat().some((b) => b.callback_data === 'd:vestidos:sexta'));
  assert.equal(respostaDeBotao('h:vestidos', banco, sexta).mudou, true);
  assert.equal(banco.ajustesDeComando().TEMA_DO_DIA, 'vestidos');
  assert.equal(respostaDeBotao('d:games:sexta', banco, sexta).mudou, true);
  assert.equal(banco.ajustesDeComando().TEMA_DO_DIA_SEMANA, 'sexta');
  assert.equal(respostaDeBotao('desligar', banco, sexta).mudou, true);
  assert.equal(temaDeHoje(aplicarComandos({}, banco), sexta), undefined);
  for (const lixo of ['', 'xx', 'h:', 'h:inexistente', 'd:vestidos:domingão', 't:../../etc', 'd::']) assert.doesNotThrow(() => respostaDeBotao(lixo, banco, sexta), lixo);
  assert.equal(respostaDeBotao('h:inexistente', banco, sexta).mudou, false);
});

test('menu: o toque num botão só vale vindo do chat privado do dono, e o menu azul é configurado uma vez', async () => {
  const banco = new Banco(':memory:');
  const chamadas: Array<{ metodo: string; corpo: any }> = [];
  const cb = (id: number, quem: number, chat: number, tipo: string, data: string) => ({ update_id: id, callback_query: { id: `c${id}`, data, from: { id: quem }, message: { message_id: 5, chat: { id: chat, type: tipo } } } });
  const falso = (async (url: string, init?: RequestInit) => {
    const metodo = String(url).split('/').pop()!.split('?')[0]!;
    chamadas.push({ metodo, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (metodo === 'getUpdates') return { ok: true, json: async () => ({ ok: true, result: [cb(1, 999, 999, 'private', 'h:vestidos'), cb(2, 123456, 123456, 'group', 'h:vestidos'), cb(3, 999, 123456, 'private', 'h:vestidos'), cb(4, 123456, 123456, 'private', 'h:games')] }) } as Response;
    return { ok: true, json: async () => ({ ok: true }) } as Response;
  }) as unknown as typeof fetch;
  assert.equal(await lerComandosDoTelegram(banco, 'TOKEN', '123456', sexta, {}, falso), true);
  assert.equal(banco.ajustesDeComando().TEMA_DO_DIA, 'games', 'só o toque do dono, no chat privado dele, valeu');
  assert.equal(chamadas.filter((c) => c.metodo === 'answerCallbackQuery').length, 4, 'todos os toques são respondidos (some o relógio do botão)');
  assert.equal(chamadas.filter((c) => c.metodo === 'editMessageText').length, 1, 'e só o do dono mexeu na mensagem');
  assert.equal(chamadas.filter((c) => c.metodo === 'setMyCommands').length, 1);
  chamadas.length = 0;
  await lerComandosDoTelegram(banco, 'TOKEN', '123456', sexta, {}, falso);
  assert.equal(chamadas.filter((c) => c.metodo === 'setMyCommands').length, 0, 'o menu azul não é refeito toda rodada');
});
