import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { diaDaSemana, escolherParaCarrossel } from './carrossel.ts';
import type { Config } from './config.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { estiloDaMusica, sintetizarEfeitos, sintetizarMusica, type Efeito } from './musica.ts';
import { CORES_DO_NICHO, esc, fundo, marca, MARCA } from './moldes.ts';
import { formatarVendas } from './mensagem.ts';
import { baixarImagemComoDataUri, comentaQueroAtivo, renderizarPng, seloDaOferta, temWhatsapp, tituloParaArte, type Fetch } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

const executar = promisify(execFile);

/** Reel "Caiu mesmo? 3 achados de hoje": as ofertas e as fotos, para refazer o vídeo a cada rodada até ele ser publicado. */
export interface DadosDoReel {
  formato: 'reel';
  titulo: string;
  itens: Array<{ oferta: OfertaAvaliada; imagem: string }>;
}

const ITENS_DO_REEL = 3;
export const FPS = 30;
export const TRANSICAO = 0.4;

function nomeDoArquivo(chave: string): string {
  return `${chave.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.mp4`;
}

/** Endereço do vídeo no site (o Instagram busca o arquivo por aqui). */
export function arquivoDoReel(chave: string): string {
  return nomeDoArquivo(chave);
}

/**
 * Este é o momento do quiz? Com o quiz ligado, os ÚLTIMOS QUIZ_POR_DIA Reels do dia viram quiz (nos dias QUIZ_DIAS, 0 = domingo).
 * `jaCriados` é quantos Reels do dia já nasceram: com 2 Reels por dia e 1 quiz, o primeiro é o Reel normal e o segundo, o quiz.
 */
export function ehVezDoQuiz(config: Config, jaCriados: number, agora: Date): boolean {
  const q = config.quiz;
  if (!q.ativo || q.porDia <= 0 || !q.dias.includes(diaDaSemana(agora))) return false;
  const quizzes = Math.min(q.porDia, config.instagram.reelsPorDia);
  return jaCriados >= config.instagram.reelsPorDia - quizzes;
}

/**
 * Cria o próximo Reel do dia (até `INSTAGRAM_REELS_POR_DIA`), com os melhores produtos que passam no filtro de qualidade do Instagram.
 * Cada Reel só nasce perto da sua hora de publicar e depois que o anterior já saiu; os produtos de um não se repetem no outro.
 */
export async function prepararReel(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const ig = config.instagram;
  if (!config.social.ativo || !ig.ativo || ig.reelsPorDia <= 0) return false;
  const jaCriados = banco.reelsCriadosNoDia(agora);
  if (jaCriados >= ig.reelsPorDia || banco.reelPendente(agora)) return false;
  // O Reel desta vaga é o quiz (src/quiz.ts), não o "Caiu mesmo?".
  if (ehVezDoQuiz(config, jaCriados, agora)) return false;
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return false;
  // Só prepara perto da hora de publicar (1 hora antes da janela deste Reel), para o desconto e o selo de menor preço serem de agora.
  const janelas = [...ig.horariosReels].sort((a, b) => a - b);
  if (janelas.length > 0 && hora < (janelas[Math.min(jaCriados, janelas.length - 1)] as number) - 1) return false;

  // Usa a mesma escolha do carrossel (qualidade, foto e variedade de categorias), com o teto de preço do dia.
  const config3 = { ...config, instagram: { ...ig, carrosselItens: ITENS_DO_REEL } };
  const escolha = escolherParaCarrossel(banco.melhoresProdutos({ horas: 36, limite: 150 }, agora), config3, agora);
  if (!escolha) return false;
  const itens: DadosDoReel['itens'] = [];
  // O segundo Reel do dia pula os produtos que o primeiro já usou.
  for (const oferta of escolha.ordem.slice(jaCriados * ITENS_DO_REEL, jaCriados * ITENS_DO_REEL + ITENS_DO_REEL * 2)) {
    if (itens.length >= ITENS_DO_REEL) break;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    if (imagem) itens.push({ oferta, imagem });
  }
  if (itens.length < ITENS_DO_REEL) return false;
  const titulo = jaCriados === 0 ? `Qual você levaria? ${itens.length} achados de hoje` : `Qual você levaria? Mais ${itens.length} achados de hoje`;
  const dados: DadosDoReel = { formato: 'reel', titulo, itens };
  banco.salvarReel(jaCriados === 0 ? `reel-${diaDe(agora)}` : `reel-${diaDe(agora)}-${jaCriados + 1}`, titulo, JSON.stringify(dados), agora);
  return true;
}

