import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Config } from './config.ts';
import { formatarVendas } from './mensagem.ts';
import { CORES_DO_NICHO } from './moldes.ts';
import { estiloDaMusica, sintetizarEfeitos, sintetizarMusica, type Efeito } from './musica.ts';
import { seloDaOferta, tituloParaArte } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

const executar = promisify(execFile);

/**
 * Reel animado com o Remotion (projeto em remotion/, composição "Achados"): o robô monta os dados e o áudio, o Remotion desenha o vídeo.
 * Se o Remotion não estiver instalado ou falhar, quem chama monta o Reel simples (ffmpeg): o dia nunca fica sem Reel.
 */

/** Quadros de cada cena (30 por segundo). Precisam ser os mesmos de QUADROS em remotion/src/Achados.tsx (um teste confere). */
export const QUADROS_DO_REMOTION = { gancho: 42, item: 72, fim: 78 };
const FPS = 30;

export interface ItemDoRemotion {
  nome: string[];
  imagem: string;
  selo?: { texto: string; tipo: 'desconto' | 'historico' | 'febre' };
  provas: string[];
  cor: string;
}

export interface PropsDoRemotion {
  itens: ItemDoRemotion[];
  fato: string;
  promessa: string;
  comentaQuero: boolean;
  audio?: string;
}

/** Provas reais do produto, uma por chip. */
export function provasDoProduto(o: OfertaAvaliada): string[] {
  return [o.nota && o.nota >= 4 ? `★ ${o.nota.toFixed(1).replace('.', ',')}` : '', o.vendas && o.vendas >= 100 ? `${formatarVendas(o.vendas)} vendidos` : '', o.freteGratis ? 'Frete grátis' : ''].filter(Boolean);
}

/** O fato mais forte do nº 1, para o gancho: sempre algo que os dados provam, nunca preço em reais. */
export function fatoDoGancho(o: OfertaAvaliada): string {
  const selo = seloDaOferta(o);
  if (selo?.tipo === 'desconto') return `${selo.texto} OFF`;
  if (o.vendas && o.vendas >= 1000) return `${formatarVendas(o.vendas).toUpperCase()} VENDIDOS`;
  if (selo?.tipo === 'historico') return 'MENOR PREÇO DO MÊS';
  if (selo?.tipo === 'febre') return 'TODO MUNDO TÁ COMPRANDO';
  return 'ACHADO DO DIA';
}

/** Os dados do vídeo. Os itens chegam em ordem de ranking (o primeiro é o nº 1); a contagem do vídeo os mostra do último ao primeiro. */
export function propsDoRemotion(itens: Array<{ oferta: OfertaAvaliada; imagem: string }>, comentaQuero: boolean): PropsDoRemotion {
  const n1 = itens[0]!.oferta;
  // "O Nº 1 É O MAIS VENDIDO" só quando é verdade; senão, a promessa é só ver o nº 1.
  const maisVendido = (n1.vendas ?? 0) > 0 && itens.every((it) => (it.oferta.vendas ?? 0) <= (n1.vendas ?? 0));
  return {
    itens: itens.map(({ oferta, imagem }) => ({
      nome: tituloParaArte(oferta.titulo, 22, 2),
      imagem,
      selo: seloDaOferta(oferta),
      provas: provasDoProduto(oferta),
      cor: CORES_DO_NICHO[oferta.categoria] ?? CORES_DO_NICHO.geral!,
    })),
    fato: fatoDoGancho(n1),
    promessa: maisVendido ? 'O Nº 1 É O MAIS VENDIDO' : 'ESPERA O Nº 1',
    comentaQuero,
  };
}

/** Os efeitos no tempo das cenas: pop no carimbo do gancho, whoosh em cada corte, pop no carimbo de cada produto e ding no fim. */
export function efeitosDoRemotion(n: number): Efeito[] {
  const cenas = [QUADROS_DO_REMOTION.gancho, ...Array(n).fill(QUADROS_DO_REMOTION.item), QUADROS_DO_REMOTION.fim].map((q) => q / FPS);
  const efeitos: Efeito[] = [{ t: 0.28, tipo: 'pop' }];
  let t = 0;
  cenas.forEach((d, i) => {
    if (i > 0) efeitos.push({ t: Math.max(0, t - 0.15), tipo: 'whoosh' });
    if (i > 0 && i < cenas.length - 1) efeitos.push({ t: t + 0.42, tipo: 'pop' });
    if (i === cenas.length - 1) efeitos.push({ t: t + 0.25, tipo: 'ding' });
    t += d;
  });
  return efeitos;
}

export function duracaoDoRemotion(n: number): number {
  return (QUADROS_DO_REMOTION.gancho + n * QUADROS_DO_REMOTION.item + QUADROS_DO_REMOTION.fim) / FPS;
}

/** A trilha com os efeitos já misturados, no tamanho exato do vídeo. */
export function audioDoRemotion(n: number, chave: string): Buffer {
  const total = duracaoDoRemotion(n);
  const musica = sintetizarMusica(total, estiloDaMusica(chave));
  const efeitos = sintetizarEfeitos(total, efeitosDoRemotion(n));
  const saida = Buffer.from(musica);
  for (let i = 44; i < Math.min(musica.length, efeitos.length); i += 2) saida.writeInt16LE(Math.max(-32767, Math.min(32767, musica.readInt16LE(i) + efeitos.readInt16LE(i))), i);
  return saida;
}

/** Pasta do projeto Remotion e o programa dele; undefined se não estiver instalado (npm ci em remotion/). */
export function remotionInstalado(raiz = process.cwd()): { pasta: string; cli: string } | undefined {
  const pasta = join(raiz, 'remotion');
  const cli = join(pasta, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  return existsSync(cli) ? { pasta, cli } : undefined;
}

/** Desenha o Reel com o Remotion e grava em `saida`. Devolve o motivo da falha, ou undefined se o vídeo foi gravado. */
export async function gravarComRemotion(itens: Array<{ oferta: OfertaAvaliada; imagem: string }>, chave: string, saida: string, config: Config, comentaQuero: boolean): Promise<string | undefined> {
  if (!config.instagram.reelRemotion) return 'desligado (REEL_REMOTION=0)';
  const remotion = remotionInstalado();
  if (!remotion) return 'o Remotion não está instalado (npm ci em remotion/)';
  const tmp = mkdtempSync(join(tmpdir(), 'remotion-'));
  // O áudio vai para a pasta public do projeto (é de lá que o Remotion lê os arquivos), com nome único, e sai no fim.
  const audio = `reel-audio-${chave.replace(/[^a-z0-9-]/gi, '')}.wav`;
  const caminhoDoAudio = join(remotion.pasta, 'public', audio);
  try {
    const props: PropsDoRemotion = { ...propsDoRemotion(itens, comentaQuero), audio };
    writeFileSync(caminhoDoAudio, audioDoRemotion(itens.length, chave));
    const arquivoDosProps = join(tmp, 'props.json');
    writeFileSync(arquivoDosProps, JSON.stringify(props));
    await executar(process.execPath, [remotion.cli, 'render', 'src/index.ts', 'Achados', saida, `--props=${arquivoDosProps}`, '--log=error'], { cwd: remotion.pasta, timeout: 6 * 60_000, maxBuffer: 20_000_000 });
    return existsSync(saida) ? undefined : 'o Remotion terminou sem gravar o vídeo';
  } catch (e) {
    const erro = e as Error & { stderr?: string };
    return `o Remotion falhou (${(erro.stderr || erro.message).toString().trim().slice(0, 300)})`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(caminhoDoAudio, { force: true });
  }
}
