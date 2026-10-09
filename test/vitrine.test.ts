import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepararCarrossel } from '../src/carrossel.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { Instagram, publicarNoInstagram } from '../src/instagram.ts';
import { svgDoResumoDoDia, svgsDaApresentacao } from '../src/moldes.ts';
import { legendaDoCarrossel, totalDeImagens, type DadosDoGrupo } from '../src/social.ts';
import { arquivoDoResumo, dadosDaApresentacao, dadosDoResumo, gravarResumoDoDia, palavrasParaMostrar } from '../src/vitrine.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// Segunda-feira, 5 de outubro de 2026, 21h em Brasília.
const AGORA = new Date('2026-10-06T00:00:00Z');
const base = { INSTAGRAM_ATIVO: '1', INSTAGRAM_TOKEN: 'tok', INSTAGRAM_USER_ID: '1789', BLOG_URL: 'https://fulano.github.io/achadinhos', HORA_INICIO: '8', HORA_FIM: '24', INSTAGRAM_HORARIOS_FEED: '', INSTAGRAM_HORARIOS_STORIES: '', INSTAGRAM_INTERVALO_FEED_MIN: '0' };
const config = lerConfig(base);

const oferta = (n: number, extra: Partial<OfertaAvaliada> = {}): OfertaAvaliada => ({
  loja: 'shopee', idProduto: `P${n}`, titulo: `Fone Bluetooth ${n}`, preco: 50 + n, precoOriginal: 100 + n, desconto: 40 + n, link: 'https://x', nota: 4.8, vendas: 2000,
  categoria: ['tech', 'casa', 'moda'][n % 3]!, pontos: 10, ...extra,
});

/** Banco com `n` ofertas postadas hoje (no Telegram e na fila das redes sociais), com foto. */
function bancoComPostsDoDia(n: number, quando = AGORA): Banco {
  const banco = new Banco(':memory:');
  for (let i = 1; i <= n; i++) {
    const o = oferta(i, i === 2 ? { menorPrecoEmDias: 30 } : {});
    const t = new Date(quando.getTime() - i * 600_000);
    banco.registrarPost(o, t);
    banco.guardarParaSocial(o, t);
  }
  for (const l of banco.socialRecentes(24, 50, quando)) banco.salvarArteSocial(l.chave, '<svg/>', 'data:image/png;base64,AAAA');
  return banco;
}

test('vitrine: o resumo do dia conta os achados de hoje, o maior desconto, os de menor preço e os assuntos; com poucos achados não sai', () => {
  const d = dadosDoResumo(bancoComPostsDoDia(5), AGORA)!;
  assert.equal(d.achados, 5);
  assert.equal(d.maiorDesconto, 0, 'a vitrine não mostra o tamanho do desconto (nenhum valor)');
  assert.equal(d.noMenorPreco, 1);
  assert.deepEqual(new Set(d.assuntos), new Set(['Eletrônicos', 'Casa & Cozinha', 'Moda']));
  assert.equal(d.fotos.length, 4, 'no máximo 4 fotos');
  assert.equal(dadosDoResumo(bancoComPostsDoDia(2), AGORA), undefined, 'com 2 achados não convence');
  // Desconto inflado não entra no "maior desconto".
  const banco = new Banco(':memory:');
  for (let i = 1; i <= 3; i++) {
    const o = oferta(i, { precoDe: 'inflado' });
    banco.registrarPost(o, AGORA);
    banco.guardarParaSocial(o, AGORA);
  }
  assert.equal(dadosDoResumo(banco, AGORA)!.maiorDesconto, 0);
});

test('vitrine: as artes do grupo não têm preço em reais e mostram a chamada para entrar', () => {
  const resumo = svgDoResumoDoDia({ achados: 24, maiorDesconto: 62, noMenorPreco: 5, assuntos: ['Eletrônicos', 'Moda'], fotos: [] });
  assert.match(resumo, /HOJE NO GRUPO/);
  assert.match(resumo, />24</);
  assert.match(resumo, /62%/);
  assert.match(resumo, /ENTRE NO GRUPO/);
  assert.doesNotMatch(resumo, /R\$/);
  const slides = svgsDaApresentacao(dadosDaApresentacao(bancoComPostsDoDia(12), config, AGORA));
  assert.equal(slides.length, 5);
  for (const s of slides) {
    assert.match(s, /^<svg[^>]+width="1080" height="1350"/);
    assert.doesNotMatch(s, /R\$/);
  }
  assert.match(slides.join(''), /POR QUE ENTRAR NO/);
  assert.match(slides.at(-1)!, /ENTRE NO GRUPO/);
});

test('vitrine: a apresentação usa as regras de verdade do filtro e sem palavra repetida ou imprópria', () => {
  const d = dadosDaApresentacao(bancoComPostsDoDia(12), lerConfig({ ...base, DESCONTO_MINIMO: '30', QUEDA_MINIMA: '12' }), AGORA);
  assert.equal(d.achadosNaSemana, 12);
  assert.equal(d.descontoMinimo, 30);
  assert.equal(d.quedaMinima, 12);
  assert.equal(d.diasDeHistorico, 30);
  assert.deepEqual(palavrasParaMostrar(['réplica', 'replica', 'usado', 'recondicionado', 'erótico']), ['réplica', 'usado', 'recondicionado']);
});

