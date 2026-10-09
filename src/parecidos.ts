/**
 * "Mesmo tipo de produto": anúncios diferentes (outro vendedor, outro id) da mesma coisa, como três chapas de policarbonato.
 * A trava por id não pega esses casos, e o canal fica repetitivo.
 */

/** Palavras que não dizem o que o produto é (ligações, marketing, medidas). */
const GENERICAS = new Set(
  [
    'para', 'com', 'sem', 'de', 'da', 'do', 'das', 'dos', 'em', 'por', 'uma', 'uns', 'umas', 'pelo', 'pela', 'mais', 'menos', 'muito', 'super', 'ultra', 'mega',
    'kit', 'conjunto', 'combo', 'par', 'unidade', 'unidades', 'peca', 'pecas', 'novo', 'nova', 'novos', 'novas', 'original', 'premium', 'profissional', 'top',
    'promocao', 'oferta', 'ofertas', 'frete', 'gratis', 'pronta', 'pronto', 'entrega', 'envio', 'imediato', 'lancamento', 'barato', 'qualidade', 'resistente',
    'preto', 'preta', 'branco', 'branca', 'azul', 'verde', 'vermelho', 'vermelha', 'rosa', 'cinza', 'cores', 'cor', 'transparente', 'grande', 'pequeno', 'pequena', 'medio',
    'tamanho', 'modelo', 'universal', 'compativel', 'versao', 'linha', 'marca',
  ],
);

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** As palavras que identificam o produto: só letras, 4 ou mais, sem as genéricas e sem plural ("telhas" = "telha"). */
export function palavrasDoProduto(titulo: string): string[] {
  const vistas = new Set<string>();
  for (const bruta of semAcento(titulo.toLowerCase()).split(/[^a-z]+/)) {
    if (bruta.length < 4) continue;
    const p = bruta.length > 4 && bruta.endsWith('s') ? bruta.slice(0, -1) : bruta;
    if (!GENERICAS.has(p) && !GENERICAS.has(bruta)) vistas.add(p);
  }
  return [...vistas];
}

/**
 * Os dois títulos falam do mesmo tipo de produto? Sim quando dividem pelo menos 2 palavras que identificam o produto e pelo menos
 * metade das palavras do mais curto ("Telha Policarbonato Alveolar" e "Chapa Policarbonato Alveolar Cristal" sim; "Fone Bluetooth"
 * e "Caixa de Som Bluetooth" não, porque só dividem "bluetooth"). Título de uma palavra só compara essa palavra.
 */
export function mesmoTipoDeProduto(a: string, b: string): boolean {
  const pa = palavrasDoProduto(a);
  const pb = palavrasDoProduto(b);
  if (!pa.length || !pb.length) return false;
  const conjuntoB = new Set(pb);
  const comuns = pa.filter((p) => conjuntoB.has(p)).length;
  const menor = Math.min(pa.length, pb.length);
  return comuns >= Math.min(2, menor) && comuns / menor >= 0.5;
}

/** Melhor vendedor: a maior nota ganha; empate pela quantidade de vendas e, depois, pela pontuação. */
export function melhorVendedor<T extends { nota?: number; vendas?: number; pontos: number }>(ofertas: T[]): T {
  return [...ofertas].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0) || (b.vendas ?? 0) - (a.vendas ?? 0) || b.pontos - a.pontos)[0]!;
}

/** O título é do mesmo tipo de algum dos recentes? Devolve o primeiro que bate. */
export function parecidoComAlgum(titulo: string, recentes: string[]): string | undefined {
  return recentes.find((r) => mesmoTipoDeProduto(titulo, r));
}
