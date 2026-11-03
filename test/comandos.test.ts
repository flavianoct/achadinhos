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
