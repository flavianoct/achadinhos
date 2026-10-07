import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore: módulo .mjs puro, sem tipos
import { codigoDoCanal, esperaAleatoria, podarEstado, podeEnviarAgora, selecionarPendentes, tipoDeDestino } from '../enviador/logica.mjs';

const AGORA = new Date('2026-10-03T15:00:00Z').getTime(); // 12h em Brasília
const HORA = 3_600_000;

test('enviador: só pega o que não foi enviado e ainda não envelheceu, da mais antiga para a mais nova', () => {
  const msgs = [
    { id: 'c', texto: 'c', criadoEm: AGORA - 10 * 60_000 },
    { id: 'a', texto: 'a', criadoEm: AGORA - 50 * 60_000 },
    { id: 'velha', texto: 'v', criadoEm: AGORA - 5 * HORA },
    { id: 'feita', texto: 'f', criadoEm: AGORA - 20 * 60_000 },
    { id: 'semtexto', texto: '', criadoEm: AGORA },
  ];
  const r = selecionarPendentes(msgs, { feita: AGORA - 1000 }, AGORA, 3 * HORA);
  assert.deepEqual(r.map((m: any) => m.id), ['a', 'c']);
});

test('enviador: respeita horário e limite por hora', () => {
  const base = { maximoPorHora: 2, horaInicio: 8, horaFim: 22 };
  assert.equal(podeEnviarAgora({ ...base, agora: AGORA, envios: [] }).pode, true);
  const cheio = podeEnviarAgora({ ...base, agora: AGORA, envios: [AGORA - 10 * 60_000, AGORA - 20 * 60_000] });
  assert.equal(cheio.pode, false);
  assert.match(cheio.motivo, /limite/);
  assert.equal(podeEnviarAgora({ ...base, agora: AGORA, envios: [AGORA - 2 * HORA, AGORA - 90 * 60_000] }).pode, true, 'envios com mais de 1h não contam');
  const madrugada = new Date('2026-10-03T05:00:00Z').getTime(); // 2h em Brasília
  const fora = podeEnviarAgora({ ...base, agora: madrugada, envios: [] });
  assert.equal(fora.pode, false);
  assert.match(fora.motivo, /horário/);
});

test('enviador: espera aleatória fica dentro dos limites e o histórico velho é podado', () => {
  assert.equal(esperaAleatoria(1000, 3000, () => 0), 1000);
  assert.equal(esperaAleatoria(1000, 3000, () => 1), 3000);
  assert.equal(esperaAleatoria(1000, 3000, () => 0.5), 2000);
  const e = podarEstado({ enviados: { velho: AGORA - 5 * 86_400_000, novo: AGORA - HORA }, envios: [AGORA - 5 * 86_400_000, AGORA - HORA] }, AGORA);
  assert.deepEqual(Object.keys(e.enviados), ['novo']);
  assert.equal(e.envios.length, 1);
});

test('enviador: entende grupo, canal e link de canal', () => {
  assert.deepEqual(tipoDeDestino('120363000000000000@g.us'), { tipo: 'grupo', jid: '120363000000000000@g.us' });
  assert.equal(tipoDeDestino('120363111@newsletter').tipo, 'canal');
  assert.deepEqual(tipoDeDestino('https://whatsapp.com/channel/0029VaAbC123'), { tipo: 'canal-por-link', codigo: '0029VaAbC123' });
  assert.equal(codigoDoCanal('nada'), null);
  assert.equal(tipoDeDestino('qualquer coisa').tipo, 'invalido');
});

test('enviador: link de convite de grupo vira destino "grupo-por-link", com ou sem parâmetros extras', () => {
  assert.deepEqual(tipoDeDestino('https://chat.whatsapp.com/KRJ3OtHhmZ10XfReNMTIaw'), { tipo: 'grupo-por-link', codigo: 'KRJ3OtHhmZ10XfReNMTIaw' });
  assert.deepEqual(tipoDeDestino('https://chat.whatsapp.com/KRJ3OtHhmZ10XfReNMTIaw?s=cl&p=a&mlu=4'), { tipo: 'grupo-por-link', codigo: 'KRJ3OtHhmZ10XfReNMTIaw' });
  assert.equal(tipoDeDestino('https://whatsapp.com/channel/0029VbDtCLD2UPBAGBZ4UO1W').tipo, 'canal-por-link');
  assert.equal(tipoDeDestino('https://exemplo.com/x').tipo, 'invalido');
});