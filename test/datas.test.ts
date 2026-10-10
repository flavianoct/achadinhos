import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { campanhasDoAno, diasEntre, fasesDevidas, lembretesDoDono, lerDatas, pascoa, textoDaData, todasAsCampanhas } from '../src/datas.ts';
import { Robo } from '../src/robo.ts';
import { Telegram } from '../src/telegram.ts';

const achar = (ano: number, id: string) => campanhasDoAno(ano).find((c) => c.id === `${id}-${ano}`)!;

test('datas: as datas que mudam de dia a cada ano saem certas (Páscoa, Mães, Pais, Black Friday)', () => {
  assert.equal(pascoa(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(pascoa(2027).toISOString().slice(0, 10), '2027-03-28');
  assert.equal(pascoa(2025).toISOString().slice(0, 10), '2025-04-20');
  assert.equal(achar(2026, 'maes').fim, '2026-05-10', 'Dia das Mães: 2º domingo de maio');
  assert.equal(achar(2026, 'maes').inicio, '2026-05-04', 'a semana que termina no dia');
  assert.equal(achar(2026, 'pais').fim, '2026-08-09', 'Dia dos Pais: 2º domingo de agosto');
  assert.equal(achar(2026, 'blackfriday').inicio, '2026-11-27', 'Black Friday: a sexta depois da 4ª quinta de novembro');
  assert.equal(achar(2026, 'blackfriday').fim, '2026-11-30', 'até a Cyber Monday');
  assert.equal(achar(2025, 'blackfriday').inicio, '2025-11-28');
  assert.equal(achar(2026, 'criancas').fim, '2026-10-12');
  assert.equal(achar(2026, 'natal').fim, '2026-12-25');
  assert.equal(achar(2026, 'pascoa').fim, '2026-04-05');
});

test('datas: todas as datas duplas, o Dia do Consumidor e as outras estão no calendário, em ordem', () => {
  const lista = campanhasDoAno(2026);
  for (let m = 1; m <= 12; m++) assert.ok(lista.some((c) => c.nome === `${m}.${m}` && c.inicio === `2026-${String(m).padStart(2, '0')}-${String(m).padStart(2, '0')}`), `${m}.${m}`);
  for (const nome of ['Dia da Mulher', 'Dia do Consumidor', 'Semana da Páscoa', 'Semana do Dia das Mães', 'Semana do Dia dos Namorados', 'Semana do Dia dos Pais', 'Dia do Cliente', 'Semana do Dia das Crianças', 'Black Friday e Cyber Monday', 'Semana do Natal']) assert.ok(lista.some((c) => c.nome === nome), nome);
  assert.deepEqual(lista.map((c) => c.inicio), [...lista.map((c) => c.inicio)].sort());
  assert.equal(new Set(lista.map((c) => c.id)).size, lista.length, 'ids únicos');
  for (const c of lista) assert.ok(c.fim >= c.inicio, c.nome);
});

test('datas: a véspera sai à noite, a abertura só no primeiro dia e as últimas horas só no último', () => {
  const dez = achar(2026, 'dupla-10');
  assert.deepEqual(fasesDevidas(dez, '2026-10-09', 17), [], 'véspera ainda cedo');
  assert.deepEqual(fasesDevidas(dez, '2026-10-09', 18), ['teaser']);
  assert.deepEqual(fasesDevidas(dez, '2026-10-10', 8), [], 'abertura só depois das 9h');
  assert.deepEqual(fasesDevidas(dez, '2026-10-10', 10), ['comecou']);
  assert.deepEqual(fasesDevidas(dez, '2026-10-10', 21), ['comecou', 'ultimas'], 'data de um dia: abertura e últimas horas');
  assert.deepEqual(fasesDevidas(dez, '2026-10-11', 10), [], 'passou');
  const maes = achar(2026, 'maes');
  assert.deepEqual(fasesDevidas(maes, '2026-05-06', 22), [], 'no meio da semana não há aviso');
  assert.deepEqual(fasesDevidas(maes, '2026-05-04', 10), ['comecou']);
  assert.deepEqual(fasesDevidas(maes, '2026-05-10', 21), ['ultimas']);
  assert.equal(diasEntre('2026-10-09', '2026-10-10'), 1);
});

test('datas: o texto não inventa preço nem estoque e só leva links que existem', () => {
  const dez = achar(2026, 'dupla-10');
  assert.match(textoDaData(dez, 'teaser', {}), /^🔥 Amanhã é 10\.10!/);
  assert.match(textoDaData(achar(2026, 'maes'), 'teaser', {}), /Semana do Dia das Mães começa amanhã!/);
  const aberto = textoDaData(dez, 'comecou', { mercadolivre: 'https://www.mercadolivre.com.br/ofertas?matt_word=a', shopee: 'https://s.shopee.com.br/x' });
  assert.match(aberto, /Hoje é 10\.10!/);
  assert.ok(aberto.includes('🛒 Mercado Livre: https://www.mercadolivre.com.br/ofertas') && aberto.includes('🛍️ Shopee: https://s.shopee.com.br/x'));
  assert.ok(!textoDaData(dez, 'comecou', {}).includes('http'), 'sem links, sem a chamada para as lojas');
  assert.ok(!textoDaData(dez, 'ultimas', { mercadolivre: 'https://www.mercadolivre.com.br/ofertas' }).includes('Shopee'), 'só o que existe');
  assert.match(textoDaData(dez, 'ultimas', {}), /^⏳ Últimas horas de 10\.10!/);
  for (const fase of ['teaser', 'comecou', 'ultimas'] as const) assert.doesNotMatch(textoDaData(dez, fase, {}), /R\$|\d+%|restam|últimas unidades/i);
});

test('datas: o datas.json do dono acrescenta ou ajusta datas, valida links e nunca derruba nada', () => {
  assert.deepEqual(lerDatas(''), { datas: [], avisos: [] });
  assert.match(lerDatas('{x').avisos[0]!, /não é um JSON válido/);
  assert.match(lerDatas('{}').avisos[0]!, /precisa ser uma lista/);
  const { datas, avisos } = lerDatas(JSON.stringify([
    { inicio: '2026-10-10', shopee: 'https://s.shopee.com.br/abc', mercadolivre: 'https://www.mercadolivre.com.br/c/promocao-10-10' },
    { nome: 'Aniversário da loja', inicio: '2026-11-20', fim: '2026-11-22', emoji: '🎂' },
    { inicio: '10/10/2026' },
    { inicio: '2026-12-01', shopee: 'https://golpe.com/x' },
    { inicio: '2026-12-02', fim: '2026-12-01' },
    { inicio: '2026-12-03', mercadolivre: 'http://www.mercadolivre.com.br/sem-https' },
  ]));
  assert.equal(datas.length, 2);
  assert.equal(avisos.length, 4, 'as 4 com problema viram aviso e são ignoradas');
  const todas = todasAsCampanhas('2026-10-09', datas);
  const dez = todas.find((c) => c.id === 'dupla-10-2026')!;
  assert.equal(dez.shopee, 'https://s.shopee.com.br/abc', 'ajusta a data que já existe');
  assert.equal(dez.mercadolivre, 'https://www.mercadolivre.com.br/c/promocao-10-10');
  const nova = todas.find((c) => c.inicio === '2026-11-20')!;
  assert.deepEqual([nova.nome, nova.emoji, nova.fim], ['Aniversário da loja', '🎂', '2026-11-22'], 'acrescenta a que não existe');
});

test('datas: o painel lembra o dono com dias de antecedência, só para datas que ainda não começaram', () => {
  const todas = todasAsCampanhas('2026-10-07');
  const l = lembretesDoDono(todas, '2026-10-07', 3);
  assert.ok(l.some((x) => x.texto.includes('10.10 começa em 3 dias')), 'a 10.10 está a 3 dias');
  assert.ok(l.every((x) => x.chave.startsWith('data:lembrete:')));
  assert.ok(lembretesDoDono(todas, '2026-10-09', 3).some((x) => x.texto.includes('10.10 começa amanhã')));
  assert.ok(!lembretesDoDono(todas, '2026-10-10', 3).some((x) => x.texto.includes('10.10 ')), 'no dia, já não é lembrete');
  assert.deepEqual(lembretesDoDono(todas, '2026-10-07', 0), [], 'desligado');
});

test('datas: o robô posta a véspera, a abertura e as últimas horas no Telegram, uma vez cada, e leva os lembretes para o painel', async () => {
  const enviados: string[] = [];
  const f = (async (_u: string, init: any) => {
    enviados.push(JSON.parse(init.body).text);
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }) as unknown as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), 'datas-'));
  const arquivo = join(dir, 'datas.json');
  writeFileSync(arquivo, JSON.stringify([{ inicio: '2026-10-10', shopee: 'https://s.shopee.com.br/abc' }]));
  const robo = new Robo({
    caminhoEnv: join(dir, '.env'), modeloEnv: '', caminhoBanco: ':memory:',
    envBase: { TELEGRAM_BOT_TOKEN: '1:abc', TELEGRAM_CHAT_ID: '@canal', BLOG_PASTA: dir, HORA_INICIO: '8', HORA_FIM: '23', DATAS_ARQUIVO: arquivo, ML_ATIVO: '1', ML_MATT_WORD: 'topfera', ML_MATT_TOOL: '123' },
    criarFontes: () => [], criarPublicador: (c) => new Telegram(c.telegram.token, c.telegram.chatId, f), silencioso: true,
  });
  const em = (data: string, hhmm: string) => new Date(`${data}T${hhmm}:00-03:00`);
  // Sete de outubro: nada a postar, mas o painel já lembra do 10.10.
  const cedo = await robo.postarDataEspecialAgora(em('2026-10-07', '12:00'));
  assert.equal(cedo.postou, false);
  assert.ok(cedo.avisos.some((a) => a.texto.includes('10.10 começa em 3 dias')));
  // Véspera às 17h: ainda não. Às 18h: sai.
  assert.equal((await robo.postarDataEspecialAgora(em('2026-10-09', '17:00'))).postou, false);
  assert.equal((await robo.postarDataEspecialAgora(em('2026-10-09', '18:10'))).postou, true);
  assert.equal((await robo.postarDataEspecialAgora(em('2026-10-09', '18:40'))).postou, false, 'a véspera sai uma vez só');
  assert.match(enviados[0]!, /^🔥 Amanhã é 10\.10!/);
  // No dia: abertura às 10h com os dois links; às 21h as últimas horas.
  assert.equal((await robo.postarDataEspecialAgora(em('2026-10-10', '10:05'))).postou, true);
  assert.match(enviados[1]!, /Hoje é 10\.10!/);
  assert.ok(enviados[1]!.includes('mercadolivre.com.br/ofertas') && enviados[1]!.includes('matt_word=topfera') && enviados[1]!.includes('https://s.shopee.com.br/abc'));
  assert.equal((await robo.postarDataEspecialAgora(em('2026-10-10', '10:35'))).postou, false);
  assert.equal((await robo.postarDataEspecialAgora(em('2026-10-10', '21:00'))).postou, true);
  assert.match(enviados[2]!, /Últimas horas de 10\.10!/);
  assert.equal(enviados.length, 3);
  // Fora do horário de postagem não posta; desligado também não.
  assert.equal((await robo.postarDataEspecialAgora(em('2026-11-10', '23:30'))).motivo, 'fora do horário');
  robo.fechar();
});

test('datas: DATAS_ATIVO=0 desliga e o padrão é ligado', () => {
  assert.equal(lerConfig({}).datas.ativo, true);
  assert.equal(lerConfig({ DATAS_ATIVO: '0' }).datas.ativo, false);
  assert.equal(lerConfig({}).datas.avisoDias, 3);
  assert.equal(lerConfig({ DATAS_ARQUIVO: 'x.json' }).datas.arquivo, 'x.json');
});
