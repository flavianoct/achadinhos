import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Banco } from '../src/db.ts';
import { reduzirFoto } from '../src/social.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const AGORA = new Date('2026-10-12T15:00:00Z');
const oferta = (id: string): OfertaAvaliada => ({ loja: 'shopee', idProduto: id, titulo: `Produto ${id}`, preco: 50, link: `https://s/${id}`, categoria: 'casa', pontos: 10 });

test('banco: a arte (svg e foto) some depois de 14 h, para o arquivo não passar do limite de 100 MB do GitHub', () => {
  const banco = new Banco(':memory:');
  const grande = 'x'.repeat(300_000);
  banco.guardarParaSocial(oferta('velha'), new Date(AGORA.getTime() - 20 * 3_600_000));
  banco.guardarParaSocial(oferta('nova'), new Date(AGORA.getTime() - 2 * 3_600_000));
  for (const l of banco.socialRecentes(48, 10, AGORA)) banco.salvarArteSocial(l.chave, grande, grande);
  banco.limpar(AGORA);
  const [nova, velha] = banco.socialRecentes(48, 10, AGORA);
  assert.equal(nova!.chave.includes('nova'), true);
  assert.equal(nova!.svg?.length, 300_000, 'a de 2 h continua com a arte');
  assert.equal(nova!.imagem?.length, 300_000);
  assert.equal(velha!.svg, undefined, 'a de 20 h perde a arte');
  assert.equal(velha!.imagem, undefined);
  assert.ok(velha!.dados.includes('velha'), 'mas a oferta continua (a bio e a vitrine usam)');
  assert.ok(banco.tamanhoEmMb() < 5);
});

test('foto: reduzirFoto encolhe a foto grande e deixa a pequena como está', async () => {
  const sharp = (await import('sharp')).default;
  const ruido = Buffer.alloc(1600 * 1600 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 7919) % 251;
  const grande = await sharp(ruido, { raw: { width: 1600, height: 1600, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const uri = `data:image/jpeg;base64,${grande.toString('base64')}`;
  const menor = (await reduzirFoto(uri))!;
  assert.ok(menor.length < uri.length / 2, `${uri.length} -> ${menor.length}`);
  const meta = await sharp(Buffer.from(menor.slice(menor.indexOf(',') + 1), 'base64')).metadata();
  assert.ok(meta.width! <= 800 && meta.height! <= 800);
  assert.equal(await reduzirFoto(undefined), undefined);
  const pequena = `data:image/jpeg;base64,${(await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64')}`;
  assert.equal(await reduzirFoto(pequena), pequena, 'não aumenta o que já é pequeno');
});
