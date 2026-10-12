import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nomeDoNicho, normalizar } from './categoria.ts';
import type { Config } from './config.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { campanhaDeHoje, carregarCampanhas, type Campanha } from './datas.ts';
import { svgDaDataEspecial, svgDoResumoDoDia, type DadosDaApresentacao, type DadosDoResumo } from './moldes.ts';
import { descontoParaArte, renderizarPng } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * Vitrine do grupo no Instagram: posts que não vendem um produto, e sim o grupo ("olha o que ele entregou hoje").
 * Tudo com números de verdade, tirados do que o robô postou, e nunca com preço em reais.
 */

/** Com menos achados que isso no dia, o resumo não sai (um grupo "fraco" no dia não convence ninguém). */
export const MINIMO_DE_ACHADOS_NO_DIA = 3;
/** Histórico de preço que o filtro usa (ver filtro.ts). */
export const DIAS_DE_HISTORICO = 30;

/** Ofertas postadas hoje (as que viraram conteúdo de rede social), com a foto já embutida. */
function postadasHoje(banco: Banco, agora: Date): Array<{ oferta: OfertaAvaliada; imagem?: string }> {
  const hoje = diaDe(agora);
  return banco
    .socialRecentes(24, 300, agora)
    .filter((l) => diaDe(new Date(l.criadoEm)) === hoje)
    .map((l) => ({ oferta: JSON.parse(l.dados) as OfertaAvaliada, imagem: l.imagem }));
}

/** Os assuntos (nichos) do período, em ordem de volume, sem "geral". */
function assuntosDoPeriodo(banco: Banco, dias: number, agora: Date, maximo: number): string[] {
  return banco
    .postsPorCategoria(dias, agora)
    .filter((c) => c.categoria !== 'geral')
    .slice(0, maximo)
    .map((c) => nomeDoNicho(c.categoria));
}

/** O que o grupo entregou hoje. Undefined se o dia ainda tem poucos achados. */
export function dadosDoResumo(banco: Banco, agora: Date): DadosDoResumo | undefined {
  const achados = banco.postsNoDia(agora);
  if (achados < MINIMO_DE_ACHADOS_NO_DIA) return undefined;
  const hoje = postadasHoje(banco, agora);
  return {
    achados,
    // Nenhum valor nas artes (nem em %): a vitrine mostra quantidade de achados e menor preço do mês, não o tamanho do desconto.
    maiorDesconto: 0,
    noMenorPreco: hoje.filter((h) => h.oferta.menorPrecoEmDias).length,
    assuntos: assuntosDoPeriodo(banco, 1, agora, 3),
    fotos: hoje
      .map((h) => h.imagem)
      .filter((f): f is string => Boolean(f))
      .slice(0, 4),
  };
}

/** As palavras bloqueadas que dá para mostrar no post: sem repetir a mesma com e sem acento, e sem as que não cabem num post. */
export function palavrasParaMostrar(palavras: string[]): string[] {
  const vistas = new Set<string>();
  return palavras.filter((p) => {
    const n = normalizar(p);
    if (vistas.has(n) || n === 'erotico') return false;
    vistas.add(n);
    return true;
  });
}

/** Os números da apresentação do grupo (última semana) e as regras de verdade do filtro. */
export function dadosDaApresentacao(banco: Banco, config: Config, agora: Date): DadosDaApresentacao {
  return {
    achadosNaSemana: banco.postsPorDia(7, agora).reduce((total, d) => total + d.posts, 0),
    assuntos: assuntosDoPeriodo(banco, 7, agora, 6),
    descontoMinimo: config.filtro.descontoMinimo,
    quedaMinima: config.filtro.quedaMinima,
    diasDeHistorico: DIAS_DE_HISTORICO,
    bloqueadas: palavrasParaMostrar(config.filtro.palavrasBloqueadas),
    fotos: banco
      .socialRecentes(48, 50, agora)
      .map((l) => l.imagem)
      .filter((f): f is string => Boolean(f))
      .slice(0, 4),
  };
}

/** Nome do PNG do resumo do dia (um por dia, endereço estável para o Instagram buscar). */
export function arquivoDoResumo(agora: Date): string {
  return `resumo-${diaDe(agora)}.png`;
}

/**
 * Grava em blog/social/ o Story "Hoje no grupo", a partir de uma hora antes da hora do resumo (assim ele já está no ar
 * quando chega a hora de publicar). Como o site é refeito a cada rodada, o arquivo é refeito também, com os números do momento.
 */
export async function gravarResumoDoDia(banco: Banco, config: Config, agora: Date): Promise<boolean> {
  const ig = config.instagram;
  if (!config.social.ativo || !ig.ativo || ig.resumoHora <= 0) return false;
  if (horaDe(agora) < ig.resumoHora - 1) return false;
  const dados = dadosDoResumo(banco, agora);
  if (!dados) return false;
  const png = await renderizarPng(svgDoResumoDoDia(dados), 1080);
  if (!png) return false;
  const pasta = join(config.blog.pasta, 'social');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, arquivoDoResumo(agora)), png);
  return true;
}

/** Chave que marca o resumo de hoje como publicado. */
export const chaveDoResumoPublicado = (agora: Date) => `ig-resumo:${diaDe(agora)}`;

/** Nome do PNG do Story da data grande de hoje (um por data e dia). */
export const arquivoDaData = (c: Campanha, agora: Date) => `data-${c.id}-${diaDe(agora)}.png`;

/** Chave que marca o Story da data de hoje como publicado. */
export const chaveDaDataPublicada = (c: Campanha, agora: Date) => `ig-data:${c.id}:${diaDe(agora)}`;

/** Grava em blog/social/ o Story da data grande de hoje, a partir de uma hora antes da hora dele (INSTAGRAM_DATA_HORA). */
export async function gravarDataEspecial(banco: Banco, config: Config, agora: Date): Promise<boolean> {
  const ig = config.instagram;
  if (!config.social.ativo || !ig.ativo || !config.datas.ativo || ig.dataHora <= 0) return false;
  if (horaDe(agora) < ig.dataHora - 1) return false;
  const c = campanhaDeHoje(carregarCampanhas(config, agora), diaDe(agora));
  if (!c) return false;
  // Só a marca e texto: nada de foto de produto nem de loja (direito autoral).
  const png = await renderizarPng(svgDaDataEspecial({ nome: c.nome, umDia: c.inicio === c.fim }), 1080);
  if (!png) return false;
  const pasta = join(config.blog.pasta, 'social');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, arquivoDaData(c, agora)), png);
  return true;
}
