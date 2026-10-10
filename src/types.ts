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
  /** Veio do ranking dos mais vendidos da loja (sem o número exato de vendas). */
  maisVendido?: boolean;
}

/** Oferta aprovada pelo filtro, com os dados calculados por nós. */
export interface OfertaAvaliada extends Oferta {
  categoria: string;
  pontos: number;
  /** Menor preço do nosso histórico nos últimos N dias (se houver histórico). */
  menorPrecoEmDias?: number;
  /** Queda em % contra o menor preço anterior do nosso histórico. */
  quedaHistorica?: number;
  /**
   * O que o histórico do robô diz sobre o preço "de" informado pela loja: "confirmado" (o produto já custou perto dele),
   * "inflado" (com 14 dias ou mais de histórico, nunca custou perto dele) ou "nao-confirmado" (histórico curto demais).
   */
  precoDe?: 'confirmado' | 'nao-confirmado' | 'inflado';
}

/** Toda loja implementa esta interface. */
export interface Fonte {
  nome: Loja | 'simulada';
  coletar(): Promise<Oferta[]>;
  /** Aviso da última coleta que não derrubou a rodada (ex.: a página do site barrou, mas a API salvou). Vai para o painel do dono. */
  avisoDaColeta?(): string | undefined;
}
