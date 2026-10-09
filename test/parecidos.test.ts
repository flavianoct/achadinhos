import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerConfig } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { mesmoTipoDeProduto, palavrasDoProduto, parecidoComAlgum } from '../src/parecidos.ts';
import { postarProxima } from '../src/pipeline.ts';
import type { OfertaAvaliada } from '../src/types.ts';

// 12h em Brasília
const AGORA = new Date('2026-10-09T15:00:00Z');

test('parecidos: as palavras que identificam o produto ignoram ligações, marketing, medidas e plural', () => {
  assert.deepEqual(palavrasDoProduto('Telha Policarbonato Alveolar 6mm 2,10x6m Transparente Frete Grátis'), ['telha', 'policarbonato', 'alveolar']);
  assert.deepEqual(palavrasDoProduto('Telhas de Policarbonato'), ['telha', 'policarbonato']);
});

test('parecidos: o mesmo tipo de produto bate, produtos diferentes que dividem só uma palavra não', () => {
  assert.equal(mesmoTipoDeProduto('Telha Policarbonato Alveolar 6mm 2,10x6m', 'Chapa de Policarbonato Alveolar Cristal 4mm'), true);
  assert.equal(mesmoTipoDeProduto('Chapa Policarbonato Compacto 3mm', 'Telha Policarbonato Ondulada Colorida'), false, 'só divide "policarbonato": compacto x ondulada');
  assert.equal(mesmoTipoDeProduto('Fone de Ouvido Bluetooth TWS', 'Fone Ouvido Bluetooth Esportivo Sem Fio'), true);
  assert.equal(mesmoTipoDeProduto('Fone de Ouvido Bluetooth', 'Caixa de Som Bluetooth Portátil'), false);
  assert.equal(mesmoTipoDeProduto('Air Fryer 4L Digital', 'Panela Elétrica Digital 5L'), false);
  assert.equal(mesmoTipoDeProduto('', 'Fone Bluetooth'), false);
  assert.equal(parecidoComAlgum('Telha Policarbonato Alveolar', ['Fone Bluetooth', 'Chapa Policarbonato Alveolar 6mm']), 'Chapa Policarbonato Alveolar 6mm');
  assert.equal(parecidoComAlgum('Telha Policarbonato Alveolar', ['Fone Bluetooth']), undefined);
});

const oferta = (n: number, titulo: string, pontos: number): OfertaAvaliada => ({ loja: 'mercadolivre', idProduto: `MLB${n}`, titulo, preco: 50 + n, link: `https://x/${n}`, nota: 4.8, vendas: 2000, categoria: 'casa', pontos });

test('pipeline: três anúncios de policarbonato na fila saem como UM só; o resto da fila segue normal', async () => {
  const banco = new Banco(':memory:');
  banco.enfileirar(oferta(1, 'Telha Policarbonato Alveolar 6mm 2,10x6m', 90), AGORA);
  banco.enfileirar(oferta(2, 'Chapa de Policarbonato Alveolar Cristal 4mm', 80), AGORA);
  banco.enfileirar(oferta(3, 'Telhas Policarbonato Alveolar Transparente 10mm', 70), AGORA);
  banco.enfileirar(oferta(4, 'Organizador Multiuso Gaveta Cozinha', 60), AGORA);
  const publicados: string[] = [];
  const publicador = { async publicar(o: OfertaAvaliada) { publicados.push(o.titulo); } } as any;
  const config = lerConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', HORA_INICIO: '8', HORA_FIM: '23' });
  for (let i = 0; i < 4; i++) await postarProxima(publicador, banco, config, AGORA);
  assert.deepEqual(publicados, ['Telha Policarbonato Alveolar 6mm 2,10x6m', 'Organizador Multiuso Gaveta Cozinha']);
  assert.equal(banco.tamanhoDaFila(), 0, 'os repetidos saíram da fila');

  // Desligado por PARECIDOS_HORAS=0: volta a postar tudo.
  const b2 = new Banco(':memory:');
  b2.enfileirar(oferta(1, 'Telha Policarbonato Alveolar 6mm', 90), AGORA);
  b2.enfileirar(oferta(2, 'Chapa Policarbonato Alveolar Cristal', 80), AGORA);
  const p2: string[] = [];
  const c2 = lerConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', HORA_INICIO: '8', HORA_FIM: '23', PARECIDOS_HORAS: '0' });
  for (let i = 0; i < 2; i++) await postarProxima({ async publicar(o: OfertaAvaliada) { p2.push(o.titulo); } } as any, b2, c2, AGORA);
  assert.equal(p2.length, 2);

  // Passadas as 48 horas, o mesmo tipo de produto pode voltar.
  const b3 = new Banco(':memory:');
  b3.enfileirar(oferta(1, 'Telha Policarbonato Alveolar 6mm', 90), AGORA);
  const p3: string[] = [];
  await postarProxima({ async publicar(o: OfertaAvaliada) { p3.push(o.titulo); } } as any, b3, config, AGORA);
  const depois = new Date(AGORA.getTime() + 49 * 3_600_000);
  b3.enfileirar(oferta(2, 'Chapa Policarbonato Alveolar Cristal', 80), depois);
  await postarProxima({ async publicar(o: OfertaAvaliada) { p3.push(o.titulo); } } as any, b3, config, depois);
  assert.equal(p3.length, 2);
});

test('pipeline: entre anúncios repetidos, o melhor vendedor (maior nota) ganha, mesmo com pontuação menor', async () => {
  const banco = new Banco(':memory:');
  banco.enfileirar({ ...oferta(1, 'Telha Policarbonato Alveolar 6mm', 90), nota: 4.2, vendas: 9000 }, AGORA);
  banco.enfileirar({ ...oferta(2, 'Chapa Policarbonato Alveolar Cristal', 70), nota: 4.9, vendas: 300 }, AGORA);
  banco.enfileirar({ ...oferta(3, 'Telhas Policarbonato Alveolar Transparente', 80), nota: 4.6, vendas: 5000 }, AGORA);
  const publicados: string[] = [];
  const config = lerConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', HORA_INICIO: '8', HORA_FIM: '23' });
  for (let i = 0; i < 3; i++) await postarProxima({ async publicar(o: OfertaAvaliada) { publicados.push(o.idProduto); } } as any, banco, config, AGORA);
  assert.deepEqual(publicados, ['MLB2'], 'só o de nota 4,9 sai; os outros foram apagados da fila');
  assert.equal(banco.tamanhoDaFila(), 0);
});
