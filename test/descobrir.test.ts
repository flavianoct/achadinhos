import assert from 'node:assert/strict';
import { test } from 'node:test';
import { descreverApiShopee } from '../src/descobrir.ts';

const tipo = (name: string) => ({ kind: 'SCALAR', name });
const esquema = {
  data: {
    __schema: {
      queryType: { name: 'Query', fields: [
        { name: 'productOfferV2', description: 'Produtos', args: [{ name: 'keyword', type: tipo('String') }], type: { kind: 'OBJECT', name: 'ProductOfferConnectionV2' } },
        { name: 'voucherList', args: [], type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'Voucher' } } },
      ] },
      mutationType: { name: 'Mutation', fields: [{ name: 'generateShortLink', args: [], type: tipo('String') }] },
      types: [
        { kind: 'OBJECT', name: 'Voucher', fields: [{ name: 'code', type: tipo('String') }] },
        { kind: 'OBJECT', name: 'ProductOfferV2', fields: [{ name: 'itemId', type: tipo('Int') }, { name: 'priceDiscountRate', type: tipo('Int') }] },
      ],
    },
  },
};
const resposta = (corpo: unknown) => (async () => new Response(JSON.stringify(corpo))) as unknown as typeof fetch;

test('descobrir: lista consultas e destaca o que tem cara de cupom, sem imprimir a chave', async () => {
  const texto = await descreverApiShopee('app', 'segredo-123', resposta(esquema));
  assert.match(texto, /productOfferV2\(keyword: String\): ProductOfferConnectionV2/);
  assert.match(texto, /voucherList: \[Voucher\]/);
  assert.match(texto, /consulta\/ação `voucherList`/);
  assert.match(texto, /tipo `Voucher`: code/);
  assert.match(texto, /priceDiscountRate: Int/);
  assert.ok(!texto.includes('segredo-123'));
});

test('descobrir: introspecção desligada ou erro da API vira explicação, não exceção', async () => {
  assert.match(await descreverApiShopee('a', 'b', resposta({ data: {} })), /introspecção desligada/);
  const erro = await descreverApiShopee('a', 'b', resposta({ errors: [{ message: 'x', extensions: { code: 10020 } }] }));
  assert.match(erro, /assinatura inválida/);
});
