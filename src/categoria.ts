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

/**
 * Palavras a mais de cada nicho (produtos que caíam em "geral" e escondiam moda, beleza e outros nichos dos grupos).
 * Ficam separadas da lista principal só para ser fácil acrescentar mais.
 */
const PALAVRAS_EXTRAS: Record<string, string[]> = {
  pet: ['cao', 'gaiola', 'calopsita', 'periquito', 'passaro', 'viveiro', 'aquario', 'caixa de transporte', 'comedouro', 'bebedouro', 'tapete higienico', 'granulado', 'formula natural'],
  bebe: ['babador', 'berco', 'enxoval', 'mordedor', 'pelucia', 'boneca', 'carrinho de bebe', 'cadeirinha', 'lenco umedecido', 'banheira', 'quebra-cabeca', 'lego', 'educativo'],
  tech: ['hub usb', 'hd externo', 'nobreak', 'no break', 'estabilizador', 'pilha', 'bateria recarregavel', 'adaptador', 'projetor', 'tela de projecao', 'comunicador', 'radio comunicador', 'cartao de memoria', 'micro sd', 'pen drive', 'placa de video', 'processador', 'gabinete', 'tomada inteligente', 'drone', 'gopro', 'airpods', 'relogio inteligente', 'controle remoto'],
  casa: ['almofada', 'futon', 'colchonete', 'chaleira', 'jarra', 'limpeza', 'vassoura', 'rodo', 'mop', 'balde', 'tapete', 'espelho', 'prateleira', 'varal', 'cabide', 'caneca', 'copo', 'marmita', 'faca', 'tabua', 'ralador', 'assadeira', 'umidificador', 'purificador', 'piscina', 'sofa', 'estante', 'armario', 'decoracao', 'quadro', 'vaso', 'travesseiros', 'alvejante', 'detergente'],
  beleza: ['prancha', 'alisador', 'alisadora', 'modeladora', 'cacheadora', 'cilios', 'gloss', 'mascara facial', 'mascara capilar', 'depilador', 'escova secadora', 'cabelo', 'unha', 'corretivo', 'pincel', 'sombra', 'delineador', 'tonico', 'tintura', 'leave-in', 'oleo capilar', 'acido hialuronico', 'vitamina c', 'eye cream', 'cream', 'lip', 'maquina de cortar', 'aparador', 'body splash', 'colonia', 'kit capilar', 'finalizador', 'gel'],
  esporte: ['bola', 'basquete', 'volei', 'boxe', 'muaythai', 'protetor bucal', 'corda de pular', 'faixa elastica', 'caneleira', 'shaker', 'patins', 'skate', 'natacao', 'barraca', 'camping', 'pesca', 'anilha', 'proteina', 'pre treino', 'joelheira', 'luva de academia', 'garrafa academia', 'squeeze'],
  moda: ['short', 'saia', 'cropped', 'regata', 'camisola', 'biquini', 'maio', 'macacao', 'cardigan', 'casaco', 'blazer', 'jeans', 'bone', 'gorro', 'cachecol', 'gravata', 'mala', 'sapato', 'sapatilha', 'bota', 'tamanco', 'rasteirinha', 'slide', 'lingerie', 'calcinha', 'colete', 'polo', 'suspensorio', 'pulseira', 'colar', 'brinco', 'anel', 'bijuteria', 'tiara', 'lenco', 'pochete', 'necessaire', 'bolsa transversal', 'carteira masculina'],
  ferramentas: ['talha', 'terminal', 'conector eletrico', 'pontas', 'bits', 'soquete', 'maleta de ferramentas', 'martelo', 'esmerilhadeira', 'lixadeira', 'compressor', 'solda', 'multimetro', 'fita isolante', 'refletor', 'holofote', 'lanterna', 'nivel', 'parafuso', 'broca', 'pulverizador', 'bomba submersa', 'mangueira', 'cadeado', 'fechadura', 'extensao eletrica', 'disco de corte', 'chave'],
};

/** Palavra de pet quase nunca é ambígua ("cachorro", "gato", "pet"), então vale em dobro contra as palavras de casa e moda do mesmo anúncio (cama colchonete almofada PARA CACHORRO). */
const PESO_DO_NICHO: Record<string, number> = { pet: 2 };

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
    const todas = [...palavras, ...(PALAVRAS_EXTRAS[c] ?? [])];
    return [c, a ? [...todas.filter((p) => !a.menos.includes(p)), ...a.mais] : todas];
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
      pontos += (contemPalavra(inicio, p) ? 2 : 1) * (PESO_DO_NICHO[categoria] ?? 1);
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
