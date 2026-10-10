import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { FonteMercadoLivre } from '../src/fontes/mercadolivre.ts';
import { FonteMercadoLivreApi } from '../src/fontes/mercadolivre-api.ts';
import { coletar, postarProxima, type Descartes } from '../src/pipeline.ts';
import type { Oferta, OfertaAvaliada } from '../src/types.ts';

const AGORA = new Date('2026-10-09T15:00:00Z');
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

/** Captura o que a função escreve em console.log. */
async function capturandoLog<T>(fn: () => Promise<T>): Promise<{ valor: T; linhas: string[] }> {
  const linhas: string[] = [];
  const original = console.log;
  console.log = (...a: unknown[]) => void linhas.push(a.join(' '));
  try {
    return { valor: await fn(), linhas };
  } finally {
    console.log = original;
  }
}

test('ml-api: o log diz qual complemento falhou e com qual código HTTP (e não só "x4")', async () => {
  const falsa = (async (url: string) => {
    const u = String(url);
    if (u.includes('/oauth/token')) return resp(200, { access_token: 'x' });
    if (u.includes('/highlights/')) return resp(200, { content: [{ id: 'MLB111', type: 'PRODUCT' }, { id: 'MLB222', type: 'PRODUCT' }] });
    if (/\/products\/MLB\d+$/.test(u)) return resp(200, { id: u.split('/').pop(), name: 'Produto teste', pictures: [{ url: 'https://x/y.jpg' }], buy_box_winner: { item_id: 'MLB999', price: 50, original_price: 100, condition: 'new' } });
    if (u.includes('/items/')) return resp(403, { message: 'forbidden' });
    if (u.includes('/reviews/')) return resp(404, { message: 'not_found' });
    return resp(500, {});
  }) as unknown as typeof fetch;
  const api = new FonteMercadoLivreApi({ clientId: 'a', clientSecret: 'b', mattWord: 'w', mattTool: 't', categorias: ['MLB1000'] }, falsa, 0);
  const { valor, linhas } = await capturandoLog(() => api.coletar(0));
  assert.equal(valor.length, 2, 'as ofertas saem mesmo sem nota e vendas');
  const resumo = linhas.find((l) => l.startsWith('[ml-api]'))!;
  assert.match(resumo, /anúncio 403 x2/);
  assert.match(resumo, /avaliações 404 x2/);
});

test('ml: quando a página barra e a API salva a rodada, o motivo da página vira aviso e linha de log', async () => {
  const barrada = (async () => new Response('captcha', { status: 403 })) as unknown as typeof fetch;
  const oferta: Oferta = { loja: 'mercadolivre', idProduto: 'MLB1', titulo: 'Fone', preco: 50, desconto: 50, link: 'https://x/1', nota: 4.8, vendas: 900 };
  const fonte = new FonteMercadoLivre({ mattWord: 'w', mattTool: 't', reserva: { coletar: async () => [oferta] } }, barrada);
  const { valor, linhas } = await capturandoLog(() => fonte.coletar());
  assert.equal(valor.length, 1);
  assert.match(fonte.avisoDaColeta() ?? '', /403/);
  assert.ok(linhas.some((l) => l.startsWith('[ml]') && /403/.test(l)));

  // No resumo da coleta o aviso aparece por loja, e a fonte não é marcada como quebrada.
  const banco = new Banco(':memory:');
  const r = await coletar([fonte], banco, lerConfig({}), AGORA);
  assert.match(r.avisosPorFonte.mercadolivre ?? '', /página de ofertas/);
  assert.deepEqual(r.errosPorFonte, {});
  assert.equal(banco.fontesComFalhas(1).length, 0);
});

test('coleta: os motivos de reprovação saem separados por loja', async () => {
  const banco = new Banco(':memory:');
  const o = (loja: 'shopee' | 'mercadolivre', id: string, extra: Partial<Oferta>): Oferta => ({ loja, idProduto: id, titulo: `Produto ${id}`, preco: 100, desconto: 40, link: 'https://x/' + id, nota: 4.8, vendas: 500, ...extra });
  const fonte = (nome: 'shopee' | 'mercadolivre', ofertas: Oferta[]) => ({ nome, coletar: async () => ofertas });
  const r = await coletar(
    [fonte('shopee', [o('shopee', 'S1', { desconto: 5 }), o('shopee', 'S2', {})]), fonte('mercadolivre', [o('mercadolivre', 'M1', { desconto: 5 }), o('mercadolivre', 'M2', { desconto: 5 }), o('mercadolivre', 'M3', { nota: 3 })])],
    banco,
    lerConfig({}),
    AGORA,
  );
  assert.deepEqual(r.reprovadasPorLoja.shopee, { 'desconto insuficiente': 1 });
  assert.deepEqual(r.reprovadasPorLoja.mercadolivre, { 'desconto insuficiente': 2, 'nota baixa': 1 });
  assert.equal(r.reprovadasPorMotivo['desconto insuficiente'], 3, 'o total continua valendo');
});

test('fila: a regra de parecidos conta o que tirou da fila (já postado e perdeu para o melhor vendedor)', async () => {
  const banco = new Banco(':memory:');
  const of = (n: number, titulo: string, pontos: number, nota: number): OfertaAvaliada => ({ loja: 'mercadolivre', idProduto: `MLB${n}`, titulo, preco: 50 + n, link: `https://x/${n}`, nota, vendas: 2000, categoria: 'casa', pontos });
  banco.enfileirar(of(1, 'Telha Policarbonato Alveolar 6mm', 90, 4.2), AGORA);
  banco.enfileirar(of(2, 'Chapa Policarbonato Alveolar Cristal', 70, 4.9), AGORA);
  banco.enfileirar(of(3, 'Telhas Policarbonato Alveolar Transparente', 80, 4.6), AGORA);
  const config = lerConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', HORA_INICIO: '8', HORA_FIM: '23' });
  const descartes: Descartes = { parecidosComPostados: 0, perdeuParaMelhorVendedor: 0 };
  const publicador = { async publicar() {} } as any;
  await postarProxima(publicador, banco, config, AGORA, descartes);
  assert.equal(descartes.perdeuParaMelhorVendedor, 2, 'dois anúncios perderam para o de nota 4,9');
  assert.equal(descartes.parecidosComPostados, 0);
  // Um quarto anúncio do mesmo tipo chega depois: agora é parecido com o que já foi postado.
  banco.enfileirar(of(4, 'Telha Policarbonato Alveolar Premium', 95, 4.8), AGORA);
  await postarProxima(publicador, banco, config, AGORA, descartes);
  assert.equal(descartes.parecidosComPostados, 1);
});
