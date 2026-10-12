import { join } from 'node:path';
import { diaDaSemana } from './carrossel.ts';
import { nomeDoNicho } from './categoria.ts';
import type { Config } from './config.ts';
import { sorteio } from './convite.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { passaNoFiltroDoInstagram } from './instagram.ts';
import { formatarPreco } from './mensagem.ts';
import type { Efeito } from './musica.ts';
import { duracaoTotal, ehVezDoQuiz, iniciosDasTelas, moldura, montarVideo, texto } from './reel.ts';
import { esc, MARCA } from './moldes.ts';
import { criarSilhueta } from './silhueta.ts';
import { baixarImagemComoDataUri, temWhatsapp, type Fetch } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * Quizzes nos Reels, no mesmo motor dos Reels (vídeo com ffmpeg, trilha sintetizada, hospedagem no blog e publicação no Instagram):
 *  - "preco": "Preço certo": 3 produtos, cada um com 3 preços (A, B, C), contagem 3-2-1 e a revelação com o preço de hoje;
 *  - "sombra": "Que produto é esse?": a silhueta preta do produto, contagem e a revelação com a foto, o nome e o preço de hoje;
 *  - "prefere": "Qual você prefere?": dois produtos (A e B) em tela dividida, contagem e, no fim, os dois preços de hoje.
 * O formato de cada dia da semana vem de QUIZ_FORMATOS. Em toda revelação, o preço sai com o aviso de que pode mudar.
 */
export type TipoDeQuiz = 'preco' | 'sombra' | 'prefere';

export interface RodadaDoQuiz {
  oferta: OfertaAvaliada;
  /** A foto do produto, já embutida (data URI). */
  imagem: string;
  /** Os três preços em ordem crescente (A, B, C). */
  opcoes: number[];
  /** Índice do preço de verdade em `opcoes`. */
  correta: number;
}

export interface RodadaDaSombra {
  oferta: OfertaAvaliada;
  imagem: string;
  /** A silhueta preta em PNG com fundo transparente (data URI). */
  sombra: string;
}

export interface RodadaDoPrefere {
  a: { oferta: OfertaAvaliada; imagem: string };
  b: { oferta: OfertaAvaliada; imagem: string };
}

export interface DadosDoQuiz {
  formato: 'quiz';
  /** Sem `tipo`, é o quiz de preço (o primeiro que existiu). */
  tipo?: TipoDeQuiz;
  titulo: string;
  rodadas: Array<RodadaDoQuiz | RodadaDaSombra | RodadaDoPrefere>;
}

const RODADAS = 3;
/** Preços fora desta faixa não rendem um bom palpite (muito baratos ou muito caros). */
const PRECO_MINIMO = 15;
const PRECO_MAXIMO = 1500;

export const tipoDoQuiz = (d: DadosDoQuiz): TipoDeQuiz => d.tipo ?? 'preco';

/** O formato do quiz de hoje (QUIZ_FORMATOS, domingo a sábado). */
export function formatoDoDia(config: Config, agora: Date): TipoDeQuiz {
  return config.quiz.formatos[diaDaSemana(agora)] ?? 'preco';
}

