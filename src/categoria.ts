/**
 * Classifica a oferta por palavras do título, em dois passos:
 *  1. cada categoria soma pontos pelas palavras que aparecem (palavra inteira, sem acento, plural simples);
 *     palavra nas 4 primeiras do título vale o dobro, porque o nome do produto vem primeiro;
 *  2. vence a categoria com mais pontos; no empate, a que vem primeiro na lista abaixo.
 * Assim "Relógio Smartwatch Bluetooth" vira tech (2 palavras) e não moda (1), e anúncio sem palavra
 * conhecida fica em "geral" em vez de ser chutado.
 * Escreva as palavras sem acento e em minúsculas.
 */
const REGRAS: Array<[categoria: string, palavras: string[]]> = [
  ['games', ['playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'gamer', 'joystick', 'gamepad', 'videogame']],
  ['pet', ['pet', 'cachorro', 'gato', 'racao', 'coleira', 'arranhador', 'caes']],
  ['bebe', ['bebe', 'fralda', 'infantil', 'mamadeira', 'chupeta', 'brinquedo']],
  [
    'tech',
    ['celular', 'smartphone', 'iphone', 'galaxy', 'xiaomi', 'notebook', 'tablet', 'fone', 'headset', 'bluetooth', 'ssd', 'pendrive', 'carregador', 'smartwatch', 'monitor', 'teclado', 'mouse', 'tv', 'smart tv', 'caixa de som', 'roteador', 'camera', 'power bank', 'cabo usb', 'echo dot', 'alexa', 'kindle', 'notebook gamer', 'webcam', 'impressora', 'fone de ouvido', 'earbuds'],
  ],
  [
    'casa',
    ['air fryer', 'fritadeira', 'panela', 'liquidificador', 'aspirador', 'cafeteira', 'ventilador', 'geladeira', 'micro-ondas', 'microondas', 'lencol', 'toalha', 'travesseiro', 'organizador', 'cozinha', 'luminaria', 'cadeira', 'mesa', 'colchao', 'lavadora', 'ferro de passar', 'sanduicheira', 'garrafa termica', 'pote', 'frigideira', 'edredom', 'cortina', 'talher', 'cobertor', 'lixeira', 'jogo de panelas', 'airfryer'],
  ],
  ['beleza', ['perfume', 'maquiagem', 'batom', 'shampoo', 'creme', 'hidratante', 'secador', 'chapinha', 'barbeador', 'protetor solar', 'skincare', 'serum', 'esmalte', 'condicionador', 'sabonete', 'desodorante', 'rimel', 'base facial']],
  ['esporte', ['academia', 'halter', 'bicicleta', 'bike', 'corrida', 'whey', 'creatina', 'suplemento', 'yoga', 'futebol', 'chuteira', 'esteira', 'kettlebell', 'bola de futebol', 'luva de boxe', 'tapete de yoga']],
  ['moda', ['tenis', 'camiseta', 'camisa', 'calca', 'vestido', 'bolsa', 'mochila', 'relogio', 'oculos', 'jaqueta', 'sandalia', 'meia', 'cueca', 'sutia', 'moletom', 'bermuda', 'blusa', 'chinelo', 'cinto', 'carteira', 'pijama', 'legging']],
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

/** Nome para mostrar de cada categoria (nicho) nos painéis e nas mensagens. */
export const NICHOS: Record<string, { nome: string; emoji: string }> = {
  tech: { nome: 'Eletrônicos', emoji: '📱' },
  games: { nome: 'Games', emoji: '🎮' },
  moda: { nome: 'Moda', emoji: '👕' },
  casa: { nome: 'Casa & Cozinha', emoji: '🏠' },
  esporte: { nome: 'Esportes', emoji: '🏋️' },
  beleza: { nome: 'Beleza', emoji: '💄' },
  bebe: { nome: 'Bebê & Infantil', emoji: '🧸' },
  pet: { nome: 'Pet', emoji: '🐶' },
  ferramentas: { nome: 'Ferramentas', emoji: '🔧' },
  geral: { nome: 'Geral', emoji: '🛍️' },
};

/** Todas as chaves de categoria que o robô conhece. */
export const CATEGORIAS: string[] = Object.keys(NICHOS);

export function nomeDoNicho(categoria: string): string {
  return NICHOS[categoria]?.nome ?? categoria;
}

/**
 * Ajustes das palavras vindos do ajustes.env (NICHO_PALAVRAS_MODA=cropped,biquini,-relogio):
 * palavra comum soma à lista do nicho; com "-" na frente, tira a palavra do nicho.
 */
let ajustes: Record<string, { mais: string[]; menos: string[] }> = {};

export function definirPalavrasDosNichos(porNicho: Record<string, string[]>): void {
  ajustes = {};
  for (const [nicho, lista] of Object.entries(porNicho)) {
    const mais = lista.filter((p) => !p.startsWith('-')).map(normalizar);
    const menos = lista.filter((p) => p.startsWith('-')).map((p) => normalizar(p.slice(1)));
    ajustes[nicho] = { mais, menos };
  }
}

function regrasEmVigor(): Array<[string, string[]]> {
  const regras: Array<[string, string[]]> = REGRAS.map(([c, palavras]) => {
    const a = ajustes[c];
    return [c, a ? [...palavras.filter((p) => !a.menos.includes(p)), ...a.mais] : palavras];
  });
  // Palavras para "geral" não fazem sentido (é o que sobra); nicho fora da lista não existe.
  return regras;
}

/** Pontos de cada categoria que casou com o título (só as que casaram). Serve para entender e testar a decisão. */
export function pontuarCategorias(titulo: string): Array<{ categoria: string; pontos: number }> {
  const t = normalizar(titulo);
  const inicio = t.split(/\s+/).slice(0, 4).join(' ');
  const resultado: Array<{ categoria: string; pontos: number }> = [];
  for (const [categoria, palavras] of regrasEmVigor()) {
    let pontos = 0;
    for (const p of palavras) {
      if (!contemPalavra(t, p)) continue;
      pontos += contemPalavra(inicio, p) ? 2 : 1;
    }
    if (pontos > 0) resultado.push({ categoria, pontos });
  }
  return resultado;
}

export function categorizar(titulo: string): string {
  let melhor: { categoria: string; pontos: number } | undefined;
  for (const c of pontuarCategorias(titulo)) {
    if (!melhor || c.pontos > melhor.pontos) melhor = c; // empate: fica a primeira da lista
  }
  return melhor?.categoria ?? 'geral';
}