const fonte = 'font-family="Liberation Sans,DejaVu Sans,Arial,Helvetica,sans-serif"';
export const moldura = (corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
${fundo(1080, 1920)}${corpo}</svg>`;
export const texto = (y: number, s: string, tam: number, cor: string = MARCA.branco, peso = 800) =>
  `<text x="540" y="${y}" text-anchor="middle" ${fonte} font-size="${tam}" font-weight="${peso}" font-style="italic" fill="${cor}">${s}</text>`;
export const logo = (y: number) => marca(540, y, 64, 'centro');

// ───────────── Telas do Reel ─────────────
// Feito para a pessoa assistir até o fim e de novo: o produto aparece no primeiro quadro (nada de tela só de texto), cada produto fica
// pouco tempo (ritmo), uma barra mostra quanto falta, e o fim é quase igual ao começo (o vídeo emenda num loop e é visto outra vez).
// Nunca mostra preço em reais: o selo e a prova são o que é verdade por mais tempo (desconto confirmado, menor preço, em alta, vendidos).

const textoSvg = (x: number, y: number, tam: number, cor: string, s: string, extra = '', peso = 900) =>
  `<text x="${x}" y="${y}" text-anchor="middle" ${fonte} font-size="${tam}" font-weight="${peso}" fill="${cor}"${extra}>${esc(s)}</text>`;

/** Tamanho de fonte para a linha caber na largura (letra maiúscula em negrito ocupa cerca de 0,72 do tamanho). */
export function tamanhoQueCabe(s: string, base: number, largura = 940): number {
  return Math.min(base, Math.floor(largura / (s.length * 0.72)));
}

/** Foto do produto num cartão branco, sem distorcer. */
function cartaoComFoto(imagem: string, x: number, y: number, w: number, h: number, raio: number, margem: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${raio}" fill="${MARCA.branco}"/>
<image href="${imagem}" x="${x + margem}" y="${y + margem}" width="${w - 2 * margem}" height="${h - 2 * margem}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** O número do produto num círculo amarelo, que a pessoa usa para comentar ("comenta 2"). */
const numero = (cx: number, cy: number, r: number, n: number) =>
  `<circle cx="${cx}" cy="${cy + 6}" r="${r}" fill="#B38F00"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${MARCA.amarelo}"/>${textoSvg(cx, cy + r * 0.4, r * 1.15, MARCA.f1, String(n))}`;

/** Os 3 produtos lado a lado, numerados: o gancho do começo e a tela do fim (por isso o vídeo emenda num loop). */
function telaDaEscolha(itens: DadosDoReel['itens'], cima: [string, string], baixo: [string, string]): string {
  const n = itens.length;
  const gap = 24;
  const w = Math.floor((960 - gap * (n - 1)) / n);
  const h = Math.round(w * 1.65);
  const y = 720;
  const cartoes = itens
    .map((it, i) => {
      const x = 60 + i * (w + gap);
      return `${cartaoComFoto(it.imagem, x, y, w, h, 32, 16)}${numero(x + 46, y - 6, 52, i + 1)}`;
    })
    .join('\n');
  return moldura(
    `${logo(330)}
${textoSvg(540, 520, tamanhoQueCabe(cima[0], 104), MARCA.amarelo, cima[0], ' font-style="italic"')}
${textoSvg(540, 610, tamanhoQueCabe(cima[1], 48), MARCA.branco, cima[1])}
${cartoes}
${textoSvg(540, y + h + 150, tamanhoQueCabe(baixo[0], 96), MARCA.amarelo, baixo[0], ' font-style="italic"')}
${textoSvg(540, y + h + 225, tamanhoQueCabe(baixo[1], 42), MARCA.branco, baixo[1])}`,
  );
}

/** O que os 3 produtos têm de melhor, para a linha de baixo do gancho (só o que os dados provam). */
function provaDoGancho(itens: DadosDoReel['itens']): string {
  const selos = itens.map((it) => seloDaOferta(it.oferta)?.tipo);
  if (selos.includes('febre')) return 'O QUE TÁ TODO MUNDO COMPRANDO';
  if (selos.includes('desconto')) return 'COM DESCONTO DE VERDADE';
  if (selos.includes('historico')) return 'NO MENOR PREÇO DO MÊS';
  return 'OS ACHADOS DE HOJE';
}

/** Primeiro quadro: já mostra os produtos e faz a pessoa escolher (é no primeiro segundo que ela decide ficar). */
export function svgDoGancho(itens: DadosDoReel['itens']): string {
  return telaDaEscolha(itens, ['QUAL VOCÊ LEVARIA?', provaDoGancho(itens)], [itens.map((_, i) => i + 1).join(', ').replace(/, (\d+)$/, ' OU $1') + '?', 'ASSISTE E ESCOLHE']);
}

/** Último quadro: igual ao gancho, com o pedido de comentário (com o "comenta QUERO" ligado, o número vira o link no direct). */
export function svgDoFim(itens: DadosDoReel['itens'], comentaQuero: boolean): string {
  const numeros = itens.map((_, i) => i + 1).join(', ').replace(/, (\d+)$/, ' OU $1');
  return telaDaEscolha(itens, ['QUAL VOCÊ LEVARIA?', provaDoGancho(itens)], [`COMENTA ${numeros}`, comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'O LINK DE TODOS ESTÁ NA BIO']);
}

/** Barra de progresso do topo: um traço por produto, preenchido até o atual (a pessoa vê quanto falta e fica). */
function barra(atual: number, total: number): string {
  const gap = 14;
  const w = (960 - gap * (total - 1)) / total;
  return Array.from({ length: total }, (_, i) => `<rect x="${(60 + i * (w + gap)).toFixed(1)}" y="268" width="${w.toFixed(1)}" height="12" rx="6" fill="${i <= atual ? MARCA.amarelo : MARCA.branco}" fill-opacity="${i <= atual ? 1 : 0.25}"/>`).join('');
}

/** Selo do canto da foto (o mesmo critério da arte do feed): desconto confirmado num círculo, menor preço ou em alta numa pílula. */
function seloDoItem(o: OfertaAvaliada): string {
  const selo = seloDaOferta(o);
  if (!selo) return '';
  if (selo.tipo === 'desconto') return `<g transform="rotate(-8 900 470)"><circle cx="900" cy="476" r="110" fill="#A80400"/><circle cx="900" cy="470" r="110" fill="${MARCA.vermelho}"/>${textoSvg(900, 486, 72, MARCA.branco, selo.texto)}${textoSvg(900, 530, 32, MARCA.amarelo, 'OFF', ' letter-spacing="3"')}</g>`;
  const cor = selo.tipo === 'historico' ? MARCA.amarelo : MARCA.vermelho;
  const l = Math.max(240, selo.texto.length * 26 + 80);
  return `<rect x="${1000 - l}" y="352" width="${l}" height="72" rx="36" fill="${cor}"/>${textoSvg(1000 - l / 2, 400, 36, cor === MARCA.amarelo ? MARCA.f1 : MARCA.branco, selo.texto)}`;
}

/** Prova real do produto numa linha ("Nota 4,8 · 2,5 mil vendidos · Frete grátis"). */
function provaDoItem(o: OfertaAvaliada): string {
  return [o.nota && o.nota >= 4 ? `Nota ${o.nota.toFixed(1).replace('.', ',')}` : '', o.vendas && o.vendas >= 100 ? `${formatarVendas(o.vendas)} vendidos` : '', o.freteGratis ? 'Frete grátis' : ''].filter(Boolean).join(' · ');
}

/** Um produto do Reel: número grande, foto grande, nome curto, prova e selo. Pouco texto: dá para ler em 2 segundos. */
export function svgDoItem(it: DadosDoReel['itens'][number], i: number, total: number): string {
  const titulo = tituloParaArte(it.oferta.titulo, 24, 2);
  const prova = provaDoItem(it.oferta);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
${fundo(1080, 1920, CORES_DO_NICHO[it.oferta.categoria] ?? CORES_DO_NICHO.geral)}
${barra(i, total)}
${cartaoComFoto(it.imagem, 60, 380, 960, 900, 48, 36)}
${numero(150, 400, 84, i + 1)}
${seloDoItem(it.oferta)}
${titulo.map((l, k) => textoSvg(540, 1390 + k * 78, tamanhoQueCabe(l, 66), MARCA.branco, l)).join('\n')}
${prova ? textoSvg(540, 1390 + titulo.length * 78 + 34, tamanhoQueCabe(prova, 40), MARCA.amarelo, prova) : ''}
${textoSvg(540, 1630, 24, MARCA.suave, 'Publi · link de afiliado · preço pode mudar', '', 700)}
</svg>`;
}

/** Legenda do Reel: a escolha e o pedido de comentário logo no começo, os nomes numerados, o aviso de publi. Nunca preço em reais. */
export function legendaDoReel(dados: DadosDoReel, config: Config, comentaQuero = false): string {
  const curto = (t: string) => t.split(/\s+/).slice(0, 7).join(' ').replace(/[,;:-]+$/, '');
  const linhas = dados.itens.map((it, i) => `${i + 1}. ${curto(it.oferta.titulo)}`);
  const numeros = dados.itens.map((_, i) => i + 1).join(', ').replace(/, (\d+)$/, ' ou $1');
  const telegram = config.blog.telegramLink ? `\n📲 Ofertas na hora no Telegram (link na bio)` : '';
  return [
    `👀 ${dados.titulo} #publi`,
    comentaQuero ? `💬 Comenta o número (${numeros}) que eu te mando o link no direct` : `💬 Qual você levaria? Comenta ${numeros} 👇`,
    '',
    ...linhas,
    '',
    comentaQuero ? '💰 O preço de agora vai junto com o link, no seu direct.' : '💰 O preço de agora está no link da bio.',
    `Salva para não perder e manda para quem vai gostar 💾${telegram}${temWhatsapp(config) ? '\n💬 Também no WhatsApp: canal e grupo, link na bio' : ''}`,
    '',
    'Publi: links de afiliado. Preços e estoque podem mudar a qualquer momento.',
    '',
    '#achadinhos #ofertas #promocao #desconto #compras',
  ].join('\n');
}

