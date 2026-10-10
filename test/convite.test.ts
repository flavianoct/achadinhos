import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { convitesDeHoje, horariosDosConvites, linksParaConvidar, saudacaoDaHora, textoDoConvite } from '../src/convite.ts';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { publicarControle } from '../src/exportar.ts';
import { atualizarRodape, montarMensagemWhatsapp, rodapeDoWhatsapp } from '../src/mensagem.ts';
import { Robo } from '../src/robo.ts';
import { Telegram } from '../src/telegram.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const canal = 'https://whatsapp.com/channel/0029VbDtCLD2UPBAGBZ4UO1W';
const grupo = 'https://chat.whatsapp.com/KRJ3OtHhmZ10XfReNMTIaw';
const base = { BLOG_URL: 'https://flavianoct.github.io/achadinhos', BLOG_TELEGRAM: 'https://t.me/canal', BLOG_INSTAGRAM: '@perfil', BLOG_WHATSAPP: canal, WHATSAPP_DESTINOS: `${canal},${grupo}`, HORA_INICIO: '8', HORA_FIM: '23', CONVITE_ATIVO: '1' };
const DIA = '2026-10-08';
const noMs = (hhmm: string) => Date.parse(`${DIA}T${hhmm}:00-03:00`);

test('convite: curto, abre com a vantagem principal (ninguém vê o seu número, não incomoda como grupo) e leva ao canal', () => {
  const config = lerConfig(base);
  assert.deepEqual(linksParaConvidar(config, 'telegram').map((l) => l.rotulo), ['Canal do WhatsApp'], 'o pitch é do canal, não do grupo');
  assert.deepEqual(linksParaConvidar(config, 'whatsapp').map((l) => l.rotulo), ['Canal do Telegram']);
  const noTelegram = textoDoConvite(config, 'telegram', 0, 9);
  assert.match(noTelegram, /^Bom dia, /);
  assert.ok(noTelegram.includes(canal) && !noTelegram.includes(grupo));
  assert.match(noTelegram, /✅ Ninguém vê o seu número\n✅ Não incomoda como grupo/);
  assert.equal((noTelegram.match(/✅/g) ?? []).length, 3);
  assert.ok(noTelegram.split('\n').length <= 9 && noTelegram.length < 360, 'curto');
  assert.match(noTelegram, /\n👇 [^\n]+\n📢 Canal do WhatsApp: https:/, 'uma chamada para agir logo acima do link');
  const noWhatsapp = textoDoConvite(config, 'whatsapp', 0, 20);
  assert.match(noWhatsapp, /^Boa noite, /);
  assert.ok(noWhatsapp.includes('https://t.me/canal'));
  assert.match(noWhatsapp, /Não incomoda como grupo/);
  assert.deepEqual([saudacaoDaHora(8), saudacaoDaHora(12), saudacaoDaHora(17), saudacaoDaHora(18), saudacaoDaHora(23)], ['Bom dia', 'Boa tarde', 'Boa tarde', 'Boa noite', 'Boa noite']);
  // Sem canal do WhatsApp, só com o grupo: leva ao grupo e NÃO promete que ninguém vê o número (num grupo todos veem).
  const soGrupo = textoDoConvite(lerConfig({ BLOG_TELEGRAM: 'https://t.me/canal', WHATSAPP_DESTINOS: grupo }), 'telegram', 0, 9);
  assert.ok(soGrupo.includes(grupo) && !soGrupo.includes('Ninguém vê o seu número'));
  // Sem para onde convidar: texto vazio.
  assert.equal(textoDoConvite(lerConfig({ BLOG_TELEGRAM: 'https://t.me/canal' }), 'telegram', 0, 9), '', 'sem WhatsApp configurado');
  assert.equal(textoDoConvite(lerConfig({ BLOG_WHATSAPP: canal }), 'whatsapp', 0, 9), '', 'sem Telegram configurado');
  // As variantes dizem coisas diferentes e todas são curtas.
  const todas = Array.from({ length: 8 }, (_, v) => textoDoConvite(config, 'telegram', v, 14));
  assert.equal(new Set(todas).size, 8);
  for (const t of todas) assert.ok(t.length < 360);
});

test('convite: os horários são sorteados por dia, espalhados no horário de postagem e sempre os mesmos para o mesmo dia', () => {
  const config = lerConfig(base);
  const a = horariosDosConvites(config, DIA);
  assert.equal(a.length, 3);
  assert.deepEqual(horariosDosConvites(config, DIA), a, 'o mesmo dia sorteia o mesmo');
  assert.notDeepEqual(horariosDosConvites(config, '2026-10-09'), horariosDosConvites(config, DIA).map((t) => t + 86_400_000), 'outro dia, outro sorteio');
  // Dentro do horário (9h às 22h), em ordem, e uma hora ou mais de distância entre vizinhos (uma faixa cada).
  for (const t of a) assert.ok(t >= noMs('09:00') && t <= noMs('22:00'), new Date(t).toISOString());
  assert.deepEqual([...a].sort((x, y) => x - y), a);
  for (let i = 1; i < a.length; i++) assert.ok(a[i]! - a[i - 1]! >= 3_600_000 / 2, 'espalhados');
  assert.equal(horariosDosConvites(lerConfig({ ...base, CONVITES_POR_DIA: '0' }), DIA).length, 0);
  assert.equal(horariosDosConvites(lerConfig({ ...base, CONVITES_POR_DIA: '50' }), DIA).length, 6, 'no máximo 6 por dia');
});

