import type { Config } from './config.ts';
import { categorizar, contemPalavra, normalizar } from './categoria.ts';
import type { Banco } from './db.ts';
import type { Oferta, OfertaAvaliada } from './types.ts';

/** Quando a oferta é boa mas só foi barrada por repetição, `oferta` vem preenchida mesmo com `aprovada: false`. */
export type Avaliacao = { aprovada: true; oferta: OfertaAvaliada } | { aprovada: false; motivo: string; oferta?: OfertaAvaliada };

/** Janela do histórico usada para comparar preços. */
const DIAS_DE_HISTORICO = 30;
/** Com menos dias que isso, o histórico ainda não é confiável. */
const DIAS_MINIMOS_DE_HISTORICO = 3;
/** Quanto do desconto anunciado conta na pontuação, conforme a prova que temos do preço "de". */
const PESO_DO_DESCONTO_INFLADO = 0.4;
const PESO_DO_DESCONTO_SEM_PROVA = 0.85;
const TETO_DO_BONUS_MENOR_PRECO = 12;
/** O desconto anunciado vale 70% do que valia: as lojas anunciam descontos enormes o tempo todo, e sozinho ele não pode mandar na lista. */
const PESO_BASE_DO_DESCONTO = 0.7;
/** Comissão acima de 20% (campanhas passageiras) conta como 20%. */
const TETO_DA_COMISSAO = 0.2;
/** Com pelo menos isto de histórico, um "de" que o produto nunca chegou perto de custar é tratado como inflado. */
const DIAS_PARA_DENUNCIAR_PRECO_DE = 14;

/**
 * Decide se a oferta vale a pena e calcula a pontuação.
 * Aprova quando o desconto anunciado é bom OU quando o preço caiu contra o nosso próprio histórico.
 * Reprova "promoção falsa": desconto anunciado, mas o produto já esteve mais barato há pouco tempo.
 */
