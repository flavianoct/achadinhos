import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerConfig } from '../src/config.ts';
import { vagasLiberadas } from '../src/pipeline.ts';

const config = lerConfig({ HORA_INICIO: '7', HORA_FIM: '23', MAX_POSTS_POR_DIA: '220', RITMO_DISTRIBUIR: '1' });
/** Hora de Brasília (UTC-3). */
const as = (hhmm: string) => new Date(`2026-11-28T${hhmm}:00-03:00`);

test('as vagas do dia abrem aos poucos, da abertura ao fechamento', () => {
  assert.equal(vagasLiberadas(config, as('07:00')), 7);
  assert.equal(vagasLiberadas(config, as('13:00')), 90);
  assert.equal(vagasLiberadas(config, as('20:00')), 186);
  assert.equal(vagasLiberadas(config, as('22:45')), 220);
});

test('à noite ainda sobram vagas, mesmo com rodadas a mais de manhã', () => {
  assert.ok(config.ritmo.maxPostsPorDia - vagasLiberadas(config, as('20:00')) >= 30);
});

test('sem RITMO_DISTRIBUIR fica desligado', () => {
  assert.equal(lerConfig({}).ritmo.distribuirNoDia, false);
});
