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