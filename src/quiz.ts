import { join } from 'node:path';
import type { Config } from './config.ts';
import { sorteio } from './convite.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { passaNoFiltroDoInstagram } from './instagram.ts';
import { formatarPreco } from './mensagem.ts';
import type { Efeito } from './musica.ts';
import { duracaoTotal, ehVezDoQuiz, iniciosDasTelas, logo, moldura, montarVideo, texto } from './reel.ts';
import { esc, MARCA } from './moldes.ts';
import { baixarImagemComoDataUri, temWhatsapp, type Fetch } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * Quiz "Preço certo" no Reel: 3 produtos, cada um com 3 preços (A, B e C, um deles o de verdade), uma contagem 3-2-1 e a revelação.
 * Usa o mesmo motor dos Reels (vídeo com ffmpeg, trilha sintetizada, hospedagem no blog e publicação no Instagram), só com telas
 * e efeitos sonoros próprios. A revelação mostra o preço de hoje, com o aviso de que pode mudar.
 */
export interface RodadaDoQuiz {
  oferta: OfertaAvaliada;
  /** A foto do produto, já embutida (data URI). */
  imagem: string;
  /** Os três preços em ordem crescente (A, B, C). */
  opcoes: number[];
  /** Índice do preço de verdade em `opcoes`. */
  correta: number;
}

export interface DadosDoQuiz {
  formato: 'quiz';
  titulo: string;
  rodadas: RodadaDoQuiz[];
}

const RODADAS = 3;
/** Preços fora desta faixa não rendem um bom palpite (muito baratos ou muito caros). */
const PRECO_MINIMO = 15;
const PRECO_MAXIMO = 1500;

/**
 * Os três preços de uma rodada: o de verdade e dois falsos plausíveis, com os mesmos centavos do verdadeiro (se ele termina em ,90,
 * os falsos também; senão o palpite seria óbvio). Os falsos ficam entre 25% e 75% longe do real, arredondados como um preço de loja,
 * e todos distantes entre si. Em ordem crescente: o sorteio decide só onde o certo cai. Mesma semente, mesmas opções.
 */
export function opcoesDePreco(preco: number, semente: string): { opcoes: number[]; correta: number } {
  const sorte = sorteio(`quiz:${semente}`);
  const inteiro = Math.floor(preco);
  const centavos = Math.round((preco - inteiro) * 100) / 100;
  const passo = inteiro >= 200 ? 10 : inteiro >= 50 ? 5 : 1;
  const arredondar = (v: number) => Math.max(passo === 1 ? 3 : passo, Math.round(v / passo) * passo);
  const folga = Math.max(passo, inteiro * 0.08);
  const distinto = (v: number, lista: number[]) => lista.every((x) => Math.abs(x - v) >= folga);
  // Metade das vezes um acima e um abaixo; o resto, os dois acima ou os dois abaixo.
  const p = sorte();
  const sentidos = p < 0.5 ? [1, -1] : p < 0.75 ? [1, 1] : [-1, -1];
  const inteiros = [inteiro];
  for (const s of sentidos) {
    for (let t = 0; t < 12; t++) {
      const v = arredondar(inteiro * (s > 0 ? 1.25 + sorte() * 0.5 : 0.55 + sorte() * 0.25));
      if (distinto(v, inteiros)) {
        inteiros.push(v);
        break;
      }
    }
  }
  for (let k = 1; inteiros.length < 3; k++) {
    const v = inteiro + passo * Math.max(2, Math.ceil((inteiro * 0.12) / passo)) * k;
    if (distinto(v, inteiros)) inteiros.push(v);
  }
  const opcoes = inteiros.map((v) => Math.round((v + centavos) * 100) / 100).sort((a, b) => a - b);
  return { opcoes, correta: opcoes.findIndex((v) => Math.abs(v - preco) < 0.001) };
}

