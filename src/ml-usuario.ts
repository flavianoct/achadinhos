/**
 * Login de USUÁRIO no Mercado Livre (OAuth com código de autorização), para os recursos que o token do app não lê mais.
 *
 * Fluxo: o dono autoriza o app uma vez (abre o link de autorização, entra com a conta do ML e aprova). O ML devolve um código, que vai no
 * Secret ML_CODIGO. Na primeira rodada o robô troca o código por um token de acesso e um "refresh token"; nas seguintes, renova pelo
 * refresh token (o ML troca o refresh token a cada renovação, por isso o novo é guardado a cada rodada).
 *
 * O refresh token fica no banco do robô, que mora num ramo PÚBLICO do GitHub: por isso ele é guardado CIFRADO (AES-256-GCM) com a chave
 * do Secret ML_CHAVE. Sem a chave, o valor guardado não serve para nada.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Onde o refresh token cifrado fica guardado entre as rodadas (o banco do robô). */
export interface GuardaDoToken {
  ler(): string | undefined;
  gravar(valor: string): void;
}

export interface LoginDeUsuario {
  /** Código de autorização (Secret ML_CODIGO), usado uma vez só. */
  codigo?: string;
  /** Chave para cifrar o refresh token (Secret ML_CHAVE). Sem ela, o login de usuário fica desligado. */
  chave?: string;
  /** O endereço de retorno cadastrado no app do ML (precisa ser igual ao usado no link de autorização). */
  redirectUri: string;
  guarda?: GuardaDoToken;
}

const chaveDe = (segredo: string) => createHash('sha256').update(segredo, 'utf8').digest();

/** Cifra um texto com a chave (AES-256-GCM). Formato: "v1:" + base64(iv + tag + conteúdo). */
export function cifrar(texto: string, segredo: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chaveDe(segredo), iv);
  const conteudo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), conteudo]).toString('base64')}`;
}

/** Decifra o que cifrar() gerou. Chave errada ou texto estragado: undefined (nunca lança). */
export function decifrar(cifrado: string, segredo: string): string | undefined {
  try {
    if (!cifrado.startsWith('v1:')) return undefined;
    const b = Buffer.from(cifrado.slice(3), 'base64');
    const d = createDecipheriv('aes-256-gcm', chaveDe(segredo), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

/** O link que o dono abre para autorizar o app com a conta dele do Mercado Livre. */
export function linkDeAutorizacao(clientId: string, redirectUri: string): string {
  return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}
