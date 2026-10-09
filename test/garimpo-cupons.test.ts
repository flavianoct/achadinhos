import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { MAXIMO_POR_LOJA, codigoPlausivel, filtrarCuponsConfiaveis, garimparCupons, lerPaginaDeCupons, opcoesDoGarimpo, tituloDoGarimpo, type CupomBruto } from '../src/garimpo-cupons.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-09T15:00:00Z');

/** Cupom no formato em que o site publica (campos reais de serverCoupons.coupons). */
const site = (extra: Record<string, unknown>) => ({
  couponTitle: 'Cupom Mercado Livre: 50% OFF acima de R$ 30 (até R$ 20) em Selecionados', couponCode: '-', couponUntil: '2026-10-31T23:59:59-0300', couponVerified: null, couponStatusName: 'APPROVED',
  couponInstructions: '', couponPublished: '2026-10-08T18:30:03-0300', ...extra,
});
const pagina = (cupons: unknown[]) => `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { serverCoupons: { coupons: cupons } } } })}</script></body></html>`;

const opcoes = { bloquear: [], linkMercadoLivre: 'https://www.mercadolivre.com.br/cupons?matt_word=eu&matt_tool=1', linkShopee: 'https://shope.ee/abc' };
const bruto = (extra: Partial<CupomBruto>): CupomBruto => ({ loja: 'mercadolivre', codigo: '', titulo: 'R$ 20 OFF em compras acima de R$ 99', instrucoes: '', validoAte: '2026-10-31', publicadoEm: '2026-10-08', verificado: false, aprovado: true, ...extra });

test('garimpo: lê os cupons de dentro da página e avisa quando ela mudou de formato', () => {
  const lidos = lerPaginaDeCupons(pagina([site({}), site({ couponCode: 'PROMO20', couponVerified: true })]), 'mercadolivre')!;
  assert.equal(lidos.length, 2);
  assert.deepEqual([lidos[0]!.validoAte, lidos[0]!.publicadoEm, lidos[0]!.aprovado, lidos[1]!.verificado, lidos[1]!.codigo], ['2026-10-31', '2026-10-08', true, true, 'PROMO20']);
  assert.equal(lerPaginaDeCupons('<html>nada</html>', 'shopee'), undefined, 'sem o bloco de dados');
  assert.equal(lerPaginaDeCupons('<script id="__NEXT_DATA__">{lixo</script>', 'shopee'), undefined, 'JSON quebrado');
  assert.equal(lerPaginaDeCupons('<script id="__NEXT_DATA__">{"props":{}}</script>', 'shopee'), undefined, 'a lista sumiu');
});

test('garimpo: código genérico ou inventado pelo site não é cupom', () => {
  for (const c of ['DESCONTO', 'ECONOMIA', 'RESGATENOLINK', 'PEGUEAQUI', 'Direto no link', '-', '', 'abc', 'CUPOM LIBERADO']) assert.equal(codigoPlausivel(c), false, c);
  for (const c of ['ESFRIOU20', 'MELIPROMOBIT', 'DISNEY20', 'SITE200']) assert.equal(codigoPlausivel(c), true, c);
});

test('garimpo: cupom com código só passa se o site verificou; cupom de ativar só passa com validade', () => {
  const { cupons } = filtrarCuponsConfiaveis(
    [
      bruto({ codigo: 'ESFRIOU20', verificado: true, titulo: 'Use ESFRIOU20 e ganhe 20% OFF' }), // ok: código de verdade e verificado
      bruto({ codigo: 'DISNEY20', verificado: false, titulo: 'Disney 20% OFF' }), // código sem verificação
      bruto({ codigo: 'DESCONTO', verificado: true, titulo: '10% OFF em tudo' }), // código genérico, mesmo verificado
      bruto({ codigo: '', validoAte: '2026-11-04', titulo: 'R$ 90 OFF acima de R$ 500' }), // ativar na página, com data
      bruto({ codigo: '', validoAte: undefined, titulo: 'R$ 40 OFF em compras' }), // ativar na página, sem data
      bruto({ codigo: '', validoAte: '2026-10-01', titulo: 'R$ 15 OFF acima de R$ 80' }), // vencido
      bruto({ codigo: '', titulo: 'Cupom especial de boas-vindas' }), // sem benefício concreto
      bruto({ codigo: '', aprovado: false, titulo: 'R$ 30 OFF acima de R$ 150' }), // não aprovado
    ],
    AGORA,
    opcoes,
  );
  assert.deepEqual(cupons.map((c) => c.titulo), ['Use ESFRIOU20 e ganhe 20% OFF', 'R$ 90 OFF acima de R$ 500']);
  assert.equal(cupons[0]!.codigo, 'ESFRIOU20');
  assert.equal(cupons[1]!.codigo, undefined, 'cupom de ativar sai sem código');
  assert.equal(cupons[1]!.validoAte, '2026-11-04');
});

