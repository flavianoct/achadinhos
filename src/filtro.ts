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

  const pontos =
    desconto +
    Math.max(0, quedaHistorica ?? 0) * 1.5 +
    (o.comissao ?? 0) * 200 +
    (o.nota ? (o.nota - 4) * 10 : 0) +
    (o.vendas ? Math.log10(o.vendas + 1) * 3 : 0) +
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
