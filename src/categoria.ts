/**
 * Classifica a oferta por palavras do título.
 * Hoje serve para a hashtag e para as estatísticas; depois, para dividir em canais por nicho.
 * A ordem importa: a primeira categoria que casar vence.
 * Escreva as palavras sem acento e em minúsculas; o plural simples (+s) já é aceito.
 */
const REGRAS: Array<[categoria: string, palavras: string[]]> = [
  ['games', ['playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'gamer', 'joystick', 'gamepad', 'videogame']],
  ['pet', ['pet', 'cachorro', 'gato', 'racao', 'coleira', 'arranhador', 'caes']],
  ['bebe', ['bebe', 'fralda', 'infantil', 'mamadeira', 'chupeta', 'brinquedo']],
  [
    'tech',
    ['celular', 'smartphone', 'iphone', 'galaxy', 'xiaomi', 'notebook', 'tablet', 'fone', 'headset', 'bluetooth', 'ssd', 'pendrive', 'carregador', 'smartwatch', 'monitor', 'teclado', 'mouse', 'tv', 'smart tv', 'caixa de som', 'roteador', 'camera', 'power bank', 'cabo usb', 'echo dot', 'alexa', 'kindle'],
  ],
  [
    'casa',
    ['air fryer', 'fritadeira', 'panela', 'liquidificador', 'aspirador', 'cafeteira', 'ventilador', 'geladeira', 'micro-ondas', 'microondas', 'lencol', 'toalha', 'travesseiro', 'organizador', 'cozinha', 'luminaria', 'cadeira', 'mesa', 'colchao', 'lavadora', 'ferro de passar', 'sanduicheira', 'garrafa termica', 'pote'],
  ],
  ['beleza', ['perfume', 'maquiagem', 'batom', 'shampoo', 'creme', 'hidratante', 'secador', 'chapinha', 'barbeador', 'protetor solar', 'skincare', 'serum', 'esmalte']],
  ['esporte', ['academia', 'halter', 'bicicleta', 'bike', 'corrida', 'whey', 'creatina', 'suplemento', 'yoga', 'futebol', 'chuteira', 'esteira']],
  ['moda', ['tenis', 'camiseta', 'camisa', 'calca', 'vestido', 'bolsa', 'mochila', 'relogio', 'oculos', 'jaqueta', 'sandalia', 'meia', 'cueca', 'sutia', 'moletom']],
  ['ferramentas', ['furadeira', 'parafusadeira', 'ferramenta', 'chave de fenda', 'serra', 'trena', 'alicate']],
];

/** Minúsculas e sem acento, para comparar texto. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Verdadeiro se `palavra` aparece como palavra inteira (não como pedaço de outra). */
export function contemPalavra(textoNormalizado: string, palavra: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${escapar(normalizar(palavra))}s?([^a-z0-9]|$)`);
  return re.test(textoNormalizado);
}

export function categorizar(titulo: string): string {
  const t = normalizar(titulo);
  for (const [categoria, palavras] of REGRAS) {
    if (palavras.some((p) => contemPalavra(t, p))) return categoria;
  }
  return 'geral';
}