export function ffmpegDisponivel(): string {
  return (process.env.FFMPEG ?? '').trim() || 'ffmpeg';
}

async function rodar(ffmpeg: string, args: string[]): Promise<void> {
  await executar(ffmpeg, ['-y', '-loglevel', 'error', ...args], { timeout: 180_000, maxBuffer: 10_000_000 });
}

/** Quando cada tela começa no vídeo final (segundos), já descontando a sobreposição das transições. */
export function iniciosDasTelas(duracoes: number[]): number[] {
  const inicios: number[] = [];
  let t = 0;
  for (let i = 0; i < duracoes.length; i++) {
    inicios.push(t);
    t += duracoes[i]! - TRANSICAO;
  }
  return inicios;
}

/** Duração total do vídeo (segundos) de telas com essas durações. */
export function duracaoTotal(duracoes: number[]): number {
  return duracoes.reduce((total, d) => total + d, 0) - TRANSICAO * (duracoes.length - 1);
}

/**
 * Monta um mp4 vertical a partir de uma sequência de telas (SVG): cada tela vira um clipe com zoom suave, as telas se ligam com
 * transição e a trilha sintetizada fica ao fundo (com `efeitos`, como o tic-tac do quiz, por cima dela). Grava em `pasta`
 * com o nome do arquivo e devolve o aviso de erro, ou undefined se o vídeo foi gravado.
 */
