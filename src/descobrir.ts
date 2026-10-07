import { FonteShopee } from './fontes/shopee.ts';

const TIPO = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
const CONSULTA = `{ __schema {
  queryType { name fields { name description args { name type { ${TIPO} } } type { ${TIPO} } } }
  mutationType { name fields { name description args { name type { ${TIPO} } } type { ${TIPO} } } }
  types { kind name fields { name type { ${TIPO} } } }
} }`;

/** Palavras que indicam cupom, voucher ou promoção. */
const PISTAS = /voucher|coupon|cupom|cupon|promo|campaign|discount|deal|flash/i;

function nomeDoTipo(t: any): string {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return `${nomeDoTipo(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${nomeDoTipo(t.ofType)}]`;
  return t.name ?? '?';
}

function assinatura(campo: any): string {
  const args = (campo.args ?? []).map((a: any) => `${a.name}: ${nomeDoTipo(a.type)}`).join(', ');
  return `${campo.name}${args ? `(${args})` : ''}: ${nomeDoTipo(campo.type)}`;
}

/**
 * Pergunta à API de afiliados da Shopee o que ela oferece (introspecção do GraphQL) e devolve um relatório em Markdown:
 * as consultas e ações disponíveis e tudo que tem cara de cupom/voucher/promoção. Não imprime chaves.
 */
export async function descreverApiShopee(appId: string, secret: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const linhas: string[] = ['## API de afiliados da Shopee', ''];
  let esquema: any;
  try {
    esquema = (await new FonteShopee({ appId, secret }, fetchFn).consultar(CONSULTA))?.__schema;
  } catch (e) {
    linhas.push(`Não consegui ler o schema: ${(e as Error).message}`);
    linhas.push('', 'A Shopee pode ter desligado a introspecção. Nesse caso, confira a documentação no painel de afiliados (Open API).');
    return linhas.join('\n');
  }
  if (!esquema) {
    linhas.push('A API respondeu sem schema (introspecção desligada).');
    return linhas.join('\n');
  }

  const consultas: any[] = esquema.queryType?.fields ?? [];
  const acoes: any[] = esquema.mutationType?.fields ?? [];
  linhas.push(`### Consultas (${consultas.length})`, '', ...consultas.map((c) => `- \`${assinatura(c)}\`${c.description ? ` — ${String(c.description).replace(/\s+/g, ' ')}` : ''}`));
  linhas.push('', `### Ações (${acoes.length})`, '', ...acoes.map((c) => `- \`${assinatura(c)}\``));

  const tipos: any[] = (esquema.types ?? []).filter((t: any) => t.name && !t.name.startsWith('__') && t.kind === 'OBJECT');
  const achados: string[] = [];
  for (const c of [...consultas, ...acoes]) if (PISTAS.test(c.name)) achados.push(`consulta/ação \`${c.name}\``);
  for (const t of tipos) {
    if (PISTAS.test(t.name)) achados.push(`tipo \`${t.name}\`: ${(t.fields ?? []).map((f: any) => f.name).join(', ')}`);
    else {
      const campos = (t.fields ?? []).filter((f: any) => PISTAS.test(f.name)).map((f: any) => `${f.name}: ${nomeDoTipo(f.type)}`);
      if (campos.length) achados.push(`tipo \`${t.name}\` tem campos: ${campos.join(', ')}`);
    }
  }
  linhas.push('', '### Algo de cupom, voucher ou promoção?', '');
  linhas.push(...(achados.length ? achados.map((a) => `- ${a}`) : ['Nada encontrado com esses nomes (voucher, coupon, cupom, promo, campaign, discount, deal, flash).']));
  return linhas.join('\n');
}
