import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { diaDaSemana, escolherParaCarrossel } from './carrossel.ts';
import type { Config } from './config.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { estiloDaMusica, sintetizarEfeitos, sintetizarMusica, type Efeito } from './musica.ts';
import { fundo, marca, MARCA } from './moldes.ts';
import { baixarImagemComoDataUri, montarSvgDoStory, renderizarPng, temWhatsapp, type Fetch } from './social.ts';
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
  const titulo = jaCriados === 0 ? `Caiu mesmo? ${itens.length} achados de hoje` : `Caiu mesmo? Mais ${itens.length} achados de hoje`;
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

/** Abertura do Reel: a pergunta que prende a atenção, sem preço. */
export function svgDaAberturaDoReel(n: number): string {
  return moldura(
    logo(300) +
      texto(850, 'CAIU', 200, MARCA.amarelo, 900) +
      texto(1050, 'MESMO?', 200, MARCA.amarelo, 900) +
      `<rect x="270" y="1130" width="540" height="12" rx="6" fill="${MARCA.vermelho}" transform="rotate(-3 540 1136)"/>` +
      texto(1330, `${n} achados de hoje`, 70, MARCA.branco, 700) +
      texto(1420, 'Veja até o final', 44, MARCA.suave, 500),
  );
}

/** Fechamento do Reel: leva ao grupo, onde está o preço. */
export function svgDoFechamentoDoReel(): string {
  return moldura(
    logo(300) +
      texto(760, 'O PREÇO', 160, MARCA.branco, 900) +
      texto(910, 'ESTÁ NO GRUPO', 112, MARCA.amarelo, 900) +
      texto(1040, 'Achados assim todo dia, de graça', 50, MARCA.branco, 700) +
      `<rect x="140" y="1120" width="800" height="150" rx="40" fill="${MARCA.amarelo}"/>` +
      texto(1214, 'ENTRE PELO LINK NA BIO', 46, MARCA.f1, 900) +
      texto(1420, 'Publi: links de afiliado', 36, MARCA.suave, 500),
  );
}

/** Legenda do Reel: nomes curtos dos produtos, o aviso de que o preço está no grupo, pedido para salvar e o aviso de publi. */
export function legendaDoReel(dados: DadosDoReel, config: Config): string {
  const curto = (t: string) => t.split(/\s+/).slice(0, 7).join(' ').replace(/[,;:-]+$/, '');
  const linhas = dados.itens.map((it, i) => `${i + 1}. ${curto(it.oferta.titulo)}`);
  const telegram = config.blog.telegramLink ? `\n📲 Ofertas na hora no Telegram (link na bio)` : '\n🔗 Link na bio';
  return [
    `🔥 ${dados.titulo}`,
    '',
    ...linhas,
    '',
    `💰 O preço de agora está no grupo: link na bio.\nSalva para não perder e manda para quem vai gostar 💾${telegram}${temWhatsapp(config) ? '\n💬 Também no WhatsApp: canal e grupo, link na bio' : ''}`,
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
export async function montarVideo(o: { svgs: string[]; duracoes: number[]; chave: string; pasta: string; efeitos?: Efeito[] }): Promise<string | undefined> {
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
        '-vf', `scale=1188:2112,zoompan=z='min(1+0.0009*on,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${quadros}:s=1080x1920:fps=${FPS},format=yuv420p`,
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
      filtro += `${ultimo}[${i}:v]xfade=transition=fade:duration=${TRANSICAO}:offset=${(acumulado - TRANSICAO).toFixed(2)}${saida};`;
      ultimo = saida;
      acumulado += duracoes[i]! - TRANSICAO;
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
 * Monta o mp4 do Reel em blog/social/: abertura, uma tela por produto (a arte de Story do robô, com zoom suave),
 * fechamento, e a trilha sintetizada ao fundo. Devolve o aviso de erro, ou undefined se o vídeo foi gravado.
 */
export async function gravarReel(banco: Banco, config: Config, agora: Date): Promise<string | undefined> {
  if (!config.social.ativo || !config.instagram.ativo || config.instagram.reelsPorDia <= 0) return undefined;
  const pendente = banco.reelPendente(agora);
  if (!pendente) return undefined;
  const dados = JSON.parse(pendente.dados) as DadosDoReel;
  if (dados.formato !== 'reel' || !dados.itens?.length) return undefined;
  const svgs = [svgDaAberturaDoReel(dados.itens.length), ...dados.itens.map((it) => montarSvgDoStory(it.oferta, it.imagem)), svgDoFechamentoDoReel()];
  const duracoes = svgs.map((_, i) => (i === 0 ? 2.5 : i === svgs.length - 1 ? 3 : 4.5));
  return montarVideo({ svgs, duracoes, chave: pendente.chave, pasta: join(config.blog.pasta, 'social') });
}
