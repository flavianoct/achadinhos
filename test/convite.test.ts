import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { conviteDeHoje, linksDoConvite, textoDoConvite } from '../src/convite.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { publicarControle } from '../src/exportar.ts';
import { montarMensagemWhatsapp, rodapeDoWhatsapp } from '../src/mensagem.ts';
import { Robo } from '../src/robo.ts';
import { Telegram } from '../src/telegram.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const canal = 'https://whatsapp.com/channel/0029VbDtCLD2UPBAGBZ4UO1W';
const grupo = 'https://chat.whatsapp.com/KRJ3OtHhmZ10XfReNMTIaw';
const base = { BLOG_URL: 'https://flavianoct.github.io/achadinhos', BLOG_TELEGRAM: 'https://t.me/canal', BLOG_INSTAGRAM: '@perfil', BLOG_WHATSAPP: canal, WHATSAPP_DESTINOS: `${canal},${grupo}`, HORA_INICIO: '8', HORA_FIM: '23', CONVITE_ATIVO: '1' };
// 12h05 e 11h em Brasília, 9h e 16h
const as12 = new Date('2026-10-08T15:05:00Z');
const as11 = new Date('2026-10-08T14:05:00Z');
const as16 = new Date('2026-10-08T19:05:00Z');

test('convite: texto curto com os quatro caminhos, e vazio quando não há o que escolher', () => {
  const config = lerConfig(base);
  assert.deepEqual(linksDoConvite(config).map((l) => l.rotulo), ['Canal do WhatsApp', 'Grupo do WhatsApp', 'Telegram', 'Instagram']);
  const texto = textoDoConvite(config);
  assert.match(texto, /^Se preferir receber de outro jeito, a gente também está por aqui:/);
  for (const l of [canal, grupo, 'https://t.me/canal', 'https://www.instagram.com/perfil/']) assert.ok(texto.includes(l), l);
  assert.ok(texto.split('\n').length <= 7 && texto.length < 400, 'curto');
  assert.equal(textoDoConvite(lerConfig({ BLOG_TELEGRAM: 'https://t.me/canal' })), '', 'um caminho só não é convite');
});

test('convite: uma vez por dia, só na hora configurada e nunca fora da validade; "a cada N dias" respeita o ritmo', () => {
  const config = lerConfig(base);
  assert.equal(conviteDeHoje(config, as11), undefined, 'antes da hora (12h)');
  assert.equal(conviteDeHoje(config, as16), undefined, 'depois da validade (3 horas)');
  const c = conviteDeHoje(config, as12)!;
  assert.equal(c.id, 'convite:2026-10-08');
  assert.equal(c.criadoEm, Date.parse('2026-10-08T12:00:00-03:00'));
  assert.equal(conviteDeHoje(config, new Date('2026-10-08T17:30:00Z'))!.id, c.id, 'mesmo id o dia todo: o enviador manda uma vez só');
  assert.equal(conviteDeHoje(lerConfig({ ...base, CONVITE_ATIVO: '0' }), as12), undefined, 'desligado');
  assert.equal(conviteDeHoje(lerConfig({ ...base, CONVITE_HORA: '19' }), new Date('2026-10-08T22:10:00Z'))!.criadoEm, Date.parse('2026-10-08T19:00:00-03:00'));
  // A cada 2 dias: só aparece em dias alternados, nunca em dois dias seguidos.
  const dois = lerConfig({ ...base, CONVITE_A_CADA_DIAS: '2' });
  const dias = [8, 9, 10, 11].map((d) => conviteDeHoje(dois, new Date(`2026-10-${String(d).padStart(2, '0')}T15:05:00Z`)) !== undefined);
  assert.equal(dias.filter(Boolean).length, 2);
  assert.ok(dias[0] !== dias[1] && dias[1] !== dias[2], 'alternados');
});

