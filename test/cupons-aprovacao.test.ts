import assert from 'node:assert/strict';
import { test } from 'node:test';
import { respostaDeBotao } from '../src/comandos.ts';
import { chaveDoCupom, type Cupom } from '../src/cupons.ts';
import { cuponsAprovados, enviarCandidatosDeCupom, textoDoCandidato } from '../src/cupons-aprovacao.ts';
import { Banco } from '../src/db.ts';

const agora = new Date('2026-11-08T11:00:00-03:00');
const env = { TELEGRAM_COMANDOS_CHAT: '123456' };
const c1: Cupom = { loja: 'mercadolivre', codigo: 'HOJECONSTRU', titulo: '15% OFF acima de R$ 79 em Ferramentas', link: 'https://meli.la/x', validoAte: '2026-11-08', detalhe: 'Até R$ 60' };
const c2: Cupom = { loja: 'mercadolivre', titulo: '10% OFF em itens selecionados', link: 'https://meli.la/x', validoAte: '2026-11-30' };

function telegramFalso(ok = true) {
  const enviadas: any[] = [];
  const falso = (async (_u: string, init?: RequestInit) => {
    enviadas.push(JSON.parse(String(init?.body)));
    return { ok, status: ok ? 200 : 500, json: async () => ({ ok }) } as Response;
  }) as unknown as typeof fetch;
  return { enviadas, falso };
}

test('cupons: o candidato chega com os botões e o que o cupom exige; nada é aprovado sozinho', async () => {
  const banco = new Banco(':memory:');
  const { enviadas, falso } = telegramFalso();
  assert.equal(await enviarCandidatosDeCupom(banco, env, 'T', false, async () => [c1], agora, falso), 0, 'desligado: não garimpa nem manda');
  assert.equal(await enviarCandidatosDeCupom(banco, {}, 'T', true, async () => [c1], agora, falso), 0, 'sem o ID do dono: não manda');
  assert.equal(enviadas.length, 0);
  assert.equal(await enviarCandidatosDeCupom(banco, env, 'T', true, async () => [c1, c2], agora, falso), 2);
  assert.match(enviadas[0].text, /Código: HOJECONSTRU[\s\S]*Vale até: 08\/11[\s\S]*Confira no app/);
  assert.match(enviadas[1].text, /Sem código: é só ativar na página/);
  const botoes = enviadas[0].reply_markup.inline_keyboard[0].map((b: any) => b.callback_data);
  assert.match(botoes[0], /^cp:ok:\d+$/);
  assert.match(botoes[1], /^cp:no:\d+$/);
  assert.deepEqual(cuponsAprovados(banco, agora), [], 'sem o seu toque, nenhum cupom entra na fila de postagem');
});

test('cupons: o toque aprova ou recusa uma vez só, e só o aprovado vigente entra na fila', async () => {
  const banco = new Banco(':memory:');
  const { falso } = telegramFalso();
  await enviarCandidatosDeCupom(banco, env, 'T', true, async () => [c1, c2], agora, falso);
  assert.match(respostaDeBotao('cp:ok:1', banco, agora).texto, /Aprovado/);
  assert.match(respostaDeBotao('cp:no:2', banco, agora).texto, /Ignorado/);
  assert.match(respostaDeBotao('cp:no:1', banco, agora).texto, /já foi decidido/, 'não dá para mudar de ideia por um toque repetido');
  assert.deepEqual(cuponsAprovados(banco, agora).map((c) => c.codigo), ['HOJECONSTRU']);
  assert.deepEqual(cuponsAprovados(banco, new Date('2026-11-09T11:00:00-03:00')), [], 'cupom aprovado que venceu sai da fila');
  for (const lixo of ['cp', 'cp:ok', 'cp:ok:x', 'cp:xx:1', 'cp:ok:-3', 'cp:ok:0']) assert.doesNotThrow(() => respostaDeBotao(lixo, banco, agora), lixo);
  assert.equal(respostaDeBotao('cp:ok:999', banco, agora).mudou, false, 'id inexistente não aprova nada');
});

test('cupons: não repergunta o mesmo cupom, respeita a janela de 3 h e o máximo por dia', async () => {
  const banco = new Banco(':memory:');
  const { enviadas, falso } = telegramFalso();
  assert.equal(await enviarCandidatosDeCupom(banco, env, 'T', true, async () => [c1], agora, falso), 1);
  assert.equal(await enviarCandidatosDeCupom(banco, env, 'T', true, async () => [c1], new Date(agora.getTime() + 3_600_000), falso), 0, 'mesma janela de 3 h: não garimpa de novo');
  assert.equal(await enviarCandidatosDeCupom(banco, env, 'T', true, async () => [c1, c2], new Date(agora.getTime() + 4 * 3_600_000), falso), 1, 'o c1 já foi visto; só o c2 é novo');
  banco.registrarCupom(chaveDoCupom({ ...c2, titulo: 'outro' }), agora);
  const muitos = Array.from({ length: 10 }, (_, i) => ({ ...c1, codigo: `COD${i}${i}${i}${i}`, titulo: `cupom ${i}` }));
  const total = await enviarCandidatosDeCupom(banco, env, 'T', true, async () => muitos, new Date(agora.getTime() + 8 * 3_600_000), falso);
  assert.ok(total + 2 <= 4, `no máximo 4 por dia (mandou ${total + 2})`);
  assert.ok(enviadas.length <= 4);
  assert.match(textoDoCandidato(c1), /Só vai para o canal e o WhatsApp se você tocar em Postar/);
});

test('cupons: se o Telegram não entregar, o candidato não fica pendente invisível e erros não lançam', async () => {
  const banco = new Banco(':memory:');
  const { falso } = telegramFalso(false);
  assert.equal(await enviarCandidatosDeCupom(banco, env, 'T', true, async () => [c1], agora, falso), 0);
  assert.equal(banco.candidatosDeCupom('pendente').length, 0);
  assert.equal(await enviarCandidatosDeCupom(new Banco(':memory:'), env, 'T', true, async () => { throw new Error('Promobit fora'); }, agora, falso), 0);
});
