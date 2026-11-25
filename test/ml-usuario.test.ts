import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FonteMercadoLivreApi } from '../src/fontes/mercadolivre-api.ts';
import { cifrar, decifrar, linkDeAutorizacao } from '../src/ml-usuario.ts';

test('ML login de usuário: cifra e decifra o token; chave errada não abre', () => {
  const c = cifrar('TG-refresh-123', 'minha-chave');
  assert.ok(c.startsWith('v1:') && !c.includes('TG-refresh-123'), 'o token não aparece no texto guardado');
  assert.equal(decifrar(c, 'minha-chave'), 'TG-refresh-123');
  assert.equal(decifrar(c, 'outra-chave'), undefined);
  assert.equal(decifrar('lixo', 'minha-chave'), undefined);
  assert.match(linkDeAutorizacao('123', 'https://exemplo.com/'), /^https:\/\/auth\.mercadolivre\.com\.br\/authorization\?response_type=code&client_id=123&redirect_uri=https%3A%2F%2Fexemplo\.com%2F$/);
});

/** Um /oauth/token falso: responde conforme o grant_type e anota o que recebeu. */
function oauthFalso(respostas: Record<string, { access_token?: string; refresh_token?: string } | number>) {
  const pedidos: string[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const corpo = new URLSearchParams(String(init.body ?? ''));
    const grant = corpo.get('grant_type') ?? '';
    pedidos.push(`${String(url).replace(/^https:\/\/api\.mercadolibre\.com/, '')} ${grant} ${corpo.get('code') ?? corpo.get('refresh_token') ?? ''}`.trim());
    const r = respostas[grant];
    if (typeof r === 'number' || r === undefined) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: typeof r === 'number' ? r : 400 });
    return new Response(JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, pedidos };
}

/** O valor guardado é "<marca>|<cifrado>": abre só a parte cifrada. */
const aberto = (g: string | undefined, k: string) => decifrar(String(g).split('|')[1] ?? '', k);

const base = { clientId: 'id', clientSecret: 'segredo', mattWord: 'w', mattTool: 't', categorias: [] as string[] };

test('ML login de usuário: troca o código uma vez, guarda o refresh cifrado e depois só renova', async () => {
  let guardado: string | undefined;
  const guarda = { ler: () => guardado, gravar: (v: string) => void (guardado = v) };
  const usuario = { codigo: 'TG-codigo', chave: 'k', redirectUri: 'https://exemplo.com/', guarda };

  const a = oauthFalso({ authorization_code: { access_token: 'U1', refresh_token: 'R1' } });
  const api1 = new FonteMercadoLivreApi({ ...base, usuario }, a.f, 0);
  assert.equal(await (api1 as any).autenticar(), 'U1');
  assert.equal(api1.situacaoDoLogin, 'usuário');
  assert.equal(aberto(guardado, 'k'), 'R1', 'o refresh token fica guardado cifrado');
  assert.deepEqual(a.pedidos, ['/oauth/token authorization_code TG-codigo']);

  // Na rodada seguinte: renova pelo refresh token guardado (o código não é usado de novo) e guarda o novo.
  const b = oauthFalso({ refresh_token: { access_token: 'U2', refresh_token: 'R2' } });
  const api2 = new FonteMercadoLivreApi({ ...base, usuario }, b.f, 0);
  assert.equal(await (api2 as any).autenticar(), 'U2');
  assert.deepEqual(b.pedidos, ['/oauth/token refresh_token R1']);
  assert.equal(aberto(guardado, 'k'), 'R2');
});

test('ML login de usuário: sem chave usa o token do app; com o código recusado, também cai no app e diz o motivo', async () => {
  const semChave = oauthFalso({ client_credentials: { access_token: 'APP' } });
  const api = new FonteMercadoLivreApi({ ...base, usuario: { codigo: 'x', chave: '', redirectUri: 'https://exemplo.com/' } }, semChave.f, 0);
  assert.equal(await (api as any).autenticar(), 'APP');
  assert.equal(api.situacaoDoLogin, 'app');

  let guardado: string | undefined;
  const recusado = oauthFalso({ authorization_code: 400, client_credentials: { access_token: 'APP' } });
  const api2 = new FonteMercadoLivreApi({ ...base, usuario: { codigo: 'velho', chave: 'k', redirectUri: 'https://exemplo.com/', guarda: { ler: () => guardado, gravar: (v) => void (guardado = v) } } }, recusado.f, 0);
  assert.equal(await (api2 as any).autenticar(), 'APP');
  assert.match(api2.situacaoDoLogin, /^app \(login de usuário falhou: código de autorização recusado/);
  assert.equal(guardado, undefined);
});

test('ML login de usuário: um código novo no Secret vale mais que o refresh token guardado (permissões novas)', async () => {
  let guardado: string | undefined;
  const guarda = { ler: () => guardado, gravar: (v: string) => void (guardado = v) };
  const com = (codigo: string) => ({ ...base, usuario: { codigo, chave: 'k', redirectUri: 'https://exemplo.com/', guarda } });

  const a = oauthFalso({ authorization_code: { access_token: 'U1', refresh_token: 'R1' } });
  await (new FonteMercadoLivreApi(com('TG-1'), a.f, 0) as any).autenticar();
  assert.deepEqual(a.pedidos, ['/oauth/token authorization_code TG-1']);

  // Mesmo código: só renova.
  const b = oauthFalso({ refresh_token: { access_token: 'U2', refresh_token: 'R2' } });
  await (new FonteMercadoLivreApi(com('TG-1'), b.f, 0) as any).autenticar();
  assert.deepEqual(b.pedidos, ['/oauth/token refresh_token R1']);

  // Código diferente: troca o código primeiro e guarda o refresh novo.
  const c = oauthFalso({ authorization_code: { access_token: 'U3', refresh_token: 'R3' } });
  assert.equal(await (new FonteMercadoLivreApi(com('TG-2'), c.f, 0) as any).autenticar(), 'U3');
  assert.deepEqual(c.pedidos, ['/oauth/token authorization_code TG-2']);
  assert.equal(aberto(guardado, 'k'), 'R3');

  // Código novo recusado (venceu): cai no refresh que já existe.
  const d = oauthFalso({ authorization_code: 400, refresh_token: { access_token: 'U4', refresh_token: 'R4' } });
  assert.equal(await (new FonteMercadoLivreApi(com('TG-3'), d.f, 0) as any).autenticar(), 'U4');
  assert.deepEqual(d.pedidos, ['/oauth/token authorization_code TG-3', '/oauth/token refresh_token R3']);
});
