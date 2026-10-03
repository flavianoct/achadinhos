export type Loja = 'shopee' | 'mercadolivre' | 'amazon';

/** Uma oferta já normalizada, igual para todas as lojas. */
export interface Oferta {
  loja: Loja;
  /** ID do produto dentro da loja. Junto com `loja`, identifica o produto. */
  idProduto: string;
  titulo: string;
  /** Preço atual em reais. */
  preco: number;
  /** Preço "de", quando a loja informa. */
  precoOriginal?: number;
  /** Desconto anunciado pela loja, em % (0 a 100). */
  desconto?: number;
  imagem?: string;
  /** Link já com o seu código de afiliado. */
  link: string;
  nota?: number;
  vendas?: number;
  /** Comissão em fração (0.08 = 8%), quando a loja informa. */
  comissao?: number;
  nomeLoja?: string;
  freteGratis?: boolean;
}

/** Oferta aprovada pelo filtro, com os dados calculados por nós. */
export interface OfertaAvaliada extends Oferta {
  categoria: string;
  pontos: number;
  /** Menor preço do nosso histórico nos últimos N dias (se houver histórico). */
  menorPrecoEmDias?: number;
  /** Queda em % contra o menor preço anterior do nosso histórico. */
  quedaHistorica?: number;
}

/** Toda loja implementa esta interface. */
export interface Fonte {
  nome: Loja | 'simulada';
  coletar(): Promise<Oferta[]>;
}
