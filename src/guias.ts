import { contemPalavra, normalizar } from './categoria.ts';
import type { Oferta, OfertaAvaliada } from './types.ts';

/**
 * Guias de compra: páginas fixas do tipo "Melhores fones bluetooth de 2026".
 * Diferente do "Top do dia" (que some em semanas), o guia tem endereço permanente e é reescrito
 * com os melhores produtos que o robô viu nos últimos dias. É esse tipo de página que aparece em buscas.
 */

export interface TipoDeGuia {
  /** Vai no endereço: melhores-<slug>.html */
  slug: string;
  /** Plural, em minúsculas: "fones de ouvido bluetooth". */
  nome: string;
  /** Categoria do robô (tech, casa...), usada para agrupar. */
  categoria: string;
  /** Todos os grupos precisam casar; dentro de um grupo basta uma palavra. */
  incluir: string[][];
  /** Se qualquer uma aparecer no título, o produto não entra (acessórios, peças). */
  excluir: string[];
  /** O que o leitor deve conferir antes de comprar. Texto fixo, sem inventar nada sobre os produtos. */
  criterios: string[];
}

const ACESSORIOS = ['capa', 'case', 'pelicula', 'suporte', 'cabo', 'adaptador', 'refil', 'peca', 'pecas', 'acessorio', 'acessorios'];