export function avaliar(o: Oferta, banco: Banco, config: Config, agora: Date): Avaliacao {
  const f = config.filtro;
  const nao = (motivo: string): Avaliacao => ({ aprovada: false, motivo });

  if (!o.titulo?.trim() || !o.link?.trim() || !o.idProduto) return nao('dados incompletos');
  if (!/^https:\/\//i.test(o.link)) return nao('link inválido');
  if (!Number.isFinite(o.preco) || o.preco <= 0) return nao('preço inválido');
  if (o.preco < f.precoMinimo) return nao('preço abaixo do mínimo');
  if (o.preco > f.precoMaximo) return nao('preço acima do máximo');

  const titulo = normalizar(o.titulo);
  const bloqueada = f.palavrasBloqueadas.find((p) => contemPalavra(titulo, p));
  if (bloqueada) return nao(`palavra bloqueada: ${bloqueada}`);

  const semApelo = f.palavrasSemApelo.find((p) => contemPalavra(titulo, p));
  if (semApelo) return nao(`sem apelo para o grupo: ${semApelo}`);

  if (o.nota !== undefined && o.nota > 0 && o.nota < f.notaMinima) return nao('nota baixa');
  if (o.vendas !== undefined && o.vendas < f.vendasMinimas) return nao('poucas vendas');

  let desconto = o.desconto;
  if ((desconto === undefined || desconto <= 0) && o.precoOriginal && o.precoOriginal > o.preco) {
    desconto = Math.round((1 - o.preco / o.precoOriginal) * 100);
  }
  desconto = Math.max(0, Math.min(desconto ?? 0, 99));

  const hist = banco.historico(o.loja, o.idProduto, DIAS_DE_HISTORICO, agora);
  const historicoConfiavel = hist.menor !== undefined && hist.diasComDado >= DIAS_MINIMOS_DE_HISTORICO;
  const quedaHistorica = hist.menor !== undefined ? ((hist.menor - o.preco) / hist.menor) * 100 : undefined;

  if (historicoConfiavel && o.preco > hist.menor! * 1.03) {
    return nao('já esteve mais barato recentemente');
  }

  const temDesconto = desconto >= f.descontoMinimo;
  const temQueda = quedaHistorica !== undefined && quedaHistorica >= f.quedaMinima;
  if (!temDesconto && !temQueda) return nao('desconto insuficiente');

  let menorPrecoEmDias: number | undefined;
  if (historicoConfiavel && hist.desde && o.preco <= hist.menor!) {
    const inicio = new Date(`${hist.desde}T12:00:00-03:00`).getTime();
    menorPrecoEmDias = Math.max(DIAS_MINIMOS_DE_HISTORICO, Math.round((agora.getTime() - inicio) / 86_400_000));
  }

  // O preço "de" é informado pela loja. Só o marcamos como inflado com bastante histórico: uma promoção que dura
  // uma semana é legítima, mas um produto que em 14 dias nunca custou perto do "de" provavelmente nunca custou.
  let precoDe: OfertaAvaliada['precoDe'];
  if (o.precoOriginal && o.precoOriginal > o.preco) {
    if (hist.maior !== undefined && hist.diasComDado >= DIAS_PARA_DENUNCIAR_PRECO_DE && hist.maior < o.precoOriginal * 0.8) precoDe = 'inflado';
    else if (hist.maior !== undefined && hist.diasComDado >= DIAS_MINIMOS_DE_HISTORICO && hist.maior >= o.precoOriginal * 0.9) precoDe = 'confirmado';
    else precoDe = 'nao-confirmado';
  }

  // A promoção vale pelo que se confirma. O desconto anunciado é a loja falando: com o preço "de" confirmado pelo nosso histórico vale inteiro,
  // sem histórico suficiente vale um pouco menos, e um "de" inflado (o produto nunca custou perto disso) quase não vale.
  const pesoDoDesconto = precoDe === 'confirmado' ? 1 : precoDe === 'inflado' ? PESO_DO_DESCONTO_INFLADO : PESO_DO_DESCONTO_SEM_PROVA;
  // O melhor tipo de promoção: o preço mais baixo que o produto teve no histórico, e quanto mais tempo esse recorde durava, melhor.
  // Preço parado não é promoção: só conta se o preço esteve pelo menos 5% mais alto em algum momento da janela.
  const caiuDeVerdade = hist.maior !== undefined && hist.maior >= o.preco * 1.05;
  const bonusMenorPreco = menorPrecoEmDias && caiuDeVerdade ? Math.min(TETO_DO_BONUS_MENOR_PRECO, Math.log2(menorPrecoEmDias) * 3) : 0;

  // A comissão conta de verdade, nas duas formas: a porcentagem e o valor em reais por venda (3% de um produto de R$ 300 rende mais que
  // 13% de um de R$ 20). Os dois têm teto: campanhas de comissão extra (50%, 80%) não podem jogar para o topo um produto que quase ninguém compra.
  const comissaoConsiderada = Math.min(TETO_DA_COMISSAO, o.comissao ?? 0);
  const bonusDeComissao = comissaoConsiderada * 60 + Math.min(8, Math.log10(1 + o.preco * comissaoConsiderada) * 8);

  // Equilíbrio entre os três pilares de uma boa oferta para o grupo: a promoção (desconto que se confirma), o que as pessoas mais compram
  // (vendas e selo de "mais vendido" da loja) e a qualidade (nota). A comissão pesa (até ~20 pontos) mas com teto, para não mandar sozinha.
  const pontos =
    Math.min(desconto, 70) * PESO_BASE_DO_DESCONTO * pesoDoDesconto +
    (precoDe === 'confirmado' ? 5 : 0) +
    bonusMenorPreco +
    Math.min(30, Math.max(0, quedaHistorica ?? 0) * 1.5) +
    bonusDeComissao +
    (o.nota ? (o.nota - 4) * 10 : 0) +
    // Vendas em escala log: 100 vendas = 12, 1 mil = 18, 10 mil = 24, 100 mil = 30.
    (o.vendas ? Math.log10(o.vendas + 1) * 6 : 0) +
    (o.maisVendido ? 10 : 0) +
    (o.freteGratis ? 5 : 0);

  const avaliada: OfertaAvaliada = {
    ...o,
    desconto,
    categoria: categorizar(o.titulo),
    pontos: Math.round(pontos * 10) / 10,
    menorPrecoEmDias,
    quedaHistorica: quedaHistorica !== undefined ? Math.round(quedaHistorica * 10) / 10 : undefined,
    precoDe,
  };

  // A oferta é boa, mas já saiu no canal há pouco: não volta para a fila, e continua valendo para o blog.
  const ultimo = banco.ultimoPost(o.loja, o.idProduto);
  if (ultimo) {
    const dias = (agora.getTime() - ultimo.postadoEm) / 86_400_000;
    const caiuDeNovo = o.preco <= ultimo.preco * 0.95;
    if (dias < f.diasSemRepetir && !caiuDeNovo) return { aprovada: false, motivo: 'já postada recentemente', oferta: avaliada };
  }

  return { aprovada: true, oferta: avaliada };
}
