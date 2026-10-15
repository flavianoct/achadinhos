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
test('enviador: destino de nicho recebe só o nicho dele; destino geral segue o filtro do geral', async () => {
  const { destinoAceita } = await import('../enviador/logica.mjs');
  const moda = { jid: 'a@g.us', nichos: ['moda'] };
  const geral = { jid: 'b@g.us' };
  assert.equal(destinoAceita(moda, 'moda'), true);
  assert.equal(destinoAceita(moda, 'tech'), false);
  assert.equal(destinoAceita(geral, 'tech'), true);
  assert.equal(destinoAceita(geral, undefined), true, 'mensagem antiga sem categoria vai ao geral');
  assert.equal(destinoAceita(geral, 'pet', { sem: ['pet'] }), false);
  assert.equal(destinoAceita(geral, 'casa', { nichos: ['tech'] }), false);
  assert.equal(destinoAceita(geral, 'tech', { nichos: ['tech'] }), true);
});

test('enviador: foto do Mercado Livre é pedida primeiro em JPEG (sem precisar do conversor); outras ficam como estão', async () => {
  const { enderecosDaFoto } = await import('../enviador/logica.mjs');
  assert.deepEqual(enderecosDaFoto('https://http2.mlstatic.com/D_Q_NP_2X_123-AB.webp'), ['https://http2.mlstatic.com/D_Q_NP_2X_123-AB.jpg', 'https://http2.mlstatic.com/D_Q_NP_2X_123-AB.webp']);
  assert.deepEqual(enderecosDaFoto('https://down-br.img.susercontent.com/file/abc'), ['https://down-br.img.susercontent.com/file/abc']);
  assert.deepEqual(enderecosDaFoto(undefined), []);
});

test('enviador: com maisNovaPrimeiro a oferta fresca sai antes da fila velha', async () => {
  const { selecionarPendentes, ritmoDoEnvio } = await import('../enviador/logica.mjs');
  const msgs = [{ id: 'a', texto: 'x', criadoEm: AGORA - 90 * 60_000 }, { id: 'b', texto: 'x', criadoEm: AGORA - 5 * 60_000 }, { id: 'c', texto: 'x', criadoEm: AGORA - 200 * 60_000 }];
  assert.deepEqual(selecionarPendentes(msgs, {}, AGORA, 120 * 60_000, true).map((m: any) => m.id), ['b', 'a']);
  assert.deepEqual(selecionarPendentes(msgs, {}, AGORA, 120 * 60_000).map((m: any) => m.id), ['a', 'b']);
  // O ritmo do robô vale mais que o config.json da VPS; sem ele, vale o config.json; sem nenhum, os padrões antigos.
  assert.deepEqual(ritmoDoEnvio({ maximoPorHora: 6, esperaMinSeg: 90, esperaMaxSeg: 240, idadeMaximaMin: 180, horaInicio: 8, horaFim: 22 }, { maximoPorHora: 10, esperaMinSeg: 60, esperaMaxSeg: 150, idadeMaximaMin: 120, maisNovaPrimeiro: true, horaInicio: 7, horaFim: 23 }), { maximoPorHora: 10, esperaMinSeg: 60, esperaMaxSeg: 150, idadeMaximaMin: 120, maisNovaPrimeiro: true, horaInicio: 7, horaFim: 23 });
  assert.equal(ritmoDoEnvio({ maximoPorHora: 6 }, {}).maximoPorHora, 6);
  assert.deepEqual(ritmoDoEnvio({}, undefined), { maximoPorHora: 6, esperaMinSeg: 90, esperaMaxSeg: 240, idadeMaximaMin: 180, maisNovaPrimeiro: false, horaInicio: 8, horaFim: 22 });
});

test('whatsapp.json: leva o ritmo do enviador definido no ajustes.env', async () => {
  const { lerConfig } = await import('../src/config.ts');
  const { montarWhatsapp } = await import('../src/exportar.ts');
  const w = montarWhatsapp(lerConfig({ WHATSAPP_MAX_POR_HORA: '12', WHATSAPP_ESPERA_MIN_SEG: '45', WHATSAPP_ESPERA_MAX_SEG: '100', WHATSAPP_MAIS_NOVA_PRIMEIRO: '0', HORA_INICIO: '7', HORA_FIM: '23' }), [], new Date(AGORA));
  assert.deepEqual(w.envio, { maximoPorHora: 12, esperaMinSeg: 45, esperaMaxSeg: 100, idadeMaximaMin: 45, maisNovaPrimeiro: false, horaInicio: 7, horaFim: 23 });
  assert.equal(montarWhatsapp(lerConfig({}), [], new Date(AGORA)).envio.maximoPorHora, 10);
});

test('enviador: oferta velha é descartada, mas o convite vale 3 h', async () => {
  const { selecionarPendentes } = await import('../enviador/logica.mjs');
  const msgs = [{ id: 'velha', texto: 'x', criadoEm: AGORA - 60 * 60_000 }, { id: 'nova', texto: 'x', criadoEm: AGORA - 10 * 60_000 }, { id: 'convite', loja: 'convite', texto: 'x', criadoEm: AGORA - 100 * 60_000 }];
  assert.deepEqual(selecionarPendentes(msgs, {}, AGORA, 45 * 60_000, true).map((m: any) => m.id), ['nova', 'convite']);
});
