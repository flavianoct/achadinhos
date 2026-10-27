import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pedirAoGemini } from './blog.ts';
import { normalizar } from './categoria.ts';
import type { Config } from './config.ts';
import { formatarVendas } from './mensagem.ts';
import { CORES_DO_NICHO } from './moldes.ts';
import { estiloDaMusica, sintetizarEfeitos, sintetizarMusica, type Efeito } from './musica.ts';
import { seloDaOferta, tituloParaArte, type Fetch } from './social.ts';
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
  /** "+80 ACHADOS POR DIA NO GRUPO" (o fim do vídeo); vazio, não aparece. */
  grupo?: string;
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
export function propsDoRemotion(itens: Array<{ oferta: OfertaAvaliada; imagem: string }>, comentaQuero: boolean, nomesDaIa?: string[]): PropsDoRemotion {
  const n1 = itens[0]!.oferta;
  // "O Nº 1 É O MAIS VENDIDO" só quando é verdade; senão, a promessa é só ver o nº 1.
  const maisVendido = (n1.vendas ?? 0) > 0 && itens.every((it) => (it.oferta.vendas ?? 0) <= (n1.vendas ?? 0));
  return {
    itens: itens.map(({ oferta, imagem }, i) => ({
      nome: tituloParaArte(nomesDaIa?.[i] || oferta.titulo, 22, 2),
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

/** Palavras que o nome curto não pode ter: preço, desconto e promessa são assunto dos dados, não da IA. */
const PROIBIDAS_NO_NOME = /r\$|%|\b(melhor|melhores|barato|barata|baratissimo|promo|promocao|oferta|desconto|gratis|frete|mais vendido|imperdivel|top|incrivel|perfeito|garantido|original)\b/;

/**
 * O nome curto que a IA escreveu serve? Até 40 letras, sem preço nem promessa, e com pelo menos uma palavra do título de verdade
 * (para a IA não trocar o produto por outro).
 */
export function nomeDaIaServe(nome: string, tituloOriginal: string): boolean {
  const n = normalizar(nome.trim());
  if (!n || n.length > 40 || n.length < 4 || PROIBIDAS_NO_NOME.test(n)) return false;
  const doTitulo = new Set(normalizar(tituloOriginal).split(/[^a-z0-9]+/).filter((p) => p.length >= 4));
  return n.split(/[^a-z0-9]+/).some((p) => doTitulo.has(p));
}

/**
 * Pede à IA do robô (Gemini) um nome curto e claro para cada produto do Reel ("Secador profissional Taiff" em vez do título enorme da loja).
 * Devolve só os nomes que passam na conferência (os outros ficam vazios e o vídeo usa o título cortado). Sem IA ou com erro, devolve undefined.
 */
export async function nomesDaIa(titulos: string[], config: Config, fetchFn: Fetch = fetch): Promise<string[] | undefined> {
  const b = config.blog;
  if (b.ia !== 'gemini' || !b.geminiChave || !titulos.length) return undefined;
  const prompt = [
    'Para cada produto abaixo, escreva um nome curto para aparecer em letras grandes num vídeo de ofertas.',
    'Regras: até 32 caracteres; diga o que o produto é e, se ajudar, a marca ou o detalhe que chama a atenção; português do Brasil;',
    'sem preço, sem porcentagem, sem "melhor", "barato", "promoção", "oferta", "frete", "imperdível" ou qualquer promessa; não invente nada que não esteja no nome.',
    'Responda só com um JSON assim: {"nomes": ["...", "..."]}, na mesma ordem.',
    '',
    ...titulos.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');
  for (const modelo of [b.geminiModelo, b.geminiReserva].filter(Boolean)) {
    try {
      const resposta = await pedirAoGemini(b.geminiChave, modelo, prompt, fetchFn);
      const json = /\{[\s\S]*\}/.exec(resposta)?.[0];
      const nomes = json ? (JSON.parse(json) as { nomes?: unknown }).nomes : undefined;
      if (!Array.isArray(nomes)) continue;
      return titulos.map((t, i) => (typeof nomes[i] === 'string' && nomeDaIaServe(nomes[i] as string, t) ? (nomes[i] as string).trim() : ''));
    } catch {
      // Tenta o modelo reserva; sem nenhum, o vídeo usa os títulos cortados.
    }
  }
  return undefined;
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
export async function gravarComRemotion(itens: Array<{ oferta: OfertaAvaliada; imagem: string }>, chave: string, saida: string, config: Config, comentaQuero: boolean, fetchFn: Fetch = fetch, grupo?: string): Promise<string | undefined> {
  if (!config.instagram.reelRemotion) return 'desligado (REEL_REMOTION=0)';
  const remotion = remotionInstalado();
  if (!remotion) return 'o Remotion não está instalado (npm ci em remotion/)';
  // Caminho absoluto: o Remotion roda dentro da pasta remotion/, e um caminho relativo (blog/social/...) iria parar lá dentro.
  const destino = resolve(saida);
  const tmp = mkdtempSync(join(tmpdir(), 'remotion-'));
  // O áudio vai para a pasta public do projeto (é de lá que o Remotion lê os arquivos), com nome único, e sai no fim.
  const audio = `reel-audio-${chave.replace(/[^a-z0-9-]/gi, '')}.wav`;
  const caminhoDoAudio = join(remotion.pasta, 'public', audio);
  try {
    const nomes = await nomesDaIa(itens.map((it) => it.oferta.titulo), config, fetchFn);
    if (nomes) console.log(`[reel] nomes da IA: ${nomes.map((n) => n || '(título da loja)').join(' | ')}`);
    const props: PropsDoRemotion = { ...propsDoRemotion(itens, comentaQuero, nomes), audio, ...(grupo ? { grupo } : {}) };
    writeFileSync(caminhoDoAudio, audioDoRemotion(itens.length, chave));
    const arquivoDosProps = join(tmp, 'props.json');
    writeFileSync(arquivoDosProps, JSON.stringify(props));
    await executar(process.execPath, [remotion.cli, 'render', 'src/index.ts', 'Achados', destino, `--props=${arquivoDosProps}`, '--log=error'], { cwd: remotion.pasta, timeout: 6 * 60_000, maxBuffer: 20_000_000 });
    return existsSync(destino) ? undefined : 'o Remotion terminou sem gravar o vídeo';
  } catch (e) {
    const erro = e as Error & { stderr?: string };
    return `o Remotion falhou (${(erro.stderr || erro.message).toString().trim().slice(0, 300)})`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(caminhoDoAudio, { force: true });
  }
}

export interface PropsDoCarrosselRemotion {
  titulo: [string, string];
  fato: string;
  itens: ItemDoRemotion[];
  comentaQuero: boolean;
  grupo?: string;
}

/**
 * Desenha as imagens do carrossel com o Remotion (composição "Carrossel": cada quadro é uma imagem) e grava em `pasta` com os nomes
 * pedidos, na ordem. Devolve o motivo da falha, ou undefined se todas as imagens foram gravadas.
 */
export async function gravarCarrosselComRemotion(props: PropsDoCarrosselRemotion, pasta: string, nomes: string[], config: Config): Promise<string | undefined> {
  if (!config.instagram.reelRemotion) return 'desligado (REEL_REMOTION=0)';
  const remotion = remotionInstalado();
  if (!remotion) return 'o Remotion não está instalado (npm ci em remotion/)';
  const tmp = mkdtempSync(join(tmpdir(), 'carrossel-'));
  try {
    const arquivoDosProps = join(tmp, 'props.json');
    writeFileSync(arquivoDosProps, JSON.stringify(props));
    const saida = join(tmp, 'imagens');
    await executar(process.execPath, [remotion.cli, 'render', 'src/index.ts', 'Carrossel', saida, '--sequence', '--image-format=png', `--props=${arquivoDosProps}`, '--log=error'], { cwd: remotion.pasta, timeout: 5 * 60_000, maxBuffer: 20_000_000 });
    const quadros = readdirSync(saida)
      .filter((a) => a.endsWith('.png'))
      .sort((a, b) => Number(/(\d+)\.png$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.png$/.exec(b)?.[1] ?? 0));
    if (quadros.length !== nomes.length) return `o Remotion gravou ${quadros.length} imagens, e o carrossel tem ${nomes.length}`;
    quadros.forEach((q, i) => copyFileSync(join(saida, q), resolve(pasta, nomes[i]!)));
    return undefined;
  } catch (e) {
    const erro = e as Error & { stderr?: string };
    return `o Remotion falhou (${(erro.stderr || erro.message).toString().trim().slice(0, 300)})`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Quadros do Reel de destaque (um produto). Precisam ser os mesmos de QUADROS_DO_DESTAQUE em remotion/src/Destaque.tsx (um teste confere). */
export const QUADROS_DO_DESTAQUE = { gancho: 45, detalhe: 50, fim: 105 };

/** Os efeitos do destaque: pop no carimbo do fato, whoosh em cada corte, pop em cada prova e ding no pedido de comentário. */
export function efeitosDoDestaque(): Efeito[] {
  const q = QUADROS_DO_DESTAQUE;
  const cenas = [q.gancho, q.detalhe, q.detalhe, q.detalhe, q.fim].map((n) => n / FPS);
  const efeitos: Efeito[] = [{ t: 0.3, tipo: 'pop' }];
  let t = 0;
  cenas.forEach((d, i) => {
    if (i > 0) efeitos.push({ t: Math.max(0, t - 0.12), tipo: 'whoosh' });
    if (i > 0 && i < cenas.length - 1) efeitos.push({ t: t + 0.22, tipo: 'pop' });
    if (i === cenas.length - 1) efeitos.push({ t: t + 0.3, tipo: 'ding' });
    t += d;
  });
  return efeitos;
}

/** Desenha o Reel de destaque (composição "Destaque") e grava em `saida`. Devolve o motivo da falha, ou undefined se gravou. */
export async function gravarDestaqueComRemotion(item: { oferta: OfertaAvaliada; imagem: string }, nome: string | undefined, chave: string, saida: string, config: Config, comentaQuero: boolean): Promise<string | undefined> {
  if (!config.instagram.reelRemotion) return 'desligado (REEL_REMOTION=0)';
  const remotion = remotionInstalado();
  if (!remotion) return 'o Remotion não está instalado (npm ci em remotion/)';
  const destino = resolve(saida);
  const tmp = mkdtempSync(join(tmpdir(), 'destaque-'));
  const audio = `reel-audio-${chave.replace(/[^a-z0-9-]/gi, '')}.wav`;
  const caminhoDoAudio = join(remotion.pasta, 'public', audio);
  try {
    const q = QUADROS_DO_DESTAQUE;
    const total = (q.gancho + 3 * q.detalhe + q.fim) / FPS;
    const musica = sintetizarMusica(total, estiloDaMusica(chave));
    const efeitos = sintetizarEfeitos(total, efeitosDoDestaque());
    const mix = Buffer.from(musica);
    for (let i = 44; i < Math.min(musica.length, efeitos.length); i += 2) mix.writeInt16LE(Math.max(-32767, Math.min(32767, musica.readInt16LE(i) + efeitos.readInt16LE(i))), i);
    writeFileSync(caminhoDoAudio, mix);
    const o = item.oferta;
    const props = {
      nome: tituloParaArte(nome || o.titulo, 22, 2),
      imagem: item.imagem,
      fato: fatoDoGancho(o),
      provas: provasDoProduto(o).slice(0, 3),
      cor: CORES_DO_NICHO[o.categoria] ?? CORES_DO_NICHO.geral!,
      comentaQuero,
      audio,
    };
    const arquivoDosProps = join(tmp, 'props.json');
    writeFileSync(arquivoDosProps, JSON.stringify(props));
    await executar(process.execPath, [remotion.cli, 'render', 'src/index.ts', 'Destaque', destino, `--props=${arquivoDosProps}`, '--log=error'], { cwd: remotion.pasta, timeout: 6 * 60_000, maxBuffer: 20_000_000 });
    return existsSync(destino) ? undefined : 'o Remotion terminou sem gravar o vídeo';
  } catch (e) {
    const erro = e as Error & { stderr?: string };
    return `o Remotion falhou (${(erro.stderr || erro.message).toString().trim().slice(0, 300)})`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(caminhoDoAudio, { force: true });
  }
}