/**
 * Os três preços de uma rodada: o de verdade e dois falsos plausíveis, com os mesmos centavos do verdadeiro (se ele termina em ,90, os falsos
 * também; senão o palpite seria óbvio). Os falsos ficam entre 25% e 75% longe do real, arredondados como um preço de loja, e todos distantes
 * entre si. Em ordem crescente: o sorteio decide só onde o certo cai. Mesma semente, mesmas opções.
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

// ───────────────────────── escolha dos produtos ─────────────────────────

type Ordem = OfertaAvaliada[];

/** Produtos que servem para quiz: das lojas de QUIZ_LOJAS, com foto, preço que dê palpite e o mesmo filtro de qualidade do Instagram. */
function candidatosDoQuiz(banco: Banco, config: Config, agora: Date): Ordem {
  return banco
    .melhoresProdutos({ horas: 36, limite: 150 }, agora)
    .filter((o) => config.quiz.lojas.includes(o.loja) && o.preco >= PRECO_MINIMO && o.preco <= PRECO_MAXIMO && /^https:\/\//i.test(o.link) && /^https:\/\//i.test(o.imagem ?? '') && passaNoFiltroDoInstagram(o, config.instagram));
}

/** De categorias diferentes primeiro (o quiz fica mais variado), depois o resto. */
function variados(candidatos: Ordem): Ordem {
  const categorias = new Set<string>();
  const primeiros = candidatos.filter((o) => !categorias.has(o.categoria) && categorias.add(o.categoria));
  return [...primeiros, ...candidatos.filter((o) => !primeiros.includes(o))];
}

async function rodadasDePreco(ordem: Ordem, chave: string, fetchFn: Fetch): Promise<RodadaDoQuiz[]> {
  const rodadas: RodadaDoQuiz[] = [];
  for (const oferta of ordem.slice(0, RODADAS * 2)) {
    if (rodadas.length >= RODADAS) break;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    if (!imagem) continue;
    const { opcoes, correta } = opcoesDePreco(oferta.preco, `${chave}:${oferta.idProduto}`);
    if (correta >= 0) rodadas.push({ oferta, imagem, opcoes, correta });
  }
  return rodadas;
}

/** Só os produtos cuja foto tem fundo branco viram silhueta (a conferência é automática, em criarSilhueta). */
async function rodadasDaSombra(ordem: Ordem, fetchFn: Fetch): Promise<RodadaDaSombra[]> {
  const rodadas: RodadaDaSombra[] = [];
  for (const oferta of ordem.slice(0, RODADAS * 5)) {
    if (rodadas.length >= RODADAS) break;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    if (!imagem) continue;
    const r = await criarSilhueta(imagem);
    if ('sombra' in r) rodadas.push({ oferta, imagem, sombra: r.sombra });
  }
  return rodadas;
}

/** Duelos de dois produtos: da mesma categoria (e de preço na mesma ordem de grandeza), para a escolha ser de verdade. */
async function rodadasDoPrefere(ordem: Ordem, fetchFn: Fetch): Promise<RodadaDoPrefere[]> {
  const usados = new Set<OfertaAvaliada>();
  const duelos: Array<[OfertaAvaliada, OfertaAvaliada]> = [];
  const parecidos = (a: OfertaAvaliada, b: OfertaAvaliada) => a.preco / b.preco <= 2.2 && b.preco / a.preco <= 2.2;
  const montar = (mesmaCategoria: boolean) => {
    for (const a of ordem) {
      if (duelos.length >= RODADAS) break;
      if (usados.has(a)) continue;
      const b = ordem.find((o) => o !== a && !usados.has(o) && (!mesmaCategoria || o.categoria === a.categoria) && parecidos(a, o));
      if (!b) continue;
      usados.add(a);
      usados.add(b);
      duelos.push([a, b]);
    }
  };
  montar(true);
  montar(false); // sem pares da mesma categoria, completa com produtos quaisquer de preço parecido
  const rodadas: RodadaDoPrefere[] = [];
  for (const [a, b] of duelos) {
    const [fa, fb] = [await baixarImagemComoDataUri(a.imagem, fetchFn), await baixarImagemComoDataUri(b.imagem, fetchFn)];
    if (fa && fb) rodadas.push({ a: { oferta: a, imagem: fa }, b: { oferta: b, imagem: fb } });
  }
  return rodadas;
}

const TITULOS: Record<TipoDeQuiz, (n: number) => string> = {
  preco: (n) => `Preço certo: acerte o preço de ${n} achados`,
  sombra: (n) => `Que produto é esse? Adivinhe a silhueta de ${n} achados`,
  prefere: (n) => `Qual você prefere? ${n} duelos de achados`,
};

/**
 * Cria o quiz do dia quando é a vez dele (veja ehVezDoQuiz), no formato do dia da semana (QUIZ_FORMATOS). Nasce perto da hora de publicar,
 * como o Reel. Se o formato do dia não dá (sem fotos de fundo branco para a silhueta, sem pares para o duelo), cai no quiz de preço.
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

  const ordem = variados(candidatosDoQuiz(banco, config, agora));
  const chave = jaCriados === 0 ? `quiz-${diaDe(agora)}` : `quiz-${diaDe(agora)}-${jaCriados + 1}`;
  const formato = formatoDoDia(config, agora);
  const tentativas: TipoDeQuiz[] = formato === 'preco' ? ['preco'] : [formato, 'preco'];
  for (const tipo of tentativas) {
    const rodadas: DadosDoQuiz['rodadas'] = tipo === 'sombra' ? await rodadasDaSombra(ordem, fetchFn) : tipo === 'prefere' ? await rodadasDoPrefere(ordem, fetchFn) : await rodadasDePreco(ordem, chave, fetchFn);
    if (rodadas.length < RODADAS) continue;
    const titulo = TITULOS[tipo](rodadas.length);
    const dados: DadosDoQuiz = { formato: 'quiz', tipo, titulo, rodadas };
    banco.salvarReel(chave, titulo, JSON.stringify(dados), agora);
    return true;
  }
  return false;
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

/** Texto centralizado em torno de x (a função `texto` do Reel centraliza em 540). */
const textoEm = (x: number, y: number, s: string, tam: number, cor: string, peso = 800, opacidade = 1) =>
  texto(y, s, tam, cor, peso).replace('x="540"', `x="${x}"`).replace(/fill="[^"]*"/, `fill="${cor}" fill-opacity="${opacidade}"`);

const bolinha = (n: number, cx: number, cy: number, r = 95) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${MARCA.vermelho}"/>${textoEm(cx, cy + Math.round(r * 0.5), String(n), Math.round(r * 1.37), MARCA.branco, 900)}`;

const painelBranco = (x: number, y: number, w: number, h: number, imagem: string, folga = 22) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="#ffffff"/><image href="${imagem}" x="${x + folga}" y="${y + folga}" width="${w - folga * 2}" height="${h - folga * 2}" preserveAspectRatio="xMidYMid meet"/>`;

const seloDeMenorPreco = (o: OfertaAvaliada, x: number, y: number) =>
  o.menorPrecoEmDias ? `<rect x="${x}" y="${y}" width="440" height="58" rx="29" fill="${MARCA.verde}"/>${textoEm(x + 220, y + 41, `MENOR PREÇO EM ${o.menorPrecoEmDias} DIAS`, 30, MARCA.branco, 900)}` : '';

/**
 * Cabeçalho comum das telas de rodada. Tudo desce 60 px (grupo) para não ficar colado no topo, e o conteúdo importante fica acima de
 * y=1500: a parte de baixo do Reel é coberta pela legenda e pelos botões do Instagram.
 */
function moldeDaRodada(indice: number, total: number, pergunta: string, corpo: string, rodape = '', tamanho = 74): string {
  return moldura(`<g transform="translate(0,60)">${texto(255, `${indice + 1} DE ${total}`, 38, MARCA.suave, 700)}${texto(350, pergunta, tamanho, MARCA.amarelo, 900)}${corpo}</g>${rodape}`);
}

const AVISO_DE_PRECO = (y: number) => texto(y, 'Preço de hoje, pode mudar', 32, MARCA.suave, 500);

function telaDoPreco(r: RodadaDoQuiz, indice: number, total: number, fase: Fase): string {
  const revelando = fase.tipo === 'revelacao';
  const botoes = r.opcoes
    .map((preco, k) => {
      const y = 1070 + k * 115;
      const certo = revelando && k === r.correta;
      const apagado = revelando && !certo;
      return (
        `<rect x="140" y="${y}" width="800" height="95" rx="30" fill="${certo ? MARCA.verde : '#ffffff'}" fill-opacity="${certo ? 1 : apagado ? 0.07 : 0.14}"/>` +
        `<circle cx="215" cy="${y + 47}" r="32" fill="${MARCA.amarelo}" fill-opacity="${apagado ? 0.35 : 1}"/>` +
        textoEm(215, y + 66, 'ABC'[k]!, 40, MARCA.f1, 900) +
        textoEm(610, y + 67, formatarPreco(preco), 56, MARCA.branco, 900, apagado ? 0.4 : 1) +
        (certo ? `<polyline points="860,${y + 48} 884,${y + 70} 920,${y + 28}" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` : '')
      );
    })
    .join('');
  const corpo =
    painelBranco(270, 400, 540, 500, r.imagem, 25) +
    (revelando ? seloDeMenorPreco(r.oferta, 250, 835) : '') +
    (fase.tipo === 'contagem' ? bolinha(fase.n, 880, 505) : '') +
    linhasDoTitulo(r.oferta.titulo).map((l, i) => texto(965 + i * 50, esc(l), 42, MARCA.branco, 700)).join('') +
    botoes;
  return moldeDaRodada(indice, total, revelando ? 'O PREÇO DE HOJE É' : 'QUAL É O PREÇO?', corpo, revelando ? AVISO_DE_PRECO(1505) : '');
}

function telaDaSombra(r: RodadaDaSombra, indice: number, total: number, fase: Fase): string {
  const revelando = fase.tipo === 'revelacao';
  const linhas = linhasDoTitulo(r.oferta.titulo, 24, 2);
  const corpo =
    painelBranco(270, 400, 540, 500, revelando ? r.imagem : r.sombra, 25) +
    (revelando ? seloDeMenorPreco(r.oferta, 250, 835) : '') +
    (fase.tipo === 'contagem' ? bolinha(fase.n, 880, 505) : '') +
    (revelando
      ? linhas.map((l, i) => texto(975 + i * 56, esc(l), 48, MARCA.branco, 800)).join('') +
        `<rect x="290" y="1110" width="500" height="115" rx="34" fill="${MARCA.verde}"/>` +
        texto(1190, formatarPreco(r.oferta.preco), 68, MARCA.branco, 900)
      : texto(990, `Dica: ${esc(nomeDoNicho(r.oferta.categoria))}`, 44, MARCA.suave, 700) + texto(1060, 'Que produto é esse?', 52, MARCA.branco, 800));
  return moldeDaRodada(indice, total, revelando ? 'ERA ESTE!' : 'ADIVINHE PELA SOMBRA', corpo, revelando ? AVISO_DE_PRECO(1505) : '', 62);
}

function telaDoPrefere(r: RodadaDoPrefere, indice: number, total: number, fase: Fase): string {
  const revelando = fase.tipo === 'revelacao';
  const lado = (item: RodadaDoPrefere['a'], letra: string, yPainel: number, yTitulo: number) => {
    const [linha] = linhasDoTitulo(item.oferta.titulo, 30, 1);
    return (
      painelBranco(190, yPainel, 700, 360, item.imagem, 16) +
      `<circle cx="244" cy="${yPainel + 52}" r="36" fill="${MARCA.amarelo}"/>${textoEm(244, yPainel + 66, letra, 44, MARCA.f1, 900)}` +
      (revelando ? `<rect x="390" y="${yPainel + 330}" width="300" height="62" rx="31" fill="${MARCA.verde}"/>${textoEm(540, yPainel + 375, formatarPreco(item.oferta.preco), 40, MARCA.branco, 900)}` : '') +
      texto(yTitulo, esc(linha ?? ''), 38, MARCA.branco, 700)
    );
  };
  const centro = fase.tipo === 'contagem' ? bolinha(fase.n, 540, 892, 50) : `<circle cx="540" cy="892" r="42" fill="${MARCA.vermelho}"/>${textoEm(540, 906, 'VS', 38, MARCA.branco, 900)}`;
  const corpo = lado(r.a, 'A', 395, 832) + centro + lado(r.b, 'B', 940, 1380);
  return moldeDaRodada(indice, total, revelando ? 'OS DOIS PREÇOS' : 'QUAL VOCÊ PREFERE?', corpo, revelando ? AVISO_DE_PRECO(1505) : '');
}

function telaDeAbertura(tipo: TipoDeQuiz, n: number): string {
  const [linha1, linha2, sub1, sub2] =
    tipo === 'sombra'
      ? ['QUE PRODUTO', 'É ESSE?', `Adivinhe a silhueta de ${n} achados`, 'Só a sombra é a dica']
      : tipo === 'prefere'
        ? ['QUAL VOCÊ', 'PREFERE?', `${n} duelos de achados`, 'Escolha A ou B']
        : ['PREÇO', 'CERTO?', `Você acerta o preço de ${n} achados?`, 'Escolha A, B ou C'];
  const tamanho = tipo === 'preco' ? 190 : tipo === 'sombra' ? 118 : 150;
  return moldura(
    texto(820, linha1, tamanho, MARCA.amarelo, 900) +
      texto(1010, linha2, tamanho, MARCA.amarelo, 900) +
      `<rect x="270" y="1090" width="540" height="12" rx="6" fill="${MARCA.vermelho}" transform="rotate(-3 540 1096)"/>` +
      texto(1290, sub1, 56, MARCA.branco, 700) +
      texto(1380, sub2, 44, MARCA.suave, 500),
  );
}

function telaDeFechamento(tipo: TipoDeQuiz, n: number): string {
  const [linha1, linha2, sub] = tipo === 'prefere' ? ['E VOCÊ,', 'QUAL ESCOLHE?', 'Comenta A ou B em cada duelo'] : ['QUANTOS VOCÊ', 'ACERTOU?', `Comenta aqui o seu placar (de 0 a ${n})`];
  return moldura(
    texto(700, linha1, 100, MARCA.branco, 900) +
      texto(820, linha2, tipo === 'prefere' ? 96 : 140, MARCA.amarelo, 900) +
      texto(950, sub, 46, MARCA.branco, 700) +
      `<rect x="140" y="1050" width="800" height="150" rx="40" fill="${MARCA.amarelo}"/>` +
      texto(1144, 'ACHADOS ASSIM: LINK NA BIO', 44, MARCA.f1, 900) +
      texto(1330, 'Publi: links de afiliado. Preços podem mudar.', 34, MARCA.suave, 500),
  );
}

/** As telas do vídeo, quanto cada uma dura e os efeitos sonoros (tic-tac na contagem e "ding" na revelação). */
export function telasDoQuiz(dados: DadosDoQuiz): { svgs: string[]; duracoes: number[]; efeitos: Efeito[] } {
  const tipo = tipoDoQuiz(dados);
  const total = dados.rodadas.length;
  const tela = (r: DadosDoQuiz['rodadas'][number], i: number, fase: Fase) =>
    tipo === 'sombra' ? telaDaSombra(r as RodadaDaSombra, i, total, fase) : tipo === 'prefere' ? telaDoPrefere(r as RodadaDoPrefere, i, total, fase) : telaDoPreco(r as RodadaDoQuiz, i, total, fase);
  const svgs: string[] = [telaDeAbertura(tipo, total)];
  const duracoes: number[] = [2.5];
  const marcas: Array<{ indice: number; tipo: 'contagem' | 'revelacao'; n?: number }> = [];
  dados.rodadas.forEach((r, i) => {
    svgs.push(tela(r, i, { tipo: 'pergunta' }));
    duracoes.push(3.5);
    for (const n of [3, 2, 1]) {
      marcas.push({ indice: svgs.length, tipo: 'contagem', n });
      svgs.push(tela(r, i, { tipo: 'contagem', n }));
      duracoes.push(1.4); // 1 s de cada número, mais a sobreposição da transição
    }
    marcas.push({ indice: svgs.length, tipo: 'revelacao' });
    svgs.push(tela(r, i, { tipo: 'revelacao' }));
    duracoes.push(3.5);
  });
  svgs.push(telaDeFechamento(tipo, total));
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

/** Legenda do quiz: o desafio, o pedido de comentário, o aviso de que o preço muda e o aviso de publi. A sombra não lista os produtos (seria entregar a resposta). */
export function legendaDoQuiz(dados: DadosDoQuiz, config: Config): string {
  const tipo = tipoDoQuiz(dados);
  const curto = (t: string) => t.split(/\s+/).slice(0, 7).join(' ').replace(/[,;:-]+$/, '');
  const telegram = config.blog.telegramLink ? '\n📲 Ofertas na hora no Telegram (link na bio)' : '\n🔗 Link na bio';
  const lista =
    tipo === 'preco'
      ? [...(dados.rodadas as RodadaDoQuiz[]).map((r, i) => `${i + 1}. ${curto(r.oferta.titulo)}`), '']
      : tipo === 'prefere'
        ? [...(dados.rodadas as RodadaDoPrefere[]).map((r, i) => `${i + 1}. ${curto(r.a.oferta.titulo)} x ${curto(r.b.oferta.titulo)}`), '']
        : [];
  const pedido = tipo === 'prefere' ? 'Qual você escolhe em cada duelo? Comenta A ou B 👇' : tipo === 'sombra' ? 'Quantos produtos você adivinhou? Comenta o seu placar 👇' : 'Quantos você acertou? Comenta o seu placar 👇';
  const hashtags = tipo === 'prefere' ? '#quiz #qualprefere #achadinhos #ofertas #desafio' : tipo === 'sombra' ? '#quiz #adivinhe #achadinhos #ofertas #desafio' : '#quiz #precocerto #achadinhos #ofertas #desafio';
  return [
    `🎯 ${dados.titulo}`,
    '',
    ...lista,
    pedido,
    `Salva e manda para quem acha que sabe tudo 😄${telegram}${temWhatsapp(config) ? '\n💬 Também no WhatsApp: canal e grupo, link na bio' : ''}`,
    '',
    'Publi: links de afiliado. Os preços são os de hoje e podem mudar a qualquer momento.',
    '',
    hashtags,
  ].join('\n');
}