export const TIPOS_DE_GUIA: TipoDeGuia[] = [
  {
    slug: 'fones-bluetooth',
    nome: 'fones de ouvido bluetooth',
    categoria: 'tech',
    incluir: [['fone', 'headset', 'earbuds', 'earphone'], ['bluetooth', 'sem fio', 'tws', 'wireless']],
    excluir: [...ACESSORIOS, 'gamer', 'gaming', 'espuma', 'almofada', 'receptor', 'gancho'],
    criterios: ['Autonomia da bateria e se o estojo recarrega o fone', 'Conforto e encaixe, principalmente se for usar por muitas horas', 'Qualidade do microfone para ligações e reuniões', 'Resistência à água e ao suor, se for usar em treinos', 'Versão do Bluetooth e compatibilidade com o seu celular'],
  },
  {
    slug: 'smartwatches',
    nome: 'smartwatches',
    categoria: 'tech',
    incluir: [['smartwatch', 'smart watch', 'relogio inteligente']],
    excluir: [...ACESSORIOS, 'pulseira', 'carregador'],
    criterios: ['Duração da bateria no uso real', 'Compatibilidade com Android ou iPhone', 'Sensores de saúde e GPS integrado', 'Resistência à água', 'Tamanho e qualidade da tela'],
  },
  {
    slug: 'celulares',
    nome: 'celulares',
    categoria: 'tech',
    incluir: [['celular', 'smartphone', 'iphone', 'galaxy', 'redmi', 'poco', 'motorola']],
    excluir: [...ACESSORIOS, 'carregador', 'fone', 'pulseira', 'bateria', 'tela', 'display', 'lente', 'suporte'],
    criterios: ['Memória (RAM e armazenamento) para o seu uso', 'Bateria e velocidade de carregamento', 'Qualidade da câmera em pouca luz', 'Quantos anos de atualização o fabricante promete', 'Se acompanha carregador na caixa'],
  },
  {
    slug: 'notebooks',
    nome: 'notebooks',
    categoria: 'tech',
    incluir: [['notebook', 'laptop']],
    excluir: [...ACESSORIOS, 'mochila', 'bolsa', 'base', 'cooler', 'teclado', 'mouse', 'carregador', 'fonte', 'tela'],
    criterios: ['Processador e memória RAM para o uso que você faz', 'SSD em vez de HD, para ligar e abrir programas mais rápido', 'Qualidade e tamanho da tela', 'Duração da bateria', 'Peso, se for carregar todo dia'],
  },
  {
    slug: 'smart-tvs',
    nome: 'smart TVs',
    categoria: 'tech',
    incluir: [['smart tv', 'tv led', 'tv 4k', 'televisao']],
    excluir: [...ACESSORIOS, 'controle', 'antena', 'conversor', 'rack', 'painel', 'tv box', 'tv stick', 'suporte'],
    criterios: ['Tamanho da tela em relação à distância do sofá', 'Resolução (4K faz diferença a partir de 43 polegadas)', 'Sistema operacional e apps de streaming disponíveis', 'Taxa de atualização, se for jogar', 'Quantidade de entradas HDMI'],
  },
  {
    slug: 'monitores',
    nome: 'monitores',
    categoria: 'tech',
    incluir: [['monitor']],
    excluir: [...ACESSORIOS, 'braco', 'cardiaco', 'bebe'],
    criterios: ['Tamanho e resolução', 'Taxa de atualização (Hz), importante para jogos', 'Tipo de painel (IPS tem melhores cores)', 'Conexões disponíveis (HDMI, DisplayPort)', 'Ajuste de altura e inclinação'],
  },
  {
    slug: 'ssds',
    nome: 'SSDs',
    categoria: 'tech',
    incluir: [['ssd']],
    excluir: [...ACESSORIOS, 'gabinete', 'dissipador', 'leitor'],
    criterios: ['Capacidade de armazenamento', 'Interface (SATA ou NVMe) compatível com o seu computador', 'Velocidades de leitura e gravação', 'Garantia oferecida pelo fabricante'],
  },
  {
    slug: 'caixas-de-som-bluetooth',
    nome: 'caixas de som bluetooth',
    categoria: 'tech',
    incluir: [['caixa de som', 'caixinha de som', 'speaker'], ['bluetooth', 'portatil', 'sem fio']],
    excluir: [...ACESSORIOS, 'suporte'],
    criterios: ['Potência e qualidade do grave', 'Autonomia da bateria', 'Resistência à água (IPX)', 'Tamanho e peso para transportar', 'Possibilidade de parear duas caixas'],
  },
  {
    slug: 'air-fryers',
    nome: 'air fryers',
    categoria: 'casa',
    incluir: [['air fryer', 'fritadeira']],
    excluir: [...ACESSORIOS, 'forro', 'papel', 'assadeira', 'tampa', 'cesto', 'grade', 'espeto', 'espetos', 'forma', 'kit'],
    criterios: ['Capacidade em litros para o tamanho da sua família', 'Potência (watts) e controle de temperatura', 'Facilidade de limpar a cesta', 'Funções extras, como grill e desidratar', 'Nível de ruído'],
  },
  {
    slug: 'aspiradores-robo',
    nome: 'aspiradores robô',
    categoria: 'casa',
    incluir: [['robo aspirador', 'aspirador robo', 'aspirador de po robo', 'aspirador de po robot', 'aspirador robot']],
    excluir: [...ACESSORIOS, 'filtro', 'escova', 'saco'],
    criterios: ['Autonomia da bateria e se volta sozinho para carregar', 'Se também passa pano ou só aspira', 'Mapeamento da casa (laser ou câmera) e app no celular', 'Potência de sucção', 'Facilidade de esvaziar o reservatório'],
  },
  {
    slug: 'aspiradores-de-po',
    nome: 'aspiradores de pó',
    categoria: 'casa',
    incluir: [['aspirador']],
    excluir: [...ACESSORIOS, 'robo', 'robot', 'filtro', 'saco', 'escova', 'mangueira', 'bocal'],
    criterios: ['Potência de sucção', 'Com fio ou sem fio, e a autonomia da bateria', 'Capacidade do reservatório', 'Nível de ruído', 'Acessórios incluídos para cantos e estofados'],
  },
  {
    slug: 'cafeteiras',
    nome: 'cafeteiras',
    categoria: 'casa',
    incluir: [['cafeteira', 'maquina de cafe']],
    excluir: [...ACESSORIOS, 'filtro', 'capsula', 'capsulas', 'coador'],
    criterios: ['Tipo: elétrica de filtro, expresso ou de cápsulas', 'Custo de cada xícara (as cápsulas pesam no bolso)', 'Capacidade da jarra ou do reservatório', 'Facilidade de limpeza', 'Se mantém o café aquecido'],
  },
  {
    slug: 'liquidificadores',
    nome: 'liquidificadores',
    categoria: 'casa',
    incluir: [['liquidificador']],
    excluir: [...ACESSORIOS, 'copo', 'jarra', 'lamina', 'base', 'vedacao', 'tampa'],
    criterios: ['Potência e número de velocidades', 'Material do copo (vidro, plástico ou inox)', 'Capacidade em litros', 'Se tritura gelo bem', 'Facilidade de desmontar e lavar'],
  },
  {
    slug: 'ventiladores',
    nome: 'ventiladores',
    categoria: 'casa',
    incluir: [['ventilador', 'circulador']],
    excluir: [...ACESSORIOS, 'helice', 'grade', 'motor', 'controle'],
    criterios: ['Tamanho e potência do motor', 'Nível de ruído, principalmente para dormir', 'Controle remoto e timer', 'Se oscila e regula a altura', 'Consumo de energia'],
  },
  {
    slug: 'geladeiras',
    nome: 'geladeiras',
    categoria: 'casa',
    incluir: [['geladeira', 'refrigerador', 'frigobar']],
    excluir: [...ACESSORIOS, 'ima', 'adesivo', 'organizador', 'pote', 'termometro', 'borracha', 'gaxeta'],
    criterios: ['Capacidade em litros para o número de moradores', 'Selo Procel de eficiência energética', 'Frost free ou degelo manual', 'Dimensões e se cabe no espaço da cozinha', 'Tensão (110 V ou 220 V)'],
  },
  {
    slug: 'micro-ondas',
    nome: 'micro-ondas',
    categoria: 'casa',
    incluir: [['microondas', 'micro-ondas', 'micro ondas']],
    excluir: [...ACESSORIOS, 'tampa', 'prato', 'cobertura', 'forma', 'pote', 'rack', 'protetor', 'luva'],
    criterios: ['Capacidade em litros', 'Potência', 'Funções automáticas e painel fácil de usar', 'Tensão (110 V ou 220 V)', 'Tamanho do prato giratório'],
  },
  {
    slug: 'cadeiras-gamer',
    nome: 'cadeiras gamer',
    categoria: 'casa',
    incluir: [['cadeira gamer', 'cadeira gaming']],
    excluir: [...ACESSORIOS, 'rodizio', 'rodinha', 'almofada', 'encosto'],
    criterios: ['Peso máximo suportado', 'Regulagem de altura, braços e inclinação', 'Material do estofado e conforto em longas horas', 'Qualidade das rodinhas e do pistão', 'Garantia'],
  },
  {
    slug: 'cadeiras-de-escritorio',
    nome: 'cadeiras de escritório',
    categoria: 'casa',
    incluir: [['cadeira de escritorio', 'cadeira presidente', 'cadeira ergonomica']],
    excluir: [...ACESSORIOS, 'rodizio', 'rodinha', 'almofada', 'encosto'],
    criterios: ['Apoio lombar e ergonomia', 'Regulagem de altura e braços', 'Material do assento (tela respira melhor)', 'Peso máximo suportado', 'Facilidade de montagem'],
  },
  {
    slug: 'colchoes',
    nome: 'colchões',
    categoria: 'casa',
    incluir: [['colchao']],
    excluir: [...ACESSORIOS, 'protetor', 'topper', 'lencol', 'fronha'],
    criterios: ['Tamanho (solteiro, casal, queen, king)', 'Densidade da espuma ou tipo de mola', 'Firmeza ideal para o seu peso e posição de dormir', 'Altura do colchão e lençóis compatíveis', 'Tempo de garantia'],
  },
  {
    slug: 'whey-protein',
    nome: 'whey proteins',
    categoria: 'esporte',
    incluir: [['whey protein', 'whey']],
    excluir: ['shaker', 'coqueteleira', 'garrafa'],
    criterios: ['Quantidade de proteína por dose', 'Tipo: concentrado, isolado ou hidrolisado', 'Preço por dose, não só pelo pote', 'Sabor e facilidade de misturar', 'Rótulo com registro e laudo do fabricante'],
  },
  {
    slug: 'creatinas',
    nome: 'creatinas',
    categoria: 'esporte',
    incluir: [['creatina']],
    excluir: ['shaker', 'coqueteleira', 'garrafa'],
    criterios: ['Se é creatina monohidratada pura', 'Selo de qualidade ou laudo do fabricante', 'Preço por dose diária', 'Tamanho do pote', 'Converse com um profissional de saúde antes de usar'],
  },
  {
    slug: 'tenis-de-corrida',
    nome: 'tênis de corrida',
    categoria: 'moda',
    incluir: [['tenis'], ['corrida', 'running', 'caminhada']],
    excluir: ['meia', 'palmilha', 'cadarco', 'limpador'],
    criterios: ['Tipo de pisada e amortecimento', 'Peso do tênis', 'Aderência do solado', 'Respirabilidade do cabedal', 'Escolher numeração com folga para os dedos'],
  },
  {
    slug: 'mouses-gamer',
    nome: 'mouses gamer',
    categoria: 'games',
    incluir: [['mouse'], ['gamer', 'gaming']],
    excluir: [...ACESSORIOS, 'mousepad', 'pad'],
    criterios: ['Sensor e DPI ajustável', 'Peso e formato da mão', 'Com fio ou sem fio, e a latência', 'Número de botões programáveis', 'Durabilidade dos cliques'],
  },
  {
    slug: 'teclados-mecanicos',
    nome: 'teclados mecânicos',
    categoria: 'games',
    incluir: [['teclado'], ['mecanico']],
    excluir: [...ACESSORIOS, 'keycap', 'keycaps'],
    criterios: ['Tipo de switch (linear, tátil ou clicky)', 'Tamanho: completo, TKL ou 60%', 'Com fio ou sem fio', 'Iluminação e software de configuração', 'Possibilidade de trocar as teclas'],
  },
  {
    slug: 'headsets-gamer',
    nome: 'headsets gamer',
    categoria: 'games',
    incluir: [['headset'], ['gamer', 'gaming']],
    excluir: [...ACESSORIOS, 'espuma', 'almofada'],
    criterios: ['Conforto em sessões longas', 'Qualidade do microfone', 'Som surround e compatibilidade com o console ou PC', 'Com fio ou sem fio', 'Peso'],
  },
  {
    slug: 'roteadores-wifi',
    nome: 'roteadores wi-fi',
    categoria: 'tech',
    incluir: [['roteador', 'mesh']],
    excluir: [...ACESSORIOS, 'antena'],
    criterios: ['Padrão Wi-Fi (Wi-Fi 5 ou Wi-Fi 6)', 'Banda dupla (2,4 GHz e 5 GHz)', 'Área de cobertura da casa', 'Número de portas de rede', 'Facilidade de configuração pelo app'],
  },
  {
    slug: 'power-banks',
    nome: 'power banks',
    categoria: 'tech',
    incluir: [['power bank', 'powerbank', 'carregador portatil', 'bateria externa']],
    excluir: [...ACESSORIOS, 'capa'],
    criterios: ['Capacidade em mAh (quantas cargas do celular)', 'Potência de saída e carregamento rápido', 'Número e tipo de portas', 'Peso e tamanho', 'Segurança contra superaquecimento'],
  },
  {
    slug: 'tablets',
    nome: 'tablets',
    categoria: 'tech',
    incluir: [['tablet']],
    excluir: [...ACESSORIOS, 'caneta', 'teclado', 'carregador', 'bolsa'],
    criterios: ['Tamanho e qualidade da tela', 'Armazenamento e memória', 'Duração da bateria', 'Suporte a caneta, se for desenhar ou anotar', 'Versão do sistema e tempo de atualizações'],
  },
  {
    slug: 'cameras-de-seguranca',
    nome: 'câmeras de segurança',
    categoria: 'tech',
    incluir: [['camera'], ['wifi', 'wi-fi', 'seguranca', 'monitoramento', 'ip']],
    excluir: [...ACESSORIOS, 'tripe', 'cartao', 'lente'],
    criterios: ['Resolução da imagem', 'Visão noturna', 'Armazenamento (cartão e nuvem) e custo da nuvem', 'Áudio bidirecional', 'Uso interno ou à prova de chuva'],
  },
  {
    slug: 'furadeiras',
    nome: 'furadeiras e parafusadeiras',
    categoria: 'ferramentas',
    incluir: [['furadeira', 'parafusadeira']],
    excluir: [...ACESSORIOS, 'broca', 'brocas', 'mandril', 'bit', 'bits'],
    criterios: ['Com fio ou a bateria, e a autonomia', 'Potência e torque', 'Mandril e velocidades', 'Se tem função de impacto', 'Maleta e acessórios incluídos'],
  },
  {
    slug: 'panelas-eletricas',
    nome: 'panelas elétricas',
    categoria: 'casa',
    incluir: [['panela eletrica', 'panela de arroz', 'panela de pressao eletrica']],
    excluir: [...ACESSORIOS, 'tampa', 'valvula'],
    criterios: ['Capacidade em litros', 'Funções programáveis', 'Revestimento antiaderente da panela', 'Potência', 'Facilidade de limpar'],
  },
  {
    slug: 'secadores-de-cabelo',
    nome: 'secadores de cabelo',
    categoria: 'beleza',
    incluir: [['secador de cabelo', 'secador']],
    excluir: [...ACESSORIOS, 'roupa', 'difusor', 'bocal'],
    criterios: ['Potência e temperaturas disponíveis', 'Peso, para não cansar o braço', 'Tecnologia íon para reduzir frizz', 'Comprimento do cabo', 'Acessórios incluídos'],
  },
  {
    slug: 'barbeadores-eletricos',
    nome: 'barbeadores elétricos',
    categoria: 'beleza',
    incluir: [['barbeador', 'maquina de barbear']],
    excluir: [...ACESSORIOS, 'lamina', 'laminas', 'cabeca', 'tela'],
    criterios: ['Se pode usar com água e espuma', 'Autonomia da bateria', 'Tipo de lâmina (rotativa ou foil)', 'Facilidade de limpar', 'Acessórios para barba e acabamento'],
  },
  {
    slug: 'consoles-de-video-game',
    nome: 'consoles de videogame',
    categoria: 'games',
    incluir: [['playstation 5', 'ps5', 'xbox series', 'nintendo switch']],
    excluir: [...ACESSORIOS, 'controle', 'jogo', 'base', 'headset', 'dualsense', 'suporte'],
    criterios: ['Catálogo de jogos exclusivos que você quer jogar', 'Versão com ou sem leitor de disco', 'Armazenamento interno', 'Serviço de assinatura necessário para jogar online', 'Se acompanha jogos ou controle extra'],
  },
];