/**
 * Cria o quiz do dia quando é a vez dele (veja ehVezDoQuiz): 3 produtos que passam no mesmo filtro de qualidade do Instagram, só das lojas
 * de QUIZ_LOJAS, com foto, de categorias diferentes e com preço que dê palpite. Nasce perto da hora de publicar, como o Reel.
 */
export async function prepararQuiz(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const ig = config.instagram;
  if (!config.social.ativo || !ig.ativo || ig.reelsPorDia <= 0) return false;
  const jaCriados = banco.reelsCriadosNoDia(agora);
  if (jaCriados >= ig.reelsPorDia || banco.reelPendente(agora)) return false;
  if (!ehVezDoQuiz(config, jaCriados, agora)) return false;
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return false;
  const janelas = [...ig.horariosReels].sort((a, b) => a - b);
  if (janelas.length > 0 && hora < (janelas[Math.min(jaCriados, janelas.length - 1)] as number) - 1) return false;

  const candidatos = banco
    .melhoresProdutos({ horas: 36, limite: 150 }, agora)
    .filter((o) => config.quiz.lojas.includes(o.loja) && o.preco >= PRECO_MINIMO && o.preco <= PRECO_MAXIMO && /^https:\/\//i.test(o.link) && /^https:\/\//i.test(o.imagem ?? '') && passaNoFiltroDoInstagram(o, ig));
  const categorias = new Set<string>();
  const variados = candidatos.filter((o) => !categorias.has(o.categoria) && categorias.add(o.categoria));
  const ordem = [...variados, ...candidatos.filter((o) => !variados.includes(o))];

  const chave = jaCriados === 0 ? `quiz-${diaDe(agora)}` : `quiz-${diaDe(agora)}-${jaCriados + 1}`;
  const rodadas: RodadaDoQuiz[] = [];
  for (const oferta of ordem.slice(0, RODADAS * 2)) {
    if (rodadas.length >= RODADAS) break;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    if (!imagem) continue;
    const { opcoes, correta } = opcoesDePreco(oferta.preco, `${chave}:${oferta.idProduto}`);
    if (correta >= 0) rodadas.push({ oferta, imagem, opcoes, correta });
  }
  if (rodadas.length < RODADAS) return false;
  const titulo = `Preço certo: acerte o preço de ${rodadas.length} achados`;
  const dados: DadosDoQuiz = { formato: 'quiz', titulo, rodadas };
  banco.salvarReel(chave, titulo, JSON.stringify(dados), agora);
  return true;
}

// ───────────────────────── telas ─────────────────────────

/** O título do produto em até 2 linhas (com reticências se foi cortado). */
function linhasDoTitulo(titulo: string, max = 26, linhas = 2): string[] {
  const palavras = titulo.replace(/\s+/g, ' ').trim().split(' ');
  const saida: string[] = [];
  let atual = '';
  let usadas = 0;
  for (const p of palavras) {
    if (atual && `${atual} ${p}`.length > max) {
      saida.push(atual);
      atual = '';
      if (saida.length === linhas) break;
    }
    atual = atual ? `${atual} ${p}` : p;
    usadas++;
  }
  if (saida.length < linhas && atual) saida.push(atual);
  if (usadas < palavras.length) saida[saida.length - 1] = `${saida[saida.length - 1]!.replace(/[,;:.\-–]+$/, '')}…`;
  return saida.slice(0, linhas);
}

type Fase = { tipo: 'pergunta' } | { tipo: 'contagem'; n: number } | { tipo: 'revelacao' };

/** Tudo acima de y=1480: a parte de baixo do Reel é coberta pela legenda e pelos botões do Instagram. */
function telaDaRodada(r: RodadaDoQuiz, indice: number, total: number, fase: Fase): string {
  const revelando = fase.tipo === 'revelacao';
  const linhas = linhasDoTitulo(r.oferta.titulo);
  const botoes = r.opcoes
    .map((preco, k) => {
      const y = 1070 + k * 115;
      const certo = revelando && k === r.correta;
      const apagado = revelando && !certo;
      const cor = certo ? MARCA.verde : '#ffffff';
      return (
        `<rect x="140" y="${y}" width="800" height="95" rx="30" fill="${cor}" fill-opacity="${certo ? 1 : apagado ? 0.07 : 0.14}"/>` +
        `<circle cx="215" cy="${y + 47}" r="32" fill="${MARCA.amarelo}" fill-opacity="${apagado ? 0.35 : 1}"/>` +
        texto(y + 66, 'ABC'[k]!, 40, MARCA.f1, 900).replace('x="540"', 'x="215"') +
        texto(y + 67, formatarPreco(preco), 56, MARCA.branco, 900).replace('x="540"', 'x="610"').replace(/fill="[^"]*"/, `fill="${MARCA.branco}" fill-opacity="${apagado ? 0.4 : 1}"`) +
        (certo ? `<polyline points="860,${y + 48} 884,${y + 70} 920,${y + 28}" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` : '')
      );
    })
    .join('');
  const contagem = fase.tipo === 'contagem' ? `<circle cx="880" cy="505" r="95" fill="${MARCA.vermelho}"/>${texto(552, String(fase.n), 130, MARCA.branco, 900).replace('x="540"', 'x="880"')}` : '';
  const selo =
    revelando && r.oferta.menorPrecoEmDias
      ? `<rect x="250" y="835" width="440" height="58" rx="29" fill="${MARCA.verde}"/>${texto(876, `MENOR PREÇO EM ${r.oferta.menorPrecoEmDias} DIAS`, 30, MARCA.branco, 900).replace('x="540"', 'x="470"')}`
      : '';
  // O conteúdo desce 60 px para não ficar colado no topo; o aviso de preço fica logo abaixo dos botões, ainda acima da legenda do Instagram.
  return moldura(
    `<g transform="translate(0,60)">` +
      logo(170) +
      texto(255, `${indice + 1} DE ${total}`, 38, MARCA.suave, 700) +
      texto(350, revelando ? 'O PREÇO DE HOJE É' : 'QUAL É O PREÇO?', 78, MARCA.amarelo, 900) +
      `<rect x="270" y="400" width="540" height="500" rx="40" fill="#ffffff"/>` +
      `<image href="${r.imagem}" x="295" y="420" width="490" height="460" preserveAspectRatio="xMidYMid meet"/>` +
      selo +
      contagem +
      linhas.map((l, i) => texto(965 + i * 50, esc(l), 42, MARCA.branco, 700)).join('') +
      botoes +
      `</g>` +
      (revelando ? texto(1505, 'Preço de hoje, pode mudar', 32, MARCA.suave, 500) : ''),
  );
}

function telaDeAbertura(n: number): string {
  return moldura(
    logo(300) +
      texto(820, 'PREÇO', 190, MARCA.amarelo, 900) +
      texto(1010, 'CERTO?', 190, MARCA.amarelo, 900) +
      `<rect x="270" y="1090" width="540" height="12" rx="6" fill="${MARCA.vermelho}" transform="rotate(-3 540 1096)"/>` +
      texto(1290, `Você acerta o preço de ${n} achados?`, 56, MARCA.branco, 700) +
      texto(1380, 'Escolha A, B ou C', 44, MARCA.suave, 500),
  );
}

function telaDeFechamento(acertar: number): string {
  return moldura(
    logo(300) +
      texto(700, 'QUANTOS VOCÊ', 100, MARCA.branco, 900) +
      texto(820, 'ACERTOU?', 140, MARCA.amarelo, 900) +
      texto(950, `Comenta aqui o seu placar (de 0 a ${acertar})`, 46, MARCA.branco, 700) +
      `<rect x="140" y="1050" width="800" height="150" rx="40" fill="${MARCA.amarelo}"/>` +
      texto(1144, 'ACHADOS ASSIM: LINK NA BIO', 44, MARCA.f1, 900) +
      texto(1330, 'Publi: links de afiliado. Preços podem mudar.', 34, MARCA.suave, 500),
  );
}

/** As telas do vídeo, quanto cada uma dura e os efeitos sonoros (tic-tac na contagem e "ding" na revelação). */
export function telasDoQuiz(dados: DadosDoQuiz): { svgs: string[]; duracoes: number[]; efeitos: Efeito[] } {
  const svgs: string[] = [telaDeAbertura(dados.rodadas.length)];
  const duracoes: number[] = [2.5];
  const marcas: Array<{ indice: number; tipo: 'contagem' | 'revelacao'; n?: number }> = [];
  dados.rodadas.forEach((r, i) => {
    svgs.push(telaDaRodada(r, i, dados.rodadas.length, { tipo: 'pergunta' }));
    duracoes.push(3.5);
    for (const n of [3, 2, 1]) {
      marcas.push({ indice: svgs.length, tipo: 'contagem', n });
      svgs.push(telaDaRodada(r, i, dados.rodadas.length, { tipo: 'contagem', n }));
      duracoes.push(1.4); // 1 s de cada número, mais a sobreposição da transição
    }
    marcas.push({ indice: svgs.length, tipo: 'revelacao' });
    svgs.push(telaDaRodada(r, i, dados.rodadas.length, { tipo: 'revelacao' }));
    duracoes.push(3.5);
  });
  svgs.push(telaDeFechamento(dados.rodadas.length));
  duracoes.push(3);
  const inicios = iniciosDasTelas(duracoes);
  const efeitos: Efeito[] = marcas.map((m) => (m.tipo === 'contagem' ? { t: inicios[m.indice]! + 0.15, tipo: m.n === 2 ? 'tac' : 'tic' } : { t: inicios[m.indice]! + 0.3, tipo: 'ding' }));
  return { svgs, duracoes, efeitos };
}

/** Duração do vídeo do quiz (segundos). */
export function duracaoDoQuiz(dados: DadosDoQuiz): number {
  return duracaoTotal(telasDoQuiz(dados).duracoes);
}

/** Monta o mp4 do quiz em blog/social/. Só age se o Reel pendente do dia for um quiz. Devolve o aviso de erro, ou undefined. */
export async function gravarQuiz(banco: Banco, config: Config, agora: Date): Promise<string | undefined> {
  if (!config.social.ativo || !config.instagram.ativo || !config.quiz.ativo) return undefined;
  const pendente = banco.reelPendente(agora);
  if (!pendente) return undefined;
  const dados = JSON.parse(pendente.dados) as DadosDoQuiz;
  if (dados.formato !== 'quiz' || !dados.rodadas?.length) return undefined;
  const { svgs, duracoes, efeitos } = telasDoQuiz(dados);
  return montarVideo({ svgs, duracoes, efeitos, chave: pendente.chave, pasta: join(config.blog.pasta, 'social') });
}

/** Legenda do quiz: o desafio, os produtos, o aviso de que o preço pode mudar, o pedido de placar nos comentários e o aviso de publi. */
export function legendaDoQuiz(dados: DadosDoQuiz, config: Config): string {
  const curto = (t: string) => t.split(/\s+/).slice(0, 7).join(' ').replace(/[,;:-]+$/, '');
  const telegram = config.blog.telegramLink ? '\n📲 Ofertas na hora no Telegram (link na bio)' : '\n🔗 Link na bio';
  return [
    `🎯 ${dados.titulo}`,
    '',
    ...dados.rodadas.map((r, i) => `${i + 1}. ${curto(r.oferta.titulo)}`),
    '',
    'Quantos você acertou? Comenta o seu placar 👇',
    `Salva e manda para quem acha que sabe o preço de tudo 😄${telegram}${temWhatsapp(config) ? '\n💬 Também no WhatsApp: canal e grupo, link na bio' : ''}`,
    '',
    'Publi: links de afiliado. Os preços são os de hoje e podem mudar a qualquer momento.',
    '',
    '#quiz #precocerto #achadinhos #ofertas #desafio',
  ].join('\n');
}
