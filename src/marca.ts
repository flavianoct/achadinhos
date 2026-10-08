/** Identidade da marca Mata Preço: cores, símbolo (etiqueta de preço cortada por um raio) e fontes, usados no blog, na bio e nos painéis. */

export const CORES = { vermelho: '#E10600', vermelhoEscuro: '#A80400', amarelo: '#FFD60A', preto: '#0E0E10', cartao: '#17171B', borda: '#2A2A31', suave: '#A9A9B3' } as const;

/** Fontes da marca (Barlow Condensed nos títulos, Barlow no texto). Sem elas a página cai nas fontes do aparelho. */
export const FONTES = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800;1,900&family=Barlow:wght@400;500;600;700;800&display=swap">';

/** Os traços do símbolo num quadro de 200x200. `etiqueta` é a cor da etiqueta e `corte` a cor do fundo onde ele fica. */
function tracos(etiqueta: string, corte: string, raio: string = CORES.amarelo): string {
  return `<g transform="rotate(-18 100 100)"><path d="M26 100 L74 50 H164 Q176 50 176 62 V138 Q176 150 164 150 H74 Z" fill="${etiqueta}" stroke="${etiqueta}" stroke-width="10" stroke-linejoin="round"/><circle cx="70" cy="100" r="10" fill="${corte}"/></g><path d="M128 10 L82 106 H112 L90 190 L154 84 H122 L146 10 Z" fill="${raio}" stroke="${corte}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>`;
}

/** Símbolo solto, para ficar sobre o fundo da página (por padrão, o preto da marca). */
export function simbolo(tamanho = 34, etiqueta: string = CORES.vermelho, corte = 'var(--fundo,#0E0E10)'): string {
  return `<svg class="logo" viewBox="0 0 200 200" width="${tamanho}" height="${tamanho}" aria-hidden="true">${tracos(etiqueta, corte)}</svg>`;
}

/** Símbolo dentro de um quadrado vermelho de cantos arredondados (ícone do site e foto de perfil). */
export function simboloNoQuadro(x = 0, y = 0, lado = 200): string {
  const e = lado / 200;
  return `<g transform="translate(${x} ${y}) scale(${e})"><rect width="200" height="200" rx="44" fill="${CORES.vermelho}"/><g transform="translate(22 22) scale(.78)">${tracos('#ffffff', CORES.vermelho)}</g></g>`;
}

/** Ícone da aba do navegador. */
export const ICONE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${simboloNoQuadro()}</svg>`)}`;

/** O nome escrito como no logo: a última palavra fica em amarelo e riscada ("Mata Preço" vira MATA + PREÇO riscado). Recebe o nome já escapado. */
export function nomeDaMarca(nomeEscapado: string): string {
  const palavras = nomeEscapado.trim().split(/\s+/);
  if (palavras.length < 2) return `<span class="marca-nome">${nomeEscapado}</span>`;
  const ultima = palavras.pop()!;
  return `<span class="marca-nome">${palavras.join(' ')} <span class="risco">${ultima}</span></span>`;
}

/** CSS do nome da marca, igual em todas as páginas. `fundo` é a variável (ou cor) do fundo onde o nome fica. */
export function estiloDaMarca(fundo = 'var(--fundo)'): string {
  return `.marca-nome{font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-style:italic;font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:1;white-space:nowrap}.risco{position:relative;display:inline-block;color:${CORES.amarelo}}.risco::after{content:"";position:absolute;left:-4%;right:-4%;top:46%;height:.09em;background:${CORES.vermelho};border-radius:.05em;transform:rotate(-5deg);box-shadow:0 0 0 .03em ${fundo}}`;
}