/** Descobre a que guia o produto pertence, pelo título. Devolve undefined se não for de nenhum. */
export function tipoDeGuia(titulo: string): TipoDeGuia | undefined {
  const t = normalizar(titulo);
  // Os tipos mais específicos vêm antes dos genéricos na lista; o primeiro que casar vence.
  return TIPOS_DE_GUIA.find((tipo) => tipo.incluir.every((grupo) => grupo.some((p) => contemPalavra(t, p))) && !tipo.excluir.some((p) => contemPalavra(t, p)));
}

/** Estes critérios deixam de fora produto sem preço, sem link seguro ou com avaliação ruim. */
export function elegivelParaGuia(o: Oferta, notaMinima = 4.3): boolean {
  if (!o.titulo?.trim() || !o.idProduto || !Number.isFinite(o.preco) || o.preco <= 0) return false;
  if (!/^https:\/\//i.test(o.link ?? '')) return false;
  if (o.nota !== undefined && o.nota > 0 && o.nota < notaMinima) return false;
  return true;
}

/**
 * Pontuação do guia: o que vale é a satisfação de quem comprou (nota), o volume de vendas e,
 * em menor peso, o desconto. Produto sem nota nem vendas até entra, mas fica no fim da lista.
 */
export function pontuacaoDoGuia(o: Oferta): number {
  const nota = o.nota && o.nota > 0 ? (o.nota - 3.5) * 25 : 4;
  const vendas = o.vendas && o.vendas > 0 ? Math.log10(o.vendas + 1) * 10 : 0;
  const desconto = Math.min(Math.max(o.desconto ?? 0, 0), 60) * 0.15;
  return Math.round((nota + vendas + desconto + (o.freteGratis ? 3 : 0)) * 10) / 10;
}

/** Tamanho do guia: Top 5 quando há produtos suficientes, Top 3 com poucos, nada com menos de 3. */
export function tamanhoDoGuia(total: number): number {
  if (total >= 5) return 5;
  if (total >= 3) return 3;
  return 0;
}

export interface ProdutoDoGuia extends OfertaAvaliada {
  /** Selos calculados a partir dos dados: "Melhor custo-benefício", "Mais vendido"... */
  destaques: string[];
  /** Quando o robô viu este preço pela última vez. */
  vistoEm: number;
}

/**
 * Escolhe e ordena os produtos do guia e calcula os destaques.
 * Os destaques saem só de números reais (nota, vendas, preço): nada é inventado.
 */
export function escolherParaGuia(candidatos: Array<{ oferta: Oferta; vistoEm: number }>, tipo: TipoDeGuia): ProdutoDoGuia[] {
  const unicos = new Map<string, { oferta: Oferta; vistoEm: number }>();
  for (const c of candidatos) {
    const chave = `${c.oferta.loja}:${c.oferta.idProduto}`;
    const atual = unicos.get(chave);
    if (!atual || c.vistoEm > atual.vistoEm) unicos.set(chave, c);
  }
  const ordenados = [...unicos.values()]
    .filter((c) => elegivelParaGuia(c.oferta))
    .map((c) => ({ ...c, pontos: pontuacaoDoGuia(c.oferta) }))
    .sort((a, b) => b.pontos - a.pontos);
  const n = tamanhoDoGuia(ordenados.length);
  const escolhidos = ordenados.slice(0, n);
  if (n === 0) return [];

  const maisVendido = escolhidos.reduce((m, c) => ((c.oferta.vendas ?? 0) > (m.oferta.vendas ?? 0) ? c : m), escolhidos[0]!);
  const melhorNota = escolhidos.reduce((m, c) => {
    const a = c.oferta.nota ?? 0;
    const b = m.oferta.nota ?? 0;
    return a > b || (a === b && (c.oferta.vendas ?? 0) > (m.oferta.vendas ?? 0)) ? c : m;
  }, escolhidos[0]!);
  const maisBarato = escolhidos.reduce((m, c) => (c.oferta.preco < m.oferta.preco ? c : m), escolhidos[0]!);

  return escolhidos.map((c, i) => {
    const destaques: string[] = [];
    if (i === 0) destaques.push('Melhor custo-benefício');
    if (c === maisVendido && (c.oferta.vendas ?? 0) > 0) destaques.push('Mais vendido');
    if (c === melhorNota && (c.oferta.nota ?? 0) > 0) destaques.push('Melhor avaliado');
    if (c === maisBarato && n > 1) destaques.push('Mais barato da lista');
    return { ...c.oferta, categoria: tipo.categoria, pontos: c.pontos, destaques, vistoEm: c.vistoEm };
  });
}

export interface PerguntaFrequente {
  pergunta: string;
  resposta: string;
}

/** Perguntas fixas que todo guia responde, sem depender de IA. */
export function perguntasDoGuia(tipo: TipoDeGuia, quantos: number, ano: string): PerguntaFrequente[] {
  return [
    {
      pergunta: `Como escolhemos os melhores ${tipo.nome}?`,
      resposta: `Olhamos os ${tipo.nome} que apareceram nas lojas nos últimos dias e ordenamos pela nota de quem comprou, pelo volume de vendas e, com peso menor, pelo desconto. Produtos com avaliação baixa ficam de fora. Não recebemos aparelhos para teste: a comparação usa os dados públicos das lojas.`,
    },
    {
      pergunta: 'Os preços desta página estão atualizados?',
      resposta: `Cada produto mostra a data em que o preço foi visto por último. Como as lojas mudam preços o tempo todo, clique em "Ver oferta" para conferir o valor atual antes de comprar. O guia é revisado automaticamente várias vezes ao dia.`,
    },
    {
      pergunta: `Qual é o melhor entre os ${quantos} ${tipo.nome} de ${ano}?`,
      resposta: `Depende do uso. O primeiro da lista tem a melhor combinação de nota, vendas e preço entre os que encontramos, mas confira também os selos de mais vendido, melhor avaliado e mais barato, e os pontos de atenção da seção "O que observar antes de comprar".`,
    },
  ];
}