test('convite: só aparece na hora sorteada e até 3 horas depois; desligado não aparece; cada convite tem texto e id próprios', () => {
  const config = lerConfig(base);
  const [primeiro, segundo] = horariosDosConvites(config, DIA) as [number, number];
  assert.deepEqual(convitesDeHoje(config, new Date(primeiro - 60_000)), [], 'antes da hora');
  const naHora = convitesDeHoje(config, new Date(primeiro + 60_000));
  assert.deepEqual(naHora.map((c) => c.id), [`convite:${DIA}:0`]);
  assert.equal(naHora[0]!.criadoEm, primeiro);
  assert.deepEqual(convitesDeHoje(config, new Date(primeiro + 4 * 3_600_000)).filter((c) => c.numero === 0), [], 'depois da validade (3 horas)');
  const depois = convitesDeHoje(config, new Date(segundo + 60_000));
  assert.ok(depois.some((c) => c.numero === 1));
  assert.deepEqual(convitesDeHoje(lerConfig({ ...base, CONVITE_ATIVO: '0' }), new Date(primeiro + 60_000)), [], 'desligado');
  // Convites do mesmo dia usam variantes diferentes (nunca o mesmo texto duas vezes).
  const textos = horariosDosConvites(config, DIA).flatMap((t) => convitesDeHoje(config, new Date(t + 1000)).filter((c) => c.criadoEm === t).map((c) => c.textoTelegram.replace(/^(Bom dia|Boa tarde|Boa noite)/, '')));
  assert.equal(new Set(textos).size, 3);
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
test('rodapé: mensagem que já estava na fila sai com o link novo do Instagram (a conta mudou de @)', () => {
  const o: OfertaAvaliada = { loja: 'shopee', idProduto: '1', titulo: 'Produto', preco: 10, link: 'https://s.shopee.com.br/x', categoria: 'casa', pontos: 1 };
  const antiga = montarMensagemWhatsapp(o, rodapeDoWhatsapp(lerConfig({ ...base, BLOG_INSTAGRAM: 'nome_antigo' })));
  const nova = lerConfig({ ...base, BLOG_INSTAGRAM: 'mataprecooficial' });
  const atualizada = atualizarRodape(antiga, nova);
  assert.equal(atualizada, montarMensagemWhatsapp(o, rodapeDoWhatsapp(nova)));
  assert.ok(atualizada.includes('instagram.com/mataprecooficial/') && !atualizada.includes('nome_antigo'));
  assert.equal(atualizarRodape(antiga, lerConfig({ ...base, WHATSAPP_RODAPE: '0' })), montarMensagemWhatsapp(o), 'rodapé desligado: sai sem rodapé');
  assert.equal(atualizarRodape(montarMensagemWhatsapp(o), nova), montarMensagemWhatsapp(o), 'mensagem sem rodapé não muda');
});

test('convite: entra no whatsapp.json só na janela de cada convite e só com o WhatsApp ligado, em texto simples', () => {
  const ler = (dir: string) => JSON.parse(readFileSync(join(dir, 'whatsapp.json'), 'utf8')) as { mensagens: Array<{ id: string; texto: string; imagem?: string }> };
  const gerar = (extra: Record<string, string>, quando: Date) => {
    const dir = mkdtempSync(join(tmpdir(), 'convite-'));
    publicarControle(new Banco(':memory:'), lerConfig({ ...base, BLOG_PASTA: dir, ...extra }), { postados: 0 }, quando, 'dono/repo');
    return ler(dir);
  };
  const [primeiro, segundo] = horariosDosConvites(lerConfig(base), DIA) as [number, number];
  const naHora = gerar({}, new Date(primeiro + 60_000)).mensagens;
  assert.deepEqual(naHora.map((m) => m.id), [`convite:${DIA}:0`]);
  assert.equal(naHora[0]!.imagem, undefined, 'só texto');
  assert.ok(naHora[0]!.texto.includes('https://t.me/canal'), 'o WhatsApp convida para o Telegram');
  assert.deepEqual(gerar({}, new Date(primeiro - 60_000)).mensagens, []);
  assert.deepEqual(gerar({ WHATSAPP_ATIVO: '0' }, new Date(primeiro + 60_000)).mensagens, []);
  // Perto do segundo convite, o primeiro ainda está na validade e o segundo já entrou: o enviador manda cada id uma vez só.
  assert.ok(gerar({}, new Date(segundo + 60_000)).mensagens.some((m) => m.id === `convite:${DIA}:1`));
});

test('convite: o Telegram recebe cada convite do dia uma vez só, em texto simples e sem prévia, convidando para o WhatsApp', async () => {
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
  const [primeiro, segundo] = horariosDosConvites(robo.config, DIA) as [number, number];
  assert.deepEqual(await robo.postarConviteAgora(new Date(primeiro - 60_000)), { postou: false, motivo: 'fora do dia ou da hora do convite' });
  assert.equal((await robo.postarConviteAgora(new Date(primeiro + 60_000))).postou, true);
  assert.equal((await robo.postarConviteAgora(new Date(primeiro + 600_000))).motivo, 'já postado hoje', 'o mesmo convite nunca sai duas vezes');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0]!.chat_id, '@canal');
  assert.equal(enviados[0]!.link_preview_options?.is_disabled, true);
  assert.ok(enviados[0]!.text.includes(canal), 'convida para o canal do WhatsApp');
  assert.ok(!enviados[0]!.text.includes('<a '), 'texto simples, sem formatação');
  // O segundo convite do dia sai na hora dele, com um texto diferente.
  assert.equal((await robo.postarConviteAgora(new Date(segundo + 60_000))).postou, true);
  assert.equal(enviados.length, 2);
  assert.notEqual(enviados[0]!.text.replace(/^[^,]+,/, ''), enviados[1]!.text.replace(/^[^,]+,/, ''));
  robo.fechar();
});