test('garimpo: cashback não é cupom, e cada loja entra só com os mais recentes (sem encher o canal)', () => {
  assert.equal(filtrarCuponsConfiaveis([bruto({ titulo: 'Use cupom Shopee e tenha 50% de cashback' })], AGORA, opcoes).cupons.length, 0);
  const muitos = Array.from({ length: 10 }, (_, i) => bruto({ loja: 'shopee', titulo: `Economize R$ ${10 + i} na Shopee`, publicadoEm: `2026-10-0${i % 9 + 1}` }));
  const { cupons, descartados } = filtrarCuponsConfiaveis(muitos, AGORA, opcoes);
  assert.equal(cupons.length, MAXIMO_POR_LOJA);
  assert.equal(descartados, 10 - MAXIMO_POR_LOJA);
  const datas = muitos.filter((m) => cupons.some((c) => c.titulo.endsWith(m.titulo))).map((m) => m.publicadoEm!);
  assert.ok(datas.every((d) => d >= '2026-10-06'), 'ficaram os mais recentes: ' + datas.join(','));
  // O limite é por loja: Mercado Livre não é prejudicado pelo excesso da Shopee.
  const mistos = [...muitos, bruto({ loja: 'mercadolivre', titulo: 'R$ 50 OFF no Mercado Livre' })];
  assert.equal(filtrarCuponsConfiaveis(mistos, AGORA, opcoes).cupons.filter((c) => c.loja === 'mercadolivre').length, 1);
});

test('garimpo: o link do post é sempre o seu de afiliado, e loja sem link configurado fica de fora', () => {
  const brutos = [bruto({ loja: 'mercadolivre' }), bruto({ loja: 'shopee', titulo: 'R$ 60 OFF na Shopee' })];
  const todos = filtrarCuponsConfiaveis(brutos, AGORA, opcoes).cupons;
  assert.deepEqual(todos.map((c) => c.link), [opcoes.linkMercadoLivre, opcoes.linkShopee]);
  const semShopee = filtrarCuponsConfiaveis(brutos, AGORA, { ...opcoes, linkShopee: undefined });
  assert.deepEqual(semShopee.cupons.map((c) => c.loja), ['mercadolivre']);
  assert.equal(semShopee.descartados, 1);
});

test('garimpo: palavras bloqueadas descartam o cupom e repetidos viram um só', () => {
  const brutos = [bruto({ titulo: 'R$ 20 OFF primeira compra' }), bruto({ titulo: 'R$ 30 OFF acima de R$ 200' }), bruto({ titulo: 'R$ 30 OFF acima de R$ 200' })];
  const { cupons } = filtrarCuponsConfiaveis(brutos, AGORA, { ...opcoes, bloquear: ['Primeira Compra'] });
  assert.deepEqual(cupons.map((c) => c.titulo), ['R$ 30 OFF acima de R$ 200']);
});

test('garimpo: o título perde a chamada antes dos dois-pontos e o detalhe é curto e sem HTML', () => {
  assert.equal(tituloDoGarimpo('O momento chegou: Aplique cupom Mercado Livre e ganhe R$20 OFF'), 'Aplique cupom Mercado Livre e ganhe R$20 OFF');
  assert.equal(tituloDoGarimpo('APROVEITE: R$ 100 OFF em compras acima de R$ 999'), 'R$ 100 OFF em compras acima de R$ 999');
  assert.equal(tituloDoGarimpo('Cupom de 10% OFF'), 'Cupom de 10% OFF', 'sem dois-pontos fica como está');
  assert.equal(tituloDoGarimpo('Atenção: leia as regras'), 'Atenção: leia as regras', 'sem benefício depois dos dois-pontos, não corta');
  const longo = `<p>${'Regra importante. '.repeat(30)}</p>`;
  const { cupons } = filtrarCuponsConfiaveis([bruto({ instrucoes: longo.replace(/<[^>]*>/g, '') })], AGORA, opcoes);
  assert.ok(cupons[0]!.detalhe!.length <= 160 && cupons[0]!.detalhe!.endsWith('...'));
});

