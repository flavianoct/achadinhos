import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';

/**
 * Reels prontos e agendados: um vídeo que você (ou eu) montou à mão fica na pasta reels-prontos/ com uma ficha .json (hora, legenda e o link
 * de afiliado do produto). Na hora marcada o robô publica no Instagram e guarda o link: quem comentar "eu quero" recebe no direct o link real
 * daquele produto. Cada Reel sai uma vez só, até 12 horas depois da hora marcada (só dentro do horário de postagem).
 */
export interface ReelAgendado {
  id: string;
  /** Arquivo mp4, na mesma pasta da ficha. */
  arquivo: string;
  /** Quando publicar (data e hora com fuso, ex.: 2026-10-30T18:00:00-03:00). */
  quando: string;
  titulo: string;
  /** O link de afiliado que vai no direct de quem pedir. */
  link: string;
  legenda: string;
}

export const PASTA_DOS_REELS_PRONTOS = 'reels-prontos';
/** Quantas horas depois da hora marcada o Reel ainda pode sair (se a rodada atrasar ou o vídeo ainda não estiver no ar). */
export const HORAS_DE_TOLERANCIA = 12;

/** Nome do vídeo no site (o Instagram busca o arquivo por aqui). */
export const arquivoNoSite = (r: Pick<ReelAgendado, 'id'>) => `agendado-${r.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`;

/** Lê as fichas da pasta. Ficha inválida ou sem o vídeo é ignorada (não derruba a rodada). */
export function lerReelsAgendados(raiz = process.cwd()): ReelAgendado[] {
  const pasta = join(raiz, PASTA_DOS_REELS_PRONTOS);
  if (!existsSync(pasta)) return [];
  const lista: ReelAgendado[] = [];
  for (const nome of readdirSync(pasta).filter((n) => n.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(pasta, nome), 'utf8')) as Partial<ReelAgendado>;
      const valido = r.id && r.arquivo && r.titulo && r.legenda && /^https:\/\//.test(r.link ?? '') && Number.isFinite(Date.parse(r.quando ?? '')) && /^[\w.-]+\.mp4$/.test(r.arquivo) && existsSync(join(pasta, r.arquivo));
      if (valido) lista.push(r as ReelAgendado);
    } catch {
      // ficha com erro de escrita: ignora
    }
  }
  return lista;
}

/** Os Reels que já passaram da hora marcada e ainda estão na tolerância. */
export function reelsNaHora(reels: ReelAgendado[], agora: Date): ReelAgendado[] {
  const t = agora.getTime();
  return reels.filter((r) => {
    const quando = Date.parse(r.quando);
    return t >= quando && t < quando + HORAS_DE_TOLERANCIA * 3_600_000;
  });
}

/**
 * Copia os vídeos dos Reels agendados (os de hoje em diante) para blog/social/, de onde o site os publica a cada rodada.
 * Devolve quantos vídeos foram copiados.
 */
export function copiarReelsAgendados(config: Config, agora: Date, raiz = process.cwd()): number {
  const ainda = lerReelsAgendados(raiz).filter((r) => Date.parse(r.quando) + HORAS_DE_TOLERANCIA * 3_600_000 > agora.getTime());
  if (!ainda.length) return 0;
  const destino = join(config.blog.pasta, 'social');
  mkdirSync(destino, { recursive: true });
  for (const r of ainda) copyFileSync(join(raiz, PASTA_DOS_REELS_PRONTOS, r.arquivo), join(destino, arquivoNoSite(r)));
  return ainda.length;
}
