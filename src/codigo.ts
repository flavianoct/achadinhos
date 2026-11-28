import type { Banco } from './db.ts';

/**
 * "Oferta nº 247 · link na bio": cada produto que sai no Instagram ganha um número fixo. Quem vê o post abre a página do link da bio,
 * digita o número e cai no produto. Não depende de comentário nem de direct (que a Meta limita enquanto o app não tem acesso avançado).
 */

export interface ProdutoNumerado {
  titulo: string;
  link: string;
  imagem?: string;
  loja?: string;
}

/** Convite de grupo ou canal e a própria página da bio não são produtos: não ganham número. */
const naoEhProduto = (link: string) => !/^https:\/\//i.test(link) || /chat\.whatsapp\.com|whatsapp\.com\/channel|\/\/t\.me\/|\/bio\.html/i.test(link);

/** A linha do código, para um ou vários produtos. `direct`: há quem responda "eu quero" no direct (a automação do ManyChat). */
export function linhaDoCodigo(numeros: number[], direct = false): string {
  const quais = numeros.length === 1 ? `Oferta nº ${numeros[0]}` : `Ofertas nº ${numeros.join(', ').replace(/, (\d+)$/, ' e $1')}`;
  const linha = `🔎 ${quais} · link na bio (digite o número)`;
  return direct ? `${linha}\n📩 Ou manda EU QUERO no nosso direct que o link chega lá` : linha;
}

/**
 * A legenda com a linha do código logo depois da primeira linha (que aparece antes do "mais"). Dá o número a cada produto (o mesmo link
 * sempre recebe o mesmo número). Sem produto, devolve a legenda como veio.
 */
export function comCodigo(legenda: string, produtos: ProdutoNumerado[], banco: Banco, agora: Date, direct = false): string {
  const numeros = produtos.filter((p) => !naoEhProduto(p.link)).map((p) => banco.numeroDaOferta(p, agora));
  if (!numeros.length) return legenda;
  const [primeira, ...resto] = legenda.split('\n');
  return [primeira, linhaDoCodigo([...new Set(numeros)], direct), ...resto].join('\n');
}