test('garimpo: busca as páginas das lojas ligadas, junta só o confiável e transforma falha em aviso (nunca derruba a rodada)', async () => {
  const config = lerConfig({ ML_ATIVO: '1', ML_MATT_WORD: 'eu', ML_MATT_TOOL: '123', SHOPEE_ATIVO: '1', SHOPEE_APP_ID: 'a', SHOPEE_SECRET: 'b' });
  assert.match(opcoesDoGarimpo(config).linkMercadoLivre!, /mercadolivre\.com\.br\/cupons.*matt_word=eu.*matt_tool=123|mercadolivre\.com\.br\/cupons.*matt_tool=123.*matt_word=eu/);
  const chamadas: string[] = [];
  let gerarOk = false;
  const f = (async (url: string) => {
    chamadas.push(String(url));
    if (String(url).includes('open-api.affiliate.shopee')) return new Response(JSON.stringify(gerarOk ? { data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/abc123' } } } : { errors: [{ message: 'sem permissão', extensions: { code: 10020 } }] }));
    if (String(url).includes('mercado-livre')) return new Response(pagina([site({}), site({ couponCode: 'DESCONTO', couponVerified: true })]));
    return new Response('x', { status: 503 });
  }) as unknown as typeof fetch;
  const r = await garimparCupons(config, AGORA, f);
  assert.equal(chamadas.filter((c) => c.includes('promobit')).length, 1, 'sem link da Shopee, só o Mercado Livre é buscado');
  assert.equal(r.cupons.length, 1);
  assert.match(r.avisos.join(' '), /não consegui gerar o seu link.*CUPONS_LINK_SHOPEE/);

  // Com as chaves da Shopee, o robô gera o seu link de afiliado sozinho e a Shopee entra.
  gerarOk = true;
  const geradoSozinho = await garimparCupons(config, AGORA, f);
  assert.ok(chamadas.some((c) => c.includes('open-api.affiliate.shopee')), 'chamou a API de afiliados');
  assert.match(geradoSozinho.avisos.join(' '), /Shopee.*503/, 'o link saiu; o aviso agora é só da página de cupons caída');
  gerarOk = false;

  const comShopee = lerConfig({ ML_ATIVO: '1', ML_MATT_WORD: 'eu', ML_MATT_TOOL: '123', SHOPEE_ATIVO: '1', SHOPEE_APP_ID: 'a', SHOPEE_SECRET: 'b', CUPONS_LINK_SHOPEE: 'https://shope.ee/abc' });
  const r2 = await garimparCupons(comShopee, AGORA, f);
  assert.equal(r2.cupons.length, 1, 'a Shopee caiu (503): fica só o Mercado Livre');
  assert.match(r2.avisos.join(' '), /Shopee.*503/);

  const quebrada = (async () => new Response('<html>mudou</html>')) as unknown as typeof fetch;
  assert.match((await garimparCupons(comShopee, AGORA, quebrada)).avisos.join(' '), /mudou de formato/);
  const semRede = (async () => { throw new Error('sem internet'); }) as unknown as typeof fetch;
  assert.match((await garimparCupons(comShopee, AGORA, semRede)).avisos.join(' '), /sem internet/);
});

test('garimpo: desligado por CUPONS_GARIMPO=0 e sem os parâmetros do Mercado Livre avisa o que falta', async () => {
  assert.equal(lerConfig({ CUPONS_GARIMPO: '0' }).cupons.garimpo, false);
  assert.equal(lerConfig({}).cupons.garimpo, true);
  const semMatt = lerConfig({ ML_ATIVO: '1' });
  const r = await garimparCupons(semMatt, AGORA, (async () => { throw new Error('não devia buscar'); }) as unknown as typeof fetch);
  assert.match(r.avisos.join(' '), /ML_MATT_WORD/);
  assert.deepEqual(r.cupons, []);
});
