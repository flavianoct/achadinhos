import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { campanhaDeHoje, campanhasDoAno, diasEntre, fasesDevidas, grandesDeHoje, lembretesDoDono, lerDatas, pascoa, textoDaData, textoDosMelhores, todasAsCampanhas } from '../src/datas.ts';
import { Banco } from '../src/db.ts';
import { Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { svgDaDataEspecial } from '../src/moldes.ts';
import type { OfertaAvaliada } from '../src/types.ts';
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
  assert.deepEqual(fasesDevidas(dez, '2026-10-10', 21), ['comecou', 'melhores', 'ultimas'], 'data grande de um dia: abertura, lista e últimas horas');
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

const em = (data: string, hhmm: string) => new Date(`${data}T${hhmm}:00-03:00`);

test('datas grandes: as principais são grandes, as pequenas não, e a mais específica do dia ganha (10.10 e não a Semana das Crianças)', () => {
  const lista = todasAsCampanhas('2026-10-10');
  for (const id of ['dupla-10', 'dupla-11', 'dupla-12', 'dupla-9', 'consumidor', 'maes', 'pais', 'namorados', 'criancas', 'natal', 'blackfriday']) assert.equal(lista.find((c) => c.id === `${id}-2026`)?.grande, true, id);
  for (const id of ['dupla-1', 'dupla-3', 'dupla-8', 'mulher', 'cliente']) assert.notEqual(lista.find((c) => c.id === `${id}-2026`)?.grande, true, id);
  assert.deepEqual(grandesDeHoje(lista, '2026-10-10').map((c) => c.id).sort(), ['criancas-2026', 'dupla-10-2026']);
  assert.equal(campanhaDeHoje(lista, '2026-10-10')?.id, 'dupla-10-2026');
  assert.equal(campanhaDeHoje(lista, '2026-10-11')?.id, 'criancas-2026', 'depois do 10.10 fica a semana');
  assert.equal(campanhaDeHoje(lista, '2026-10-20'), undefined, 'sem data grande');
  assert.equal(campanhaDeHoje(lista, '2026-03-03'), undefined, 'o 3.3 é pequeno: sem Story');
  // O dono marca uma data como grande ou não.
  const ajustada = todasAsCampanhas('2026-10-10', [{ inicio: '2026-03-03', grande: true }, { inicio: '2026-10-10', grande: false }]);
  assert.equal(campanhaDeHoje(ajustada, '2026-03-03')?.id, 'dupla-3-2026');
  assert.equal(campanhaDeHoje(ajustada, '2026-10-10')?.id, 'criancas-2026');
  assert.equal(lerDatas(JSON.stringify([{ inicio: '2026-08-08', grande: true }])).datas[0]!.grande, true);
});

test('datas grandes: a lista dos melhores achados sai às 13h do primeiro dia, só nas datas grandes', () => {
  const dez = achar(2026, 'dupla-10');
  assert.deepEqual(fasesDevidas(dez, '2026-10-10', 12), ['comecou']);
  assert.deepEqual(fasesDevidas(dez, '2026-10-10', 14), ['comecou', 'melhores']);
  assert.deepEqual(fasesDevidas(achar(2026, 'dupla-3'), '2026-03-03', 14), ['comecou'], 'data pequena não tem a lista');
  assert.deepEqual(fasesDevidas(achar(2026, 'maes'), '2026-05-05', 14), [], 'só no primeiro dia');
});

const produto = (n: number, extra: Partial<OfertaAvaliada> = {}): OfertaAvaliada => ({
  loja: n % 2 ? 'shopee' : 'mercadolivre', idProduto: `P${n}`, titulo: `Produto Excelente Numero${n} Com Nome Bem Longo Para Testar O Corte Do Titulo Na Lista`, preco: 50 + n, link: `https://s.shopee.com.br/${n}`,
  imagem: `https://exemplo.com/foto-${n}.png`, nota: 4.8, vendas: 2000 + n * 1000, categoria: ['tech', 'casa', 'beleza', 'moda', 'esporte', 'pet'][n % 6]!, pontos: 100 - n, ...extra,
});

test('datas grandes: o texto da lista não leva preço, mostra só o que se sabe e corta título comprido', () => {
  const texto = textoDosMelhores(achar(2026, 'dupla-10'), [produto(1, { menorPrecoEmDias: 30 }), produto(2, { nota: undefined, vendas: undefined })]);
  assert.match(texto, /^🏆 Os 2 melhores achados de 10\.10\n/);
  assert.ok(texto.includes('1. Produto Excelente Numero1') && !texto.includes('Na Lista'), 'título curto');
  assert.ok(texto.includes('⭐ 4,8 · 3 mil vendidos · menor preço em 30 dias'));
  assert.ok(texto.includes('https://s.shopee.com.br/1') && texto.includes('https://s.shopee.com.br/2'));
  assert.doesNotMatch(texto, /R\$|\d+% |restam/);
  const semDados = texto.split('\n').filter((l) => l.includes('Numero2'))[0]!;
  assert.ok(semDados.startsWith('2. '));
  assert.ok(!texto.includes('⭐ undefined') && !texto.includes('NaN'));
});

function robo10(extra: Record<string, string> = {}) {
  const enviados: string[] = [];
  const f = (async (_u: string, init: any) => {
    enviados.push(JSON.parse(init.body).text);
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }) as unknown as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), 'datas2-'));
  const robo = new Robo({
    caminhoEnv: join(dir, '.env'), modeloEnv: '', caminhoBanco: ':memory:',
    envBase: { TELEGRAM_BOT_TOKEN: '1:abc', TELEGRAM_CHAT_ID: '@canal', BLOG_PASTA: dir, HORA_INICIO: '8', HORA_FIM: '23', DATAS_ARQUIVO: join(dir, 'sem.json'), PARECIDOS_HORAS: '0', ...extra },
    criarFontes: () => [], criarPublicador: (c) => new Telegram(c.telegram.token, c.telegram.chatId, f), silencioso: true,
  });
  return { robo, enviados, dir };
}

