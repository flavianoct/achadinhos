import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categorizar } from '../src/categoria.ts';
import { lerConfig, problemasDeConfig, type Config } from '../src/config.ts';
import { Banco, diaDe, horaDe } from '../src/db.ts';
import { chaveDoAviso } from '../src/alertas.ts';
import { avaliar } from '../src/filtro.ts';
import { formatarPreco, formatarVendas, montarMensagem } from '../src/mensagem.ts';
import { coletar, postarProxima } from '../src/pipeline.ts';
import { ErroTelegram, Telegram, type Publicador } from '../src/telegram.ts';
import type { Fonte, Oferta, OfertaAvaliada } from '../src/types.ts';

// Os testes de fila usam o mesmo título em ofertas diferentes; a trava de produto parecido tem teste próprio (parecidos.test.ts).
const config: Config = lerConfig({ PARECIDOS_HORAS: '0' });
// 3 de outubro de 2026, 15h em Brasília.
const AGORA = new Date('2026-10-03T18:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

function oferta(extra: Partial<Oferta> = {}): Oferta {
  return { loja: 'shopee', idProduto: 'P1', titulo: 'Fone Bluetooth', preco: 100, desconto: 40, link: 'https://s/x', nota: 4.8, vendas: 500, ...extra };
}

function motivo(o: Oferta, banco = new Banco(':memory:')): string {
  const r = avaliar(o, banco, config, AGORA);
  return r.aprovada ? 'APROVADA' : r.motivo;
}

// ───────────── datas ─────────────

test('datas: dia e hora seguem o horário de Brasília', () => {
  assert.equal(diaDe(new Date('2026-10-03T02:30:00Z')), '2026-10-02'); // 23h30 do dia 2 em Brasília
  assert.equal(horaDe(new Date('2026-10-03T02:30:00Z')), 23);
  assert.equal(horaDe(new Date('2026-10-03T03:00:00Z')), 0);
});

// ───────────── categoria ─────────────

test('categoria: casa por palavra inteira, sem acento, com plural', () => {
  assert.equal(categorizar('Tapete Sala Peludo 2x1,5m'), 'geral'); // não pode virar "pet"
  assert.equal(categorizar('Ração para Cães Adultos 15kg'), 'pet');
  assert.equal(categorizar('Kit 3 Camisetas Básicas'), 'moda');
  assert.equal(categorizar('Smart TV 50" 4K'), 'tech');
  assert.equal(categorizar('Controle Xbox Series'), 'games');
  assert.equal(categorizar('Sobremesa em pó'), 'geral'); // não pode virar "mesa"
});

// ───────────── filtro ─────────────

test('filtro: motivos de reprovação', () => {
  assert.equal(motivo(oferta()), 'APROVADA');
  assert.equal(motivo(oferta({ preco: 9 })), 'preço abaixo do mínimo');
  assert.equal(motivo(oferta({ preco: 9000 })), 'preço acima do máximo');
  assert.equal(motivo(oferta({ preco: Number.NaN })), 'preço inválido');
  assert.equal(motivo(oferta({ link: '' })), 'dados incompletos');
  assert.equal(motivo(oferta({ titulo: 'Relógio RÉPLICA de luxo' })), 'palavra bloqueada: réplica');
  assert.equal(motivo(oferta({ titulo: 'Celular usado' })), 'palavra bloqueada: usado');
  assert.equal(motivo(oferta({ nota: 4.2 })), 'nota baixa');
  assert.equal(motivo(oferta({ vendas: 3 })), 'poucas vendas');
  assert.equal(motivo(oferta({ desconto: 10 })), 'desconto insuficiente');
  // Loja que não informa nota nem vendas (Mercado Livre) não é punida por isso.
  assert.equal(motivo(oferta({ nota: undefined, vendas: undefined })), 'APROVADA');
  // Desconto calculado a partir do preço "de".
  assert.equal(motivo(oferta({ desconto: undefined, precoOriginal: 200 })), 'APROVADA');
  assert.equal(motivo(oferta({ desconto: undefined, precoOriginal: 105 })), 'desconto insuficiente');
});

test('filtro: barra promoção falsa usando o histórico de preços', () => {
  const banco = new Banco(':memory:');
  for (const d of [5, 4, 3]) banco.registrarPreco(oferta({ preco: 80 }), dias(d));
  // Anuncia 40% de desconto, mas custava 80 há poucos dias.
  assert.equal(motivo(oferta({ preco: 100 }), banco), 'já esteve mais barato recentemente');
  // No mesmo preço de antes, com desconto anunciado: passa e ganha o selo de menor preço.
  const r = avaliar(oferta({ preco: 80 }), banco, config, AGORA);
  assert.ok(r.aprovada);
  assert.equal(r.oferta.menorPrecoEmDias, 5);
});

test('filtro: queda real de preço aprova mesmo sem desconto anunciado', () => {
  const banco = new Banco(':memory:');
  for (const d of [6, 4, 2]) banco.registrarPreco(oferta({ preco: 100 }), dias(d));
  const r = avaliar(oferta({ preco: 85, desconto: 0 }), banco, config, AGORA);
  assert.ok(r.aprovada);
  assert.equal(r.oferta.quedaHistorica, 15);
  assert.equal(motivo(oferta({ preco: 95, desconto: 0 }), banco), 'desconto insuficiente'); // caiu só 5%
});

test('filtro: histórico curto (menos de 3 dias) não reprova', () => {
  const banco = new Banco(':memory:');
  banco.registrarPreco(oferta({ preco: 80 }), dias(1));
  assert.equal(motivo(oferta({ preco: 100 }), banco), 'APROVADA');
});

test('filtro: o preço "de" é confirmado, não confirmado ou inflado conforme o histórico do próprio robô', () => {
  const aprovada = (banco: Banco, extra: Partial<Oferta>) => {
    const r = avaliar(oferta({ precoOriginal: 200, preco: 100, desconto: undefined, ...extra }), banco, config, AGORA);
    assert.ok(r.aprovada, r.aprovada ? '' : r.motivo);
    return r.oferta.precoDe;
  };
  // Sem histórico: não dá para confirmar (nem acusar).
  assert.equal(aprovada(new Banco(':memory:'), {}), 'nao-confirmado');
  // O produto já custou perto do "de" (190 de um "de" de 200): confirmado.
  const confirmado = new Banco(':memory:');
  for (const d of [5, 4, 3]) confirmado.registrarPreco(oferta({ preco: 190 }), dias(d));
  assert.equal(aprovada(confirmado, {}), 'confirmado');
  // 14 dias seguidos custando 100 e anunciando "de 200": inflado.
  const inflado = new Banco(':memory:');
  for (let d = 1; d <= 15; d++) inflado.registrarPreco(oferta({ preco: 100 }), dias(d));
  assert.equal(aprovada(inflado, {}), 'inflado');
  // Uma semana só no mesmo preço baixo é promoção legítima: não acusa.
  const semana = new Banco(':memory:');
  for (let d = 1; d <= 7; d++) semana.registrarPreco(oferta({ preco: 100 }), dias(d));
  assert.equal(aprovada(semana, {}), 'nao-confirmado');
  // Sem preço "de", não há o que verificar.
  const r = avaliar(oferta({ desconto: 40 }), new Banco(':memory:'), config, AGORA);
  assert.ok(r.aprovada && r.oferta.precoDe === undefined);
});

test('filtro: não repete produto, a não ser que o preço caia de novo', () => {
  const banco = new Banco(':memory:');
  const aprovada = avaliar(oferta(), banco, config, AGORA);
  assert.ok(aprovada.aprovada);
  banco.registrarPost(aprovada.oferta, dias(2));
  assert.equal(motivo(oferta(), banco), 'já postada recentemente');
  assert.equal(motivo(oferta({ preco: 94 }), banco), 'APROVADA'); // caiu mais de 5%
  const banco2 = new Banco(':memory:');
  banco2.registrarPost(aprovada.oferta, dias(8));
  assert.equal(motivo(oferta(), banco2), 'APROVADA'); // passou o prazo
});

// ───────────── banco ─────────────

test('banco: guarda o menor preço do dia e a fila sai por pontuação', () => {
  const banco = new Banco(':memory:');
  banco.registrarPreco(oferta({ preco: 100 }), dias(2));
  banco.registrarPreco(oferta({ preco: 90 }), dias(2));
  banco.registrarPreco(oferta({ preco: 120 }), dias(2));
  banco.registrarPreco(oferta({ preco: 50 }), AGORA); // hoje não conta no histórico
  assert.deepEqual(banco.historico('shopee', 'P1', 30, AGORA), { menor: 90, maior: 90, diasComDado: 1, desde: diaDe(dias(2)) });

  const av = (id: string, pontos: number): OfertaAvaliada => ({ ...oferta({ idProduto: id }), categoria: 'tech', pontos });
  banco.enfileirar(av('A', 10), dias(1));
  banco.enfileirar(av('B', 50), AGORA);
  banco.enfileirar(av('C', 30), AGORA);
  banco.enfileirar(av('C', 60), AGORA); // mesma oferta atualizada: não duplica
  assert.equal(banco.tamanhoDaFila(), 3);
  assert.equal(banco.melhorDaFila()?.idProduto, 'C');
  assert.equal(banco.limparFilaAntiga(6, AGORA), 1); // "A" entrou ontem
  assert.equal(banco.tamanhoDaFila(), 2);
});

// ───────────── mensagem ─────────────

test('mensagem: formatação, escape de HTML e limite do Telegram', () => {
  assert.equal(formatarPreco(1234.5), 'R$ 1.234,50');
  assert.equal(formatarVendas(999), '999');
  assert.equal(formatarVendas(1000), '1 mil');
  assert.equal(formatarVendas(12400), '12,4 mil');

  const o: OfertaAvaliada = { ...oferta({ titulo: 'Fone <b>R&B</b> 2 > 1', precoOriginal: 199.9, preco: 89.9, desconto: 55, freteGratis: true, link: 'https://x/?a=1&b=2' }), categoria: 'tech', pontos: 1, menorPrecoEmDias: 12 };
  const m = montarMensagem(o);
  assert.ok(m.includes('<b>Fone &lt;b&gt;R&amp;B&lt;/b&gt; 2 &gt; 1</b>'));
  assert.ok(m.includes('<s>De R$ 199,90</s>'));
  assert.ok(m.includes('<b>Por R$ 89,90</b> (-55%)'));
  assert.ok(m.includes('Menor preço em 12 dias'));
  assert.ok(m.includes('Frete grátis'));
  assert.ok(m.includes('https://x/?a=1&amp;b=2'));
  assert.ok(!m.includes('#'), 'sem hashtag no Telegram');

  const longa = montarMensagem({ ...o, titulo: 'x'.repeat(900), link: `https://x/${'y'.repeat(300)}` });
  assert.ok(longa.length <= 1024, `legenda com ${longa.length} caracteres`);
  // Sem preço "de": não inventa um.
  assert.ok(!montarMensagem({ ...o, precoOriginal: undefined }).includes('De R$'));
});

// ───────────── pipeline ─────────────

class PublicadorFalso implements Publicador {
  enviados: string[] = [];
  falha?: Error;
  async publicar(o: OfertaAvaliada): Promise<void> {
    if (this.falha) throw this.falha;
    this.enviados.push(o.idProduto);
  }
}

const fonteFixa = (ofertas: Oferta[]): Fonte => ({ nome: 'shopee', coletar: async () => ofertas });

test('pipeline: uma loja com erro não derruba as outras; preço reprovado também entra no histórico', async () => {
  const banco = new Banco(':memory:');
  const quebrada: Fonte = { nome: 'mercadolivre', coletar: async () => { throw new Error('fora do ar'); } };
  const r = await coletar([quebrada, fonteFixa([oferta(), oferta({ idProduto: 'P2', desconto: 5 })])], banco, config, dias(1));
  assert.equal(r.coletadas, 2);
  assert.equal(r.aprovadas, 1);
  assert.deepEqual(r.reprovadasPorMotivo, { 'desconto insuficiente': 1 });
  assert.deepEqual(r.errosPorFonte, { mercadolivre: 'fora do ar' });
  assert.equal(banco.historico('shopee', 'P2', 30, AGORA).menor, 100);
});

test('pipeline: loja que falha ou volta vazia vira alerta depois de coletas seguidas, e uma coleta boa zera a contagem', async () => {
  const banco = new Banco(':memory:');
  let estado: 'erro' | 'vazia' | 'ok' = 'erro';
  const ml: Fonte = {
    nome: 'mercadolivre',
    coletar: async () => {
      if (estado === 'erro') throw new Error('site mudou');
      return estado === 'vazia' ? [] : [oferta({ loja: 'mercadolivre', idProduto: 'M1' })];
    },
  };
  await coletar([ml], banco, config, dias(1));
  await coletar([ml], banco, config, dias(1));
  assert.deepEqual(banco.fontesComFalhas(3), [], 'duas falhas ainda não alertam');
  estado = 'vazia';
  await coletar([ml], banco, config, dias(1));
  const alerta = banco.fontesComFalhas(3);
  assert.equal(alerta.length, 1);
  assert.equal(alerta[0].falhas, 3, 'retorno vazio conta como falha');
  assert.match(alerta[0].erro, /sem nenhuma oferta/);
  estado = 'ok';
  await coletar([ml], banco, config, dias(1));
  assert.deepEqual(banco.fontesComFalhas(1), [], 'coleta boa zera a contagem');
});

test('pipeline: posta em ordem de pontuação, não repete e respeita horário e limite diário', async () => {
  const banco = new Banco(':memory:');
  await coletar([fonteFixa([oferta({ idProduto: 'FRACA', desconto: 30 }), oferta({ idProduto: 'FORTE', desconto: 80 })])], banco, config, AGORA);
  const pub = new PublicadorFalso();

  const madrugada = new Date('2026-10-03T06:00:00Z'); // 3h em Brasília
  assert.deepEqual(await postarProxima(pub, banco, config, madrugada), { postou: false, motivo: 'fora do horário' });

  assert.equal((await postarProxima(pub, banco, config, AGORA)).postou, true);
  assert.equal((await postarProxima(pub, banco, config, AGORA)).postou, true);
  assert.deepEqual(pub.enviados, ['FORTE', 'FRACA']);
  assert.deepEqual(await postarProxima(pub, banco, config, AGORA), { postou: false, motivo: 'fila vazia' });

  // Nova coleta com os mesmos produtos: nada volta para a fila.
  const r = await coletar([fonteFixa([oferta({ idProduto: 'FORTE', desconto: 80 })])], banco, config, AGORA);
  assert.deepEqual(r.reprovadasPorMotivo, { 'já postada recentemente': 1 });

  const limitado: Config = { ...config, ritmo: { ...config.ritmo, maxPostsPorDia: 2 } };
  assert.deepEqual(await postarProxima(pub, banco, limitado, AGORA), { postou: false, motivo: 'limite diário' });
});

test('pipeline: erro definitivo tira da fila; erro de rede mantém para tentar depois', async () => {
  const banco = new Banco(':memory:');
  await coletar([fonteFixa([oferta()])], banco, config, AGORA);
  const pub = new PublicadorFalso();

  pub.falha = new ErroTelegram('sem rede', false);
  assert.equal((await postarProxima(pub, banco, config, AGORA)).postou, false);
  assert.equal(banco.tamanhoDaFila(), 1);
  assert.equal(banco.postsNoDia(AGORA), 0);

  pub.falha = new ErroTelegram('post inválido', true);
  const r = await postarProxima(pub, banco, config, AGORA);
  assert.deepEqual(r, { postou: false, motivo: 'erro', detalhe: 'post inválido' });
  assert.equal(banco.tamanhoDaFila(), 0);
});

// ───────────── telegram ─────────────

test('telegram: envia foto com botão; se a foto for recusada, envia só texto', async () => {
  const chamadas: Array<{ metodo: string; corpo: any }> = [];
  const fetchFalso = (async (url: any, init: any) => {
    const metodo = String(url).split('/').pop()!;
    chamadas.push({ metodo, corpo: JSON.parse(init.body) });
    if (metodo === 'sendPhoto') return new Response(JSON.stringify({ ok: false, description: 'wrong file identifier' }), { status: 400 });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;

  const o: OfertaAvaliada = { ...oferta({ imagem: 'https://img/x.jpg' }), categoria: 'tech', pontos: 1 };
  await new Telegram('TOKEN', '@canal', fetchFalso).publicar(o);

  assert.deepEqual(chamadas.map((c) => c.metodo), ['sendPhoto', 'sendMessage']);
  assert.equal(chamadas[0].corpo.chat_id, '@canal');
  assert.equal(chamadas[0].corpo.photo, 'https://img/x.jpg');
  assert.equal(chamadas[0].corpo.parse_mode, 'HTML');
  assert.equal(chamadas[1].corpo.reply_markup.inline_keyboard[0][0].url, 'https://s/x');
});

test('telegram: falha de rede não é erro definitivo; 403 é', async () => {
  const o: OfertaAvaliada = { ...oferta(), categoria: 'tech', pontos: 1 };
  const semRede = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  await assert.rejects(new Telegram('T', '@c', semRede).publicar(o), (e: any) => e instanceof ErroTelegram && e.permanente === false);

  const proibido = (async () => new Response(JSON.stringify({ ok: false, description: 'bot is not a member' }), { status: 403 })) as typeof fetch;
  await assert.rejects(new Telegram('T', '@c', proibido).publicar(o), (e: any) => e instanceof ErroTelegram && e.permanente === true && /bot is not a member/.test(e.message));
});

// ───────────── config ─────────────

test('config: lê valores, aceita vírgula decimal e aponta o que falta', () => {
  const c = lerConfig({ NOTA_MINIMA: '4,7', SHOPEE_PALAVRAS: 'fone, air fryer ,', ML_ATIVO: 'sim', HORA_INICIO: '9' });
  assert.equal(c.filtro.notaMinima, 4.7);
  assert.deepEqual(c.shopee.palavras, ['fone', 'air fryer']);
  assert.equal(c.ml.ativo, true);
  assert.equal(c.ritmo.horaInicio, 9);
  assert.throws(() => lerConfig({ DESCONTO_MINIMO: 'abc' }), /DESCONTO_MINIMO/);

  const faltas = problemasDeConfig(c).join('\n');
  assert.match(faltas, /TELEGRAM_BOT_TOKEN/);
  assert.match(faltas, /SHOPEE_APP_ID/);
  assert.match(faltas, /ML_MATT_WORD/);

  const completo = lerConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '@c', SHOPEE_APP_ID: 'a', SHOPEE_SECRET: 's' });
  assert.deepEqual(problemasDeConfig(completo), []);
});

test('fila: as lojas se alternam em vez de a de maior pontuação ocupar tudo', async () => {
  const banco = new Banco(':memory:');
  const av = (loja: 'shopee' | 'mercadolivre', id: string, pontos: number): OfertaAvaliada => ({ ...oferta({ idProduto: id }), loja, categoria: 'tech', pontos });
  // A Shopee tem pontuação bem maior (desconto e vendas altos): sem alternar, ela postaria todas antes do Mercado Livre.
  for (let i = 1; i <= 4; i++) banco.enfileirar(av('shopee', `S${i}`, 100 - i), AGORA);
  for (let i = 1; i <= 4; i++) banco.enfileirar(av('mercadolivre', `M${i}`, 40 - i), AGORA);
  const publicados: string[] = [];
  const publicador: Publicador = { publicar: async (o) => void publicados.push(o.idProduto) } as Publicador;
  for (let i = 0; i < 6; i++) await postarProxima(publicador, banco, config, new Date(AGORA.getTime() + i * 60_000));
  assert.deepEqual(publicados, ['S1', 'M1', 'S2', 'M2', 'S3', 'M3'], 'uma de cada, sempre a melhor da loja da vez');

  // Se só sobrar uma loja na fila, ela continua postando normalmente.
  const so = new Banco(':memory:');
  for (let i = 1; i <= 3; i++) so.enfileirar(av('shopee', `X${i}`, 50 - i), AGORA);
  const lista: string[] = [];
  const pub2: Publicador = { publicar: async (o) => void lista.push(o.idProduto) } as Publicador;
  for (let i = 0; i < 3; i++) await postarProxima(pub2, so, config, new Date(AGORA.getTime() + i * 60_000));
  assert.deepEqual(lista, ['X1', 'X2', 'X3']);
});
test('avisos do robô: guardam desde quando existem, contam repetições, resolvem sozinhos e reabrem do zero', () => {
  const banco = new Banco(':memory:');
  const H = 3_600_000;
  const t0 = new Date('2026-10-08T12:00:00Z');
  const aviso = { chave: 'coleta:shopee', texto: 'A coleta da Shopee falhou 3 vezes seguidas.', nivel: 'erro' };

  banco.registrarAvisos([aviso], t0);
  banco.registrarAvisos([aviso], new Date(t0.getTime() + 0.5 * H));
  banco.registrarAvisos([{ ...aviso, texto: 'A coleta da Shopee falhou 4 vezes seguidas.' }], new Date(t0.getTime() + 1 * H));
  let lista = banco.avisosDoRobo(new Date(t0.getTime() + 1 * H));
  assert.equal(lista.length, 1);
  assert.deepEqual({ ativo: lista[0]!.ativo, vezes: lista[0]!.vezes, desde: lista[0]!.desde, texto: lista[0]!.texto }, { ativo: true, vezes: 3, desde: t0.getTime(), texto: 'A coleta da Shopee falhou 4 vezes seguidas.' }, 'mantém o "desde" e o texto mais novo');

  // Sem aparecer por mais de 3 horas, vira resolvido (mas continua no histórico).
  lista = banco.avisosDoRobo(new Date(t0.getTime() + 5 * H));
  assert.equal(lista[0]!.ativo, false);

  // Voltou depois de resolvido: começa de novo.
  const volta = new Date(t0.getTime() + 6 * H);
  banco.registrarAvisos([aviso], volta);
  lista = banco.avisosDoRobo(volta);
  assert.deepEqual({ ativo: lista[0]!.ativo, vezes: lista[0]!.vezes, desde: lista[0]!.desde }, { ativo: true, vezes: 1, desde: volta.getTime() });

  // Ativos primeiro, erros antes de avisos; o que é muito velho some.
  banco.registrarAvisos([{ chave: 'blog:ia', texto: 'IA indisponível', nivel: 'aviso' }], volta);
  assert.deepEqual(banco.avisosDoRobo(volta).map((a) => a.chave), ['coleta:shopee', 'blog:ia']);
  banco.registrarAvisos([], new Date(volta.getTime() + 8 * 86_400_000));
  assert.equal(banco.avisosDoRobo(new Date(volta.getTime() + 8 * 86_400_000)).length, 0, 'depois de 7 dias sem aparecer, apaga');
});

test('avisos do robô: a chave ignora números, para o mesmo problema não virar um aviso novo a cada rodada', () => {
  assert.equal(chaveDoAviso('instagram', 'Instagram: 15 imagens ainda não estão no ar; saem na próxima rodada.'), chaveDoAviso('instagram', 'Instagram: 9 imagens ainda não estão no ar; saem na próxima rodada.'));
  assert.notEqual(chaveDoAviso('instagram', 'O token venceu'), chaveDoAviso('instagram', 'Imagens não estão no ar'));
  assert.ok(chaveDoAviso('blog', 'Texto muito '.repeat(40)).length <= 'blog:'.length + 48);
});
// ───────────── qualidade da promoção ─────────────

test('qualidade: o desconto vale pela prova que temos do preço "de" (confirmado > sem prova > inflado)', () => {
  const base = { precoOriginal: 200, preco: 100, desconto: undefined as number | undefined };
  const semProva = avaliar(oferta(base), new Banco(':memory:'), config, AGORA);
  assert.ok(semProva.aprovada);
  assert.equal(semProva.oferta.precoDe, 'nao-confirmado');

  // 15 dias a R$ 100 e um "de" de R$ 200 que o produto nunca custou: promoção inflada.
  const inflado = new Banco(':memory:');
  for (let d = 1; d <= 15; d++) inflado.registrarPreco(oferta({ preco: 100 }), dias(d));
  const rInflado = avaliar(oferta(base), inflado, config, AGORA);
  assert.ok(rInflado.aprovada);
  assert.equal(rInflado.oferta.precoDe, 'inflado');
  assert.ok(rInflado.oferta.pontos < semProva.oferta.pontos - 15, `inflado ${rInflado.oferta.pontos} contra sem prova ${semProva.oferta.pontos}`);

  // O produto custava perto do "de" e caiu de verdade: confirmado, com queda histórica.
  const confirmado = new Banco(':memory:');
  for (const d of [6, 5, 4]) confirmado.registrarPreco(oferta({ preco: 195 }), dias(d));
  const rConfirmado = avaliar(oferta(base), confirmado, config, AGORA);
  assert.ok(rConfirmado.aprovada);
  assert.equal(rConfirmado.oferta.precoDe, 'confirmado');
  assert.ok(rConfirmado.oferta.pontos > semProva.oferta.pontos + 10, `confirmado ${rConfirmado.oferta.pontos} contra sem prova ${semProva.oferta.pontos}`);
});

test('qualidade: quem está no menor preço há mais tempo ganha mais (e o bônus tem teto)', () => {
  const comRecorde = (diasDeRecorde: number) => {
    const b = new Banco(':memory:');
    // O produto custava R$ 100 antes e fica a R$ 80 desde há `diasDeRecorde` dias; hoje continua a R$ 80.
    b.registrarPreco(oferta({ preco: 100 }), dias(diasDeRecorde + 1));
    for (let d = diasDeRecorde; d >= 1; d--) b.registrarPreco(oferta({ preco: 80 }), dias(d));
    return avaliar(oferta({ preco: 80, desconto: 40 }), b, config, AGORA);
  };
  const curto = comRecorde(4);
  const longo = comRecorde(20);
  assert.ok(curto.aprovada && longo.aprovada);
  assert.ok(longo.oferta.pontos > curto.oferta.pontos + 4, `20 dias ${longo.oferta.pontos} contra 4 dias ${curto.oferta.pontos}`);
  const enorme = comRecorde(28);
  assert.ok(enorme.aprovada);
  assert.ok(enorme.oferta.pontos - longo.oferta.pontos <= 12 - 0.01 + 1, 'o bônus de menor preço tem teto');
});

test('qualidade: PONTOS_MINIMOS barra a oferta fraca da fila, que continua no blog', async () => {
  const fraca = oferta({ idProduto: 'FRACA', desconto: 26, nota: 4.5, vendas: 60 });
  const forte = oferta({ idProduto: 'FORTE', desconto: 55, nota: 4.9, vendas: 5000, freteGratis: true });
  const pontosDe = (o: Oferta) => {
    const r = avaliar(o, new Banco(':memory:'), config, AGORA);
    assert.ok(r.aprovada);
    return r.oferta.pontos;
  };
  assert.ok(pontosDe(forte) > pontosDe(fraca) + 20);
  const corte = Math.round((pontosDe(forte) + pontosDe(fraca)) / 2);

  // Sem corte (o padrão), as duas entram na fila.
  const livre = new Banco(':memory:');
  await coletar([fonteFixa([fraca, forte])], livre, config, dias(1));
  assert.equal(livre.tamanhoDaFila(), 2);

  // Com corte, só a forte entra; a fraca é contada e continua como produto, para o blog e os guias.
  const exigente = new Banco(':memory:');
  const r = await coletar([fonteFixa([fraca, forte])], exigente, lerConfig({ PARECIDOS_HORAS: '0', PONTOS_MINIMOS: String(corte), FILA_MINIMA: '0' }), dias(1));
  assert.equal(exigente.tamanhoDaFila(), 1);
  assert.equal(r.aprovadas, 1);
  assert.equal(r.reprovadasPorMotivo['pontuação abaixo do mínimo'], 1);
  assert.equal(exigente.melhoresProdutos({ horas: 48, limite: 10 }, dias(1)).length, 2, 'a fraca continua no blog');
});

test('equilíbrio: com a fila curta, as melhores das fracas entram (o corte nunca para o robô)', async () => {
  const f = (id: string, desconto: number) => oferta({ idProduto: id, desconto, nota: 4.6, vendas: 80 });
  const ofertas = [f('A', 26), f('B', 30), f('C', 28), f('D', 27)];
  const corte = lerConfig({ PARECIDOS_HORAS: '0', PONTOS_MINIMOS: '999', FILA_MINIMA: '2' });
  const banco = new Banco(':memory:');
  const r = await coletar([fonteFixa(ofertas)], banco, corte, dias(1));
  assert.equal(banco.tamanhoDaFila(), 2, 'a fila fica com o mínimo, e não vazia');
  assert.equal(r.aprovadas, 2);
  assert.equal(r.reprovadasPorMotivo['pontuação abaixo do mínimo'], 2, 'as outras duas ficam de fora');
  assert.deepEqual(banco.itensDaFila(5).map((o) => o.idProduto).sort(), ['B', 'C'], 'entram as de maior pontuação (B tem 30% e C tem 28%)');
  // Fila que já está cheia: nada das fracas entra.
  const cheia = new Banco(':memory:');
  await coletar([fonteFixa([oferta({ idProduto: 'X', desconto: 60, nota: 4.9, vendas: 9000 })])], cheia, lerConfig({ PARECIDOS_HORAS: '0' }), dias(1));
  const r2 = await coletar([fonteFixa([f('A', 26)])], cheia, lerConfig({ PARECIDOS_HORAS: '0', PONTOS_MINIMOS: '999', FILA_MINIMA: '1' }), dias(1));
  assert.equal(cheia.tamanhoDaFila(), 1);
  assert.equal(r2.aprovadas, 0);
});

test('apelo: produto de supermercado ou saúde de nicho não entra, mesmo vendendo muito', () => {
  const vende = { vendas: 80_000, nota: 4.9, desconto: 45 };
  for (const titulo of ['Fralda Geriátrica Adulto Confort Master Pants P/M 32 Unidades', 'Papel Higiênico Supra Folha Tripla 24 Rolos', 'Cotonete Hastes Flexíveis 150 Unidades', 'Detergente Líquido Neutro 500ml']) {
    const r = avaliar(oferta({ titulo, ...vende }), new Banco(':memory:'), config, AGORA);
    assert.ok(!r.aprovada, titulo);
    assert.match(r.aprovada ? '' : r.motivo, /sem apelo/, titulo);
  }
  // Produto de verdade interessante passa; e quem quiser liberar tira a palavra da lista (PALAVRAS_SEM_APELO).
  assert.equal(motivo(oferta({ titulo: 'Fone de Ouvido Bluetooth Sem Fio', ...vende })), 'APROVADA');
  const liberado = lerConfig({ PARECIDOS_HORAS: '0', PALAVRAS_SEM_APELO: '' });
  assert.ok(avaliar(oferta({ titulo: 'Papel Higiênico 24 Rolos', ...vende }), new Banco(':memory:'), liberado, AGORA).aprovada);
});

test('popularidade: o que mais vende e é "mais vendido" da loja sobe, sem passar por cima de promoção ruim', () => {
  const pts = (extra: Partial<Oferta>) => {
    const r = avaliar(oferta({ idProduto: 'Z', desconto: 40, nota: 4.8, ...extra }), new Banco(':memory:'), config, AGORA);
    assert.ok(r.aprovada);
    return r.oferta.pontos;
  };
  assert.ok(pts({ vendas: 20_000 }) > pts({ vendas: 200 }) + 8, 'muito vendido pesa mais que pouco vendido');
  assert.ok(pts({ vendas: 2000, maisVendido: true }) >= pts({ vendas: 2000 }) + 8 - 0.01, 'selo de mais vendido da loja dá bônus');
  // Desconto mais fraco com mais vendas não vira "mais quente" que uma promoção muito melhor.
  assert.ok(pts({ desconto: 55, vendas: 2000 }) > pts({ desconto: 26, vendas: 100_000 }) - 6);
});

test('comissão: pesa de verdade (porcentagem e reais por venda), mas tem teto', () => {
  const pts = (extra: Partial<Oferta>) => {
    const r = avaliar(oferta({ idProduto: 'C', desconto: 40, nota: 4.8, vendas: 2000, ...extra }), new Banco(':memory:'), config, AGORA);
    assert.ok(r.aprovada);
    return r.oferta.pontos;
  };
  assert.ok(pts({ comissao: 0.13 }) > pts({ comissao: 0.03 }) + 6, '13% rende bem mais que 3%');
  assert.ok(pts({ comissao: 0.03, preco: 300 }) > pts({ comissao: 0.03, preco: 20 }) + 3, 'mesma porcentagem: o de R$ 300 rende mais por venda');
  assert.ok(pts({ comissao: 0.03 }) > pts({ comissao: undefined }), 'loja que informa comissão não perde para quem não informa');
  // Campanha de comissão extra tem teto: 83% conta como 20%.
  assert.equal(pts({ comissao: 0.83 }), pts({ comissao: 0.2 }));
  assert.ok(pts({ comissao: 0.83, vendas: 112 }) < pts({ comissao: 0.03, vendas: 20_000 }), 'comissão enorme não bate o produto que muita gente compra');
});

// ───────────── cada nicho com a sua configuração (fila, corte, válvula e WhatsApp) ─────────────

const GRUPO_PET = 'https://chat.whatsapp.com/KJi6FhpMfda0s0phA5W3Y3';
const naFila = (id: string, titulo: string, categoria: string, pontos: number): OfertaAvaliada => ({ loja: 'shopee', idProduto: id, titulo, preco: 100, link: 'https://s/x', nota: 4.8, vendas: 500, categoria, pontos });

test('nichos: o corte de qualidade é de cada nicho, e a oferta de pet passa com a pontuação que o tech não passaria', async () => {
  const mesmaOferta = { desconto: 26, nota: 4.5, vendas: 60 };
  const pet = oferta({ idProduto: 'PET1', titulo: 'Ração Cachorro Adulto 10kg Premium', ...mesmaOferta });
  const tech = oferta({ idProduto: 'TEC1', titulo: 'Fone Bluetooth Sem Fio Premium', ...mesmaOferta });
  const p = avaliar(pet, new Banco(':memory:'), config, AGORA);
  assert.ok(p.aprovada, 'ração não é "sem apelo": existe o grupo de pets');
  assert.equal(p.oferta.categoria, 'pet');
  const pontos = p.oferta.pontos;
  const corte = lerConfig({ PARECIDOS_HORAS: '0', PONTOS_MINIMOS: String(Math.ceil(pontos) + 5), NICHO_PONTOS_MINIMOS: `pet=${Math.floor(pontos) - 1}`, FILA_MINIMA: '0', NICHO_FILA_MINIMA: '0' });
  const banco = new Banco(':memory:');
  await coletar([fonteFixa([pet, tech])], banco, corte, dias(1));
  assert.equal(banco.tamanhoDaFilaDoNicho('pet'), 1, 'pet passa no corte do nicho');
  assert.equal(banco.tamanhoDaFilaDoNicho('tech'), 0, 'tech fica abaixo do corte geral');
});

test('nichos: o nicho com grupo próprio nunca fica sem oferta na fila (entram as melhores das fracas dele)', async () => {
  const fraca = (id: string, titulo: string) => oferta({ idProduto: id, titulo, desconto: 26, nota: 4.5, vendas: 60 });
  const ofertas = [fraca('PET1', 'Cama para Cachorro Pet Lavável G'), fraca('PET2', 'Coleira Peitoral Cachorro Ajustável'), fraca('TEC1', 'Fone Bluetooth Sem Fio Premium')];
  const base = { PARECIDOS_HORAS: '0', PONTOS_MINIMOS: '999', NICHO_PONTOS_MINIMOS: '', FILA_MINIMA: '0' };
  const semGrupo = new Banco(':memory:');
  await coletar([fonteFixa(ofertas)], semGrupo, lerConfig({ ...base, NICHO_FILA_MINIMA: '2' }), dias(1));
  assert.equal(semGrupo.tamanhoDaFila(), 0, 'sem grupo próprio, o corte vale para todos');
  const comGrupo = new Banco(':memory:');
  const r = await coletar([fonteFixa(ofertas)], comGrupo, lerConfig({ ...base, NICHO_FILA_MINIMA: '2', WHATSAPP_ROTAS: `pet=${GRUPO_PET}` }), dias(1));
  assert.equal(comGrupo.tamanhoDaFilaDoNicho('pet'), 2, 'o pet mantém 2 ofertas na fila');
  assert.equal(comGrupo.tamanhoDaFilaDoNicho('tech'), 0, 'o tech, sem grupo próprio, continua barrado');
  assert.equal(r.reprovadasPorMotivo['pontuação abaixo do mínimo'], 1, 'só o tech foi barrado');
});

test('nichos: o nicho abaixo da meta do dia passa na frente do ranking, e o grupo do nicho não gasta a cota do WhatsApp geral', async () => {
  const cfg = lerConfig({ PARECIDOS_HORAS: '0', TELEGRAM_CHAT_ID: '-1001234567890', WHATSAPP_ROTAS: `pet=${GRUPO_PET}`, GERAL_SEM_NICHOS: 'pet', WHATSAPP_POR_RODADA: '1', HORA_INICIO: '8', HORA_FIM: '22', PONTOS_MINIMOS: '0' });
  const monta = () => {
    const banco = new Banco(':memory:');
    banco.enfileirar(naFila('T1', 'Fone Bluetooth Premium Alpha', 'tech', 90), AGORA);
    banco.enfileirar(naFila('T2', 'Caixa de Som Bluetooth Beta', 'tech', 80), AGORA);
    banco.enfileirar(naFila('P1', 'Cama para Cachorro Pet Gama', 'pet', 50), AGORA);
    return banco;
  };
  // Às 15h o pet (mínimo padrão 6/dia) deveria ter 4 posts e tem 0: ele passa na frente, mesmo com a menor pontuação.
  const banco = monta();
  const pub = new PublicadorFalso();
  assert.equal((await postarProxima(pub, banco, cfg, AGORA)).postou, true);
  assert.deepEqual(banco.postsPorCategoria(1, AGORA), [{ categoria: 'pet', posts: 1 }]);
  assert.deepEqual(pub.enviados, [], 'o pet não vai para o Telegram geral (GERAL_SEM_NICHOS=pet), só para o grupo dele');
  assert.equal(banco.mensagensDoWhatsapp(1, AGORA).length, 1, 'e a mensagem do pet foi para o WhatsApp');
  // Sem pet na fila, o ranking geral volta a mandar.
  assert.equal((await postarProxima(pub, banco, cfg, AGORA)).postou, true);
  assert.deepEqual(pub.enviados, ['T1']);

  // A cota do WhatsApp geral (1 por rodada) não é gasta pelo pet: T1 usa a cota, T2 não cabe, mas o pet entra.
  const zerado = lerConfig({ PARECIDOS_HORAS: '0', TELEGRAM_CHAT_ID: '-1001234567890', WHATSAPP_ROTAS: `pet=${GRUPO_PET}`, GERAL_SEM_NICHOS: 'pet', WHATSAPP_POR_RODADA: '1', NICHO_MINIMOS: 'pet=0', PONTOS_MINIMOS: '0' });
  const b2 = monta();
  const pub2 = new PublicadorFalso();
  for (let i = 0; i < 3; i++) assert.equal((await postarProxima(pub2, b2, zerado, AGORA)).postou, true);
  assert.deepEqual(pub2.enviados, ['T1', 'T2']);
  const mensagens = b2.mensagensDoWhatsapp(1, AGORA);
  assert.equal(mensagens.length, 2, 'T1 (cota) e P1 (grupo do nicho); T2 ficou sem WhatsApp porque a cota estava cheia');
  assert.ok(mensagens.some((m) => /Cama para Cachorro/.test(m.texto)));
});

test('db: melhorDaFila com soCategorias só considera esses nichos, e tamanhoDaFilaDoNicho conta por nicho', () => {
  const banco = new Banco(':memory:');
  banco.enfileirar(naFila('T1', 'Fone Alpha', 'tech', 90), AGORA);
  banco.enfileirar(naFila('P1', 'Cama Gama', 'pet', 50), AGORA);
  banco.enfileirar(naFila('P2', 'Coleira Delta', 'pet', 60), AGORA);
  assert.equal(banco.melhorDaFila()!.idProduto, 'T1');
  assert.equal(banco.melhorDaFila(undefined, [], ['pet'])!.idProduto, 'P2', 'só o pet concorre');
  assert.equal(banco.melhorDaFila(undefined, ['pet'], [])!.idProduto, 'T1', 'sem o pet');
  assert.equal(banco.melhorDaFila(undefined, [], ['bebe']), undefined);
  assert.equal(banco.tamanhoDaFilaDoNicho('pet'), 2);
  assert.equal(banco.tamanhoDaFilaDoNicho('tech'), 1);
  assert.equal(banco.tamanhoDaFilaDoNicho('moda'), 0);
});