export async function montarVideo(o: { svgs: string[]; duracoes: number[]; chave: string; pasta: string; efeitos?: Efeito[]; transicao?: { tipo: string; duracao: number }; zoom?: number }): Promise<string | undefined> {
  const transicao = o.transicao ?? { tipo: 'fade', duracao: TRANSICAO };
  const ffmpeg = ffmpegDisponivel();
  mkdirSync(o.pasta, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'reel-'));
  try {
    const { svgs, duracoes } = o;
    const segmentos: string[] = [];
    for (let i = 0; i < svgs.length; i++) {
      const png = await renderizarPng(svgs[i]!, 1080);
      if (!png) return 'Reel: o conversor de imagens não está disponível.';
      const arte = join(tmp, `q${i}.png`);
      writeFileSync(arte, png);
      const saida = join(tmp, `s${i}.mp4`);
      const quadros = Math.round(duracoes[i]! * FPS);
      await rodar(ffmpeg, [
        '-i', arte,
        '-vf', `scale=1188:2112,zoompan=z='min(1+${o.zoom ?? 0.0009}*on,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${quadros}:s=1080x1920:fps=${FPS},format=yuv420p`,
        '-t', String(duracoes[i]),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        saida,
      ]);
      segmentos.push(saida);
    }

    let filtro = '';
    let acumulado = duracoes[0]!;
    let ultimo = '[0:v]';
    for (let i = 1; i < segmentos.length; i++) {
      const saida = i === segmentos.length - 1 ? '[v]' : `[x${i}]`;
      filtro += `${ultimo}[${i}:v]xfade=transition=${transicao.tipo}:duration=${transicao.duracao}:offset=${(acumulado - transicao.duracao).toFixed(2)}${saida};`;
      ultimo = saida;
      acumulado += duracoes[i]! - transicao.duracao;
    }
    filtro = filtro.replace(/;$/, '');

    const musica = join(tmp, 'musica.wav');
    writeFileSync(musica, sintetizarMusica(acumulado + 0.5, estiloDaMusica(o.chave)));
    const entradas = [...segmentos.flatMap((s) => ['-i', s]), '-i', musica];
    let audio = `${segmentos.length}:a`;
    if (o.efeitos?.length) {
      const efeitos = join(tmp, 'efeitos.wav');
      writeFileSync(efeitos, sintetizarEfeitos(acumulado + 0.5, o.efeitos));
      entradas.push('-i', efeitos);
      filtro += `;[${segmentos.length}:a][${segmentos.length + 1}:a]amix=inputs=2:duration=first:normalize=0[a]`;
      audio = '[a]';
    }
    const final = join(o.pasta, nomeDoArquivo(o.chave));
    await rodar(ffmpeg, [
      ...entradas,
      '-filter_complex', filtro,
      '-map', '[v]', '-map', audio,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-r', String(FPS), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
      final,
    ]);
    return undefined;
  } catch (e) {
    const erro = e as NodeJS.ErrnoException & { stderr?: string };
    if (erro.code === 'ENOENT') return 'Reel: o ffmpeg não está instalado nesta máquina.';
    return `Reel: não consegui montar o vídeo (${(erro.stderr ?? erro.message).toString().slice(0, 200)}).`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Os efeitos do Reel, no tempo das telas: um "whoosh" em cada troca de tela, um "pop" quando o número do produto aparece e um "ding"
 * no fim (a hora de comentar). Sincronizados com a imagem, prendem mais do que só a música.
 */
export function efeitosDoReel(duracoes: number[]): Efeito[] {
  const efeitos: Efeito[] = [];
  let inicio = 0;
  for (let i = 0; i < duracoes.length; i++) {
    if (i > 0) efeitos.push({ t: Math.max(0, inicio - 0.05), tipo: 'whoosh' });
    const entra = inicio + (i > 0 ? TRANSICAO_DO_REEL.duracao : 0);
    if (i > 0 && i < duracoes.length - 1) efeitos.push({ t: entra + 0.05, tipo: 'pop' });
    if (i === duracoes.length - 1) efeitos.push({ t: entra + 0.1, tipo: 'ding' });
    inicio += duracoes[i]! - TRANSICAO_DO_REEL.duracao;
  }
  return efeitos;
}

/** Duração de cada tela do Reel (s): gancho curto, 2,6 s por produto e o fim. No total, uns 10 segundos. */
export const DURACOES_DO_REEL = { gancho: 1.6, item: 2.6, fim: 2.4 };
/** Transição do Reel: desliza para o lado, rápida (o esmaecido deixava o vídeo lento). */
export const TRANSICAO_DO_REEL = { tipo: 'slideleft', duracao: 0.3 };

/**
 * Monta o mp4 do Reel em blog/social/: o gancho (os produtos lado a lado), um produto por tela e o fim (igual ao gancho, com o pedido de
 * comentário), com a trilha ao fundo. Devolve o aviso de erro, ou undefined se o vídeo foi gravado.
 */
export async function gravarReel(banco: Banco, config: Config, agora: Date): Promise<string | undefined> {
  if (!config.social.ativo || !config.instagram.ativo || config.instagram.reelsPorDia <= 0) return undefined;
  const pendente = banco.reelPendente(agora);
  if (!pendente) return undefined;
  const dados = JSON.parse(pendente.dados) as DadosDoReel;
  if (dados.formato !== 'reel' || !dados.itens?.length) return undefined;
  const n = dados.itens.length;
  const svgs = [svgDoGancho(dados.itens), ...dados.itens.map((it, i) => svgDoItem(it, i, n)), svgDoFim(dados.itens, comentaQueroAtivo(banco, config, agora))];
  const duracoes = svgs.map((_, i) => (i === 0 ? DURACOES_DO_REEL.gancho : i === svgs.length - 1 ? DURACOES_DO_REEL.fim : DURACOES_DO_REEL.item));
  return montarVideo({ svgs, duracoes, chave: pendente.chave, pasta: join(config.blog.pasta, 'social'), transicao: TRANSICAO_DO_REEL, zoom: 0.0016, efeitos: efeitosDoReel(duracoes) });
}
