import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avisosNoTelegram, textoDoResumo } from '../src/avisos-telegram.ts';
import { Banco } from '../src/db.ts';

const noite = new Date('2026-11-06T22:00:00-03:00');
const manha = new Date('2026-11-06T11:00:00-03:00');
const env = { TELEGRAM_COMANDOS_CHAT: '123456' };

function simulado() {
  const enviadas: string[] = [];
  const falso = (async (_url: string, init?: RequestInit) => {
    enviadas.push(JSON.parse(String(init?.body)).text);
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
  }) as unknown as typeof fetch;
  return { enviadas, falso };
}

test('resumo do dia: conta ofertas por loja, WhatsApp e Instagram de hoje', () => {
  const banco = new Banco(':memory:');
  banco.registrarMidiaDoInstagram('m1', 'reel', 'x', 'https://x', noite);
  banco.registrarMidiaDoInstagram('m2', 'feed', 'y', 'https://y', noite);
  const texto = textoDoResumo(banco, noite);
  assert.match(texto, /Resumo de hoje \(06\/11\)/);
  assert.match(texto, /Instagram: 1 Reels, 1 feed|Instagram: 1 feed, 1 Reels/);
  assert.match(texto, /Ofertas postadas: 0/);
});

test('avisos no Telegram: só ao dono, resumo só à noite, cada aviso uma vez por dia, só os importantes', async () => {
  const banco = new Banco(':memory:');
  const { enviadas, falso } = simulado();
  const avisos = [
    { chave: 'a', texto: 'Instagram: o Reel agendado "x" não saiu', nivel: 'aviso' as const },
    { chave: 'b', texto: 'Coleta lenta hoje', nivel: 'aviso' as const },
    { chave: 'c', texto: 'Falha grave na coleta', nivel: 'erro' as const },
  ];
  assert.equal(await avisosNoTelegram(banco, {}, 'TOKEN', avisos, undefined, noite, falso), 0, 'sem o ID do dono, não manda nada');
  assert.equal(await avisosNoTelegram(banco, { ...env, TELEGRAM_RESUMOS: '0' }, 'TOKEN', avisos, undefined, noite, falso), 0, 'TELEGRAM_RESUMOS=0 silencia');
  assert.equal(enviadas.length, 0);

  assert.equal(await avisosNoTelegram(banco, env, 'TOKEN', avisos, ['Instagram em números (últimos 7 dias, 3 posts):', '- reel (2): alcance médio 600'], manha, falso), 3, 'números + 2 alertas (o "Coleta lenta" não é importante); de manhã não há resumo');
  assert.ok(enviadas[0]!.startsWith('📈 Instagram em números'));
  assert.ok(enviadas.some((t) => t.startsWith('⚠️') && /agendado/.test(t)) && enviadas.some((t) => t.startsWith('🚨')));
  assert.ok(!enviadas.some((t) => /Coleta lenta/.test(t)));

  assert.equal(await avisosNoTelegram(banco, env, 'TOKEN', avisos, undefined, manha, falso), 0, 'repetir a rodada não repete os avisos do dia');
  assert.equal(await avisosNoTelegram(banco, env, 'TOKEN', avisos, undefined, noite, falso), 1, 'à noite entra só o resumo do dia');
  assert.ok(enviadas.at(-1)!.startsWith('📊 Resumo de hoje'));
  assert.equal(await avisosNoTelegram(banco, env, 'TOKEN', avisos, undefined, noite, falso), 0, 'e o resumo é uma vez por dia');
});

test('avisos no Telegram: Telegram fora do ar não lança e tenta de novo na próxima rodada', async () => {
  const banco = new Banco(':memory:');
  const avisos = [{ chave: 'c', texto: 'Falha grave', nivel: 'erro' as const }];
  const fora = (async () => { throw new Error('sem rede'); }) as unknown as typeof fetch;
  assert.equal(await avisosNoTelegram(banco, env, 'TOKEN', avisos, undefined, manha, fora), 0);
  const { enviadas, falso } = simulado();
  assert.equal(await avisosNoTelegram(banco, env, 'TOKEN', avisos, undefined, manha, falso), 1, 'na rodada seguinte o aviso ainda não tinha sido marcado como enviado');
  assert.equal(enviadas.length, 1);
});

test('prévia das campanhas da Shopee: só liga com CAMPANHAS_PREVIA=1, só para o dono, uma vez por dia, só as vigentes', async () => {
  const { previaDeCampanhas } = await import('../src/avisos-telegram.ts');
  const banco = new Banco(':memory:');
  const { enviadas, falso } = simulado();
  const futuro = Math.floor(Date.parse('2026-11-20T00:00:00-03:00') / 1000);
  const passado = Math.floor(Date.parse('2026-10-01T00:00:00-03:00') / 1000);
  const buscar = async () => [{ nome: 'Black Friday Shopee', link: 'https://s.shopee.com.br/abc', fim: futuro }, { nome: 'Campanha velha', link: 'https://s.shopee.com.br/old', fim: passado }];
  assert.equal(await previaDeCampanhas(banco, env, 'TOKEN', buscar, manha, falso), 0, 'sem CAMPANHAS_PREVIA=1 não manda');
  assert.equal(await previaDeCampanhas(banco, { ...env, CAMPANHAS_PREVIA: '1' }, 'TOKEN', buscar, manha, falso), 1);
  assert.match(enviadas[0]!, /Black Friday Shopee \(até 20\/11\)\nhttps:\/\/s\.shopee\.com\.br\/abc/);
  assert.doesNotMatch(enviadas[0]!, /Campanha velha/, 'campanha vencida não entra');
  assert.equal(await previaDeCampanhas(banco, { ...env, CAMPANHAS_PREVIA: '1' }, 'TOKEN', buscar, manha, falso), 0, 'uma vez por dia');
  assert.equal(await previaDeCampanhas(new Banco(':memory:'), { CAMPANHAS_PREVIA: '1' }, 'TOKEN', buscar, manha, falso), 0, 'sem o ID do dono não manda');
  assert.equal(await previaDeCampanhas(new Banco(':memory:'), { ...env, CAMPANHAS_PREVIA: '1' }, 'TOKEN', async () => { throw new Error('API fora'); }, manha, falso), 0, 'erro da API não lança');
});