test('rodapé: cada oferta do WhatsApp termina com duas linhas curtas (Telegram e Instagram), depois do link da oferta', () => {
  const o: OfertaAvaliada = { loja: 'shopee', idProduto: '1', titulo: 'Produto', preco: 10, link: 'https://s.shopee.com.br/x', categoria: 'casa', pontos: 1 };
  const config = lerConfig(base);
  assert.equal(rodapeDoWhatsapp(config), 'Quer seguir também?\n✈️ Telegram: t.me/canal\n📸 Instagram: instagram.com/perfil/');
  const msg = montarMensagemWhatsapp(o, rodapeDoWhatsapp(config));
  assert.ok(msg.trimEnd().endsWith('📸 Instagram: instagram.com/perfil/'), 'o rodapé fica no fim');
  assert.ok(msg.indexOf('https://s.shopee.com.br/x') < msg.indexOf('Quer seguir também?'), 'o link da oferta vem primeiro (a prévia do link usa o primeiro)');
  assert.equal(montarMensagemWhatsapp(o), montarMensagemWhatsapp(o, ''), 'sem rodapé a mensagem não muda');
  assert.equal(rodapeDoWhatsapp(lerConfig({ ...base, WHATSAPP_RODAPE: '0' })), '', 'desligável');
  assert.equal(rodapeDoWhatsapp(lerConfig({ HORA_INICIO: '8' })), '', 'sem Telegram nem Instagram configurados não acrescenta nada');
  assert.equal(rodapeDoWhatsapp(lerConfig({ BLOG_TELEGRAM: 'https://t.me/canal' })), 'Quer seguir também?\n✈️ Telegram: t.me/canal', 'só o que existe');
});
test('convite: entra no whatsapp.json só na janela do dia e só com o WhatsApp ligado', () => {
  const ler = (dir: string) => JSON.parse(readFileSync(join(dir, 'whatsapp.json'), 'utf8')) as { mensagens: Array<{ id: string; texto: string; imagem?: string }> };
  const gerar = (extra: Record<string, string>, quando: Date) => {
    const dir = mkdtempSync(join(tmpdir(), 'convite-'));
    publicarControle(new Banco(':memory:'), lerConfig({ ...base, BLOG_PASTA: dir, ...extra }), { postados: 0 }, quando, 'dono/repo');
    return ler(dir);
  };
  const ao12 = gerar({}, as12).mensagens;
  assert.deepEqual(ao12.map((m) => m.id), ['convite:2026-10-08']);
  assert.equal(ao12[0]!.imagem, undefined, 'só texto');
  assert.deepEqual(gerar({}, as11).mensagens, []);
  assert.deepEqual(gerar({}, as16).mensagens, []);
  assert.deepEqual(gerar({ WHATSAPP_ATIVO: '0' }, as12).mensagens, []);
});

test('convite: o Telegram recebe uma vez por dia, em texto simples e sem prévia, e nunca duas vezes', async () => {
  const enviados: Array<{ chat_id: string; text: string; link_preview_options?: { is_disabled: boolean } }> = [];
  const f = (async (_url: string, init: any) => {
    enviados.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }) as unknown as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), 'convite-robo-'));
  const robo = new Robo({
    caminhoEnv: join(dir, '.env'),
    modeloEnv: '',
    caminhoBanco: ':memory:',
    envBase: { ...base, TELEGRAM_BOT_TOKEN: '1:abc', TELEGRAM_CHAT_ID: '@canal', BLOG_PASTA: dir },
    criarFontes: () => [],
    criarPublicador: (c) => new Telegram(c.telegram.token, c.telegram.chatId, f),
    silencioso: true,
  });
  assert.deepEqual(await robo.postarConviteAgora(as11), { postou: false, motivo: 'fora do dia ou da hora do convite' });
  assert.equal((await robo.postarConviteAgora(as12)).postou, true);
  assert.equal((await robo.postarConviteAgora(new Date(as12.getTime() + 600_000))).motivo, 'já postado hoje');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0]!.chat_id, '@canal');
  assert.equal(enviados[0]!.link_preview_options?.is_disabled, true);
  assert.match(enviados[0]!.text, /Se preferir receber de outro jeito/);
  assert.ok(!enviados[0]!.text.includes('<a '), 'texto simples, sem formatação');
  robo.fechar();
});