test('vitrine: o Story "Hoje no grupo" é gravado a partir de uma hora antes e publicado uma vez por dia, na hora do resumo', async (t) => {
  try {
    await import('@resvg/resvg-js');
  } catch {
    return t.skip('conversor @resvg/resvg-js não instalado neste computador');
  }
  const dir = mkdtempSync(join(tmpdir(), 'vitrine-'));
  const cfg = lerConfig({ ...base, BLOG_PASTA: dir, INSTAGRAM_RESUMO_HORA: '21' });
  const banco = bancoComPostsDoDia(5);
  const as19 = new Date('2026-10-05T22:00:00Z');
  assert.equal(await gravarResumoDoDia(banco, cfg, as19), false, '19h: cedo demais');
  assert.equal(await gravarResumoDoDia(banco, cfg, AGORA), true);
  const arquivo = join(dir, 'social', arquivoDoResumo(AGORA));
  assert.ok(existsSync(arquivo));
  const png = readFileSync(arquivo);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1920]);
  assert.equal(await gravarResumoDoDia(banco, lerConfig({ ...base, BLOG_PASTA: dir, INSTAGRAM_RESUMO_HORA: '0' }), AGORA), false, '0 desliga');

  const stories: string[] = [];
  const f = (async (url: string, init: any = {}) => {
    const u = String(url);
    const corpo = new URLSearchParams(init.body ? String(init.body) : '');
    if ((init.method ?? 'GET') === 'HEAD') return new Response(null, { status: 200 });
    if (corpo.get('media_type') === 'STORIES') stories.push(corpo.get('image_url')!);
    if (u.includes('/media_publish')) return new Response(JSON.stringify({ id: 'p' }));
    if (u.endsWith('/media')) return new Response(JSON.stringify({ id: 'c' }));
    return new Response(JSON.stringify({ status_code: 'FINISHED' }));
  }) as unknown as typeof fetch;
  const cliente = new Instagram('tok', '1789', f, 0);
  await publicarNoInstagram(banco, cfg, as19, f, cliente);
  assert.ok(!stories.some((s) => s.includes('resumo-')), 'antes da hora não publica o resumo');
  await publicarNoInstagram(banco, cfg, AGORA, f, cliente);
  assert.equal(stories.filter((s) => s.endsWith(`/social/${arquivoDoResumo(AGORA)}`)).length, 1);
  await publicarNoInstagram(banco, cfg, new Date(AGORA.getTime() + 30 * 60_000), f, cliente);
  assert.equal(stories.filter((s) => s.includes('resumo-')).length, 1, 'uma vez por dia');
});

test('vitrine: o carrossel "Por que entrar no grupo" sai nos dias marcados, no máximo uma vez por semana, com legenda sem preço', async () => {
  const banco = bancoComPostsDoDia(12);
  const segundaMeioDia = new Date('2026-10-05T15:00:00Z');
  assert.equal(await prepararCarrossel(banco, config, segundaMeioDia), true, 'segunda é o dia padrão');
  const pendente = banco.carrosselPendente(segundaMeioDia)!;
  assert.match(pendente.chave, /^grupo-2026-10-05$/);
  const dados = JSON.parse(pendente.dados) as DadosDoGrupo;
  assert.equal(dados.formato, 'grupo');
  assert.equal(totalDeImagens(dados), 5);
  const legenda = legendaDoCarrossel(dados, config);
  assert.match(legenda.split('\n')[0]!, /^📲 Por que entrar no grupo Mata Preço\? #publi$/);
  assert.match(legenda, /12 achados separados nos últimos 7 dias/);
  assert.match(legenda, /25% de desconto ou mais/);
  assert.match(legenda, /Entrar é grátis: link na bio/);
  assert.doesNotMatch(legenda, /R\$/);
  assert.ok(legenda.length < 2200 && (legenda.match(/#\w+/g) ?? []).length <= 10);

  // Publicado na segunda, não volta antes de uma semana, mesmo com mais dias marcados.
  banco.marcarCarrosselPublicado(pendente.chave, segundaMeioDia);
  const todoDia = lerConfig({ ...base, INSTAGRAM_GRUPO_DIAS: '0,1,2,3,4,5,6', INSTAGRAM_DICAS_DIAS: '' });
  assert.equal(await prepararCarrossel(banco, todoDia, new Date(segundaMeioDia.getTime() + 86_400_000)), false);
  // Com poucos achados na semana, espera.
  assert.equal(await prepararCarrossel(bancoComPostsDoDia(5), config, segundaMeioDia), false);
  // Vazio = nunca.
  assert.equal(await prepararCarrossel(bancoComPostsDoDia(12), lerConfig({ ...base, INSTAGRAM_GRUPO_DIAS: '' }), segundaMeioDia), false);
});