test('datas grandes: às 13h do 10.10 o robô posta a lista dos 5 melhores (uma vez só); sem produtos bons, espera', async () => {
  const { robo, enviados } = robo10();
  const dia = em('2026-10-10', '14:00');
  // Sem produtos bons: a abertura sai, a lista espera.
  assert.equal((await robo.postarDataEspecialAgora(dia)).postou, true);
  assert.match(enviados[0]!, /Hoje é 10\.10!/);
  const sem = await robo.postarDataEspecialAgora(new Date(dia.getTime() + 60_000));
  assert.deepEqual([sem.postou, sem.motivo], [false, 'poucos achados bons para a lista']);
  for (let i = 1; i <= 12; i++) robo.banco.guardarProduto(produto(i), new Date(dia.getTime() - i * 60_000));
  const lista = await robo.postarDataEspecialAgora(new Date(dia.getTime() + 120_000));
  assert.equal(lista.postou, true);
  assert.match(enviados[1]!, /^🏆 Os 5 melhores achados de 10\.10/);
  assert.equal(enviados[1]!.split('\n').filter((l) => /^\d\. /.test(l)).length, 5);
  assert.equal((await robo.postarDataEspecialAgora(new Date(dia.getTime() + 180_000))).postou, false, 'a lista sai uma vez só');
  assert.equal(enviados.length, 2);
  robo.fechar();
});

test('datas grandes: nas datas grandes o Telegram posta DATAS_POSTS_EXTRA a mais por rodada e o limite do dia sobe junto; o resto do ano, não', async () => {
  const { robo } = robo10({ MAX_POSTS_POR_DIA: '1' });
  assert.equal(robo.postsExtraDeHoje(em('2026-10-10', '12:00')), 2);
  assert.equal(robo.postsExtraDeHoje(em('2026-10-20', '12:00')), 0, 'dia comum');
  assert.equal(robo.postsExtraDeHoje(em('2026-03-03', '12:00')), 0, 'data pequena');
  for (let i = 1; i <= 3; i++) robo.banco.enfileirar({ ...produto(i), titulo: `Item${i} Distinto${i} Raro${i}`, categoria: 'casa' }, em('2026-10-10', '11:00'));
  assert.equal((await robo.postarAgora(em('2026-10-10', '12:00'))).postou, true);
  assert.equal((await robo.postarAgora(em('2026-10-10', '12:01'))).postou, true, 'em data grande o limite do dia sobe');
  // Dia comum: o limite de 1 segura.
  const comum = robo10({ MAX_POSTS_POR_DIA: '1' });
  for (let i = 1; i <= 3; i++) comum.robo.banco.enfileirar({ ...produto(i), titulo: `Item${i} Distinto${i} Raro${i}`, categoria: 'casa' }, em('2026-10-20', '11:00'));
  assert.equal((await comum.robo.postarAgora(em('2026-10-20', '12:00'))).postou, true);
  assert.deepEqual(await comum.robo.postarAgora(em('2026-10-20', '12:01')), { postou: false, motivo: 'limite diário' });
  // Desligado.
  assert.equal(robo10({ DATAS_POSTS_EXTRA: '0' }).robo.postsExtraDeHoje(em('2026-10-10', '12:00')), 0);
  robo.fechar();
  comum.robo.fechar();
});

test('datas grandes: a arte do Story da data é só a marca e texto: sem preço, sem foto, sem logo nem nome de loja', () => {
  for (const [nome, umDia] of [['10.10', true], ['Semana do Dia das Mães', false], ['Black Friday e Cyber Monday', false]] as const) {
    const svg = svgDaDataEspecial({ nome, umDia });
    assert.match(svg, /^<svg[^>]+width="1080" height="1920"/);
    assert.ok(svg.includes('MATA') && svg.includes('PREÇO') && svg.includes(nome.toUpperCase().split(' ')[0]!), nome);
    assert.ok(svg.includes(umDia ? 'HOJE É' : 'ESTÁ NO AR'));
    assert.ok(svg.includes('ENTRE NO GRUPO') && svg.includes('Publi · link de afiliado'));
    assert.doesNotMatch(svg, /R\$|<image|href=|data:image|Mercado ?Livre|Shopee|Amazon/i, 'nada de preço, foto, loja nem link');
  }
});

function apiFalsa() {
  const chamadas: Array<{ metodo: string; url: string; corpo: URLSearchParams }> = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    const metodo = init.method ?? 'GET';
    chamadas.push({ metodo, url: u, corpo: new URLSearchParams(init.body ? String(init.body) : u.split('?')[1] ?? '') });
    if (metodo === 'HEAD') return new Response(null, { status: 200 });
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'post-1' }));
    if (u.includes('/media')) return new Response(JSON.stringify({ id: 'cont-1' }));
    if (u.includes('cont-1')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    return new Response(JSON.stringify({ username: 'mataprecooficial' }));
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

test('datas grandes: o Instagram publica o Story da data uma vez por dia, a partir de INSTAGRAM_DATA_HORA, só em data grande', async () => {
  const config = lerConfig({ INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23', DATAS_ARQUIVO: join(mkdtempSync(join(tmpdir(), 'ig-')), 'sem.json'), INSTAGRAM_HORARIOS_STORIES: '' });
  const banco = new Banco(':memory:');
  const { f, chamadas } = apiFalsa();
  const api = new Instagram('tok', '1789', f, 0);
  const stories = () => chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/1789/media') && c.corpo.get('media_type') === 'STORIES');
  // 9h: ainda cedo. 12h: sai.
  await publicarNoInstagram(banco, config, em('2026-10-10', '09:00'), f, api);
  assert.equal(stories().length, 0);
  const r = await publicarNoInstagram(banco, config, em('2026-10-10', '12:00'), f, api);
  assert.equal(r.stories, 1);
  assert.equal(stories().length, 1);
  assert.match(stories()[0]!.corpo.get('image_url')!, /\/social\/data-dupla-10-2026-2026-10-10\.png$/);
  // Na rodada seguinte, o mesmo dia: não repete.
  await publicarNoInstagram(banco, config, em('2026-10-10', '12:30'), f, api);
  assert.equal(stories().length, 1, 'uma vez por data e dia');
  // Dia sem data grande: nenhum Story de data.
  await publicarNoInstagram(banco, config, em('2026-10-20', '12:00'), f, api);
  assert.equal(stories().length, 1);
  // Desligado por INSTAGRAM_DATA_HORA=0.
  const desligado = lerConfig({ INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '23', INSTAGRAM_DATA_HORA: '0', INSTAGRAM_HORARIOS_STORIES: '' });
  await publicarNoInstagram(new Banco(':memory:'), desligado, em('2026-11-11', '12:00'), f, api);
  assert.equal(stories().length, 1);
});
