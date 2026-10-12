import { mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ofertasDaBio } from './bio.ts';
import type { Config } from './config.ts';
import { linksDosCanais, sorteio } from './convite.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { TIPOS_DE_GUIA } from './guias.ts';
import { passaNoFiltroDoInstagram } from './instagram.ts';
import { esc, fundo, linhasDaPergunta, marca, MARCA } from './moldes.ts';
import { criarSilhueta } from './silhueta.ts';
import { baixarImagemComoDataUri, nomeDoCanal, perguntaDaArte, renderizarPng, tituloParaArte, type Fetch } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

/**
 * Pinterest: pins verticais (2:3) que levam gente para o grupo e para os canais. Cada pin usa uma estratégia diferente, e todos terminam
 * com a mesma chamada. O pin nunca mostra preço (o preço está no canal) e só afirma o que o robô provou (menor preço em 30 dias).
 *
 * O robô sempre gera: as imagens em blog/pinterest/, a planilha de envio em massa (pins.csv), o feed RSS (feed.xml) e a galeria
 * (blog/pinterest.html, com o botão "Salvar no Pinterest"). Com PINTEREST_TOKEN e PINTEREST_BOARD_ID, também publica pela API.
 */
export type EstrategiaDoPin = 'produto' | 'lista' | 'beneficio' | 'dica' | 'quiz' | 'sombra';

/** A ordem em que as estratégias giram: os dias começam em pontos diferentes, e dois pins seguidos nunca são iguais. */
export const ESTRATEGIAS: EstrategiaDoPin[] = ['produto', 'beneficio', 'lista', 'dica', 'quiz', 'sombra'];

export interface DadosDoPin {
  estrategia: EstrategiaDoPin;
  titulo: string;
  descricao: string;
  alt: string;
  link: string;
  /** As linhas do título grande, em amarelo. */
  gancho: string[];
  /** Produtos mostrados (foto reduzida) com o nome curto. */
  itens?: Array<{ titulo: string; foto?: string }>;
  /** Lista de tópicos (benefícios do canal ou critérios da dica). */
  topicos?: string[];
  /** Silhueta preta (data URI) do produto. */
  sombra?: string;
  /** Selo verde, só quando o robô provou (ex.: "MENOR PREÇO EM 30 DIAS"). */
  selo?: string;
  /** Produtos usados (loja:id), para não repetir nos próximos pins. */
  produtos: string[];
}

export const LARGURA_DO_PIN = 1000;
export const ALTURA_DO_PIN = 1500;
/** Quantos dias os pins ficam na galeria, no feed e na planilha. */
export const DIAS_DOS_PINS = 7;
/** O Pinterest corta o título em 100 caracteres e a descrição em 800. */
const MAX_TITULO = 100;
const MAX_DESCRICAO = 800;

const FONTE = 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif';
const cortar = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const t = (x: number, y: number, tam: number, cor: string, s: string, peso = 800, ancora = 'middle', extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONTE}" font-size="${tam}" font-weight="${peso}" text-anchor="${ancora}" fill="${cor}"${extra}>${esc(s)}</text>`;

/** O nome curto do produto para o pin e para o título: sem o que vem depois do primeiro separador forte. */
export function nomeCurto(titulo: string, maxLinhas = 1, largura = 34): string {
  return tituloParaArte(titulo, largura, maxLinhas).join(' ');
}

/** O link do pin: a página do link da bio (botões dos canais e as ofertas de hoje), com a origem marcada. */
export function linkDoPin(config: Config, estrategia: EstrategiaDoPin): string {
  return `${config.blog.url}/bio.html?utm_source=pinterest&utm_medium=pin&utm_campaign=${estrategia}`;
}

/** Quais canais a chamada cita ("WhatsApp e Telegram"), só os configurados. */
function canaisDaChamada(config: Config): string {
  const nomes = linksDosCanais(config).map((l) => (l.rotulo.includes('WhatsApp') ? 'WhatsApp' : 'Telegram'));
  return nomes.length ? `${nomes.join(' e ')} · sem mostrar seu número` : 'ofertas todo dia · sem mostrar seu número';
}

const CHAMADAS: Record<EstrategiaDoPin, string> = {
  produto: 'VEJA O PREÇO NO CANAL',
  lista: 'ENTRE E VEJA OS PREÇOS',
  beneficio: 'ENTRE NO CANAL GRÁTIS',
  dica: 'MAIS DICAS NO CANAL',
  quiz: 'A RESPOSTA ESTÁ NO CANAL',
  sombra: 'A RESPOSTA ESTÁ NO CANAL',
};

/** O fundo, o logo do topo e a chamada final: igual em todos os pins, para a marca ser reconhecida. */
function moldura(estrategia: EstrategiaDoPin, corpo: string, canais: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA_DO_PIN}" height="${ALTURA_DO_PIN}" viewBox="0 0 ${LARGURA_DO_PIN} ${ALTURA_DO_PIN}">
${fundo(LARGURA_DO_PIN, ALTURA_DO_PIN)}
${marca(500, 112, 52, 'centro')}
${corpo}
<rect x="80" y="1290" width="840" height="150" rx="40" fill="${MARCA.amarelo}"/>
${t(500, 1362, 48, MARCA.f1, CHAMADAS[estrategia], 900, 'middle', ' font-style="italic"')}
${t(500, 1410, 28, MARCA.f1, canais, 600)}
${t(500, 1478, 22, MARCA.suave, 'Publi: links de afiliado. Preços podem mudar.', 400)}
</svg>`;
}

/** O título grande em amarelo, uma linha por linha do gancho, encolhendo para caber nos 880 px. */
function tituloGrande(linhas: string[], yTopo: number, base = 110): { svg: string; fim: number } {
  const maior = Math.max(...linhas.map((l) => l.length));
  const tam = Math.min(base, Math.floor(880 / (maior * 0.66)));
  const passo = Math.round(tam * 1.06);
  return { svg: linhas.map((l, i) => t(500, yTopo + tam * 0.85 + i * passo, tam, MARCA.amarelo, l, 900, 'middle', ' font-style="italic"')).join('\n'), fim: yTopo + tam * 0.85 + (linhas.length - 1) * passo + tam * 0.25 };
}

const painelBranco = (x: number, y: number, w: number, h: number, foto?: string, folga = 24) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="#ffffff"/>${foto ? `<image href="${foto}" x="${x + folga}" y="${y + folga}" width="${w - folga * 2}" height="${h - folga * 2}" preserveAspectRatio="xMidYMid meet"/>` : ''}`;

const selo = (texto: string, y: number) => {
  const w = Math.min(800, Math.round(texto.length * 22 + 80));
  return `<rect x="${500 - w / 2}" y="${y}" width="${w}" height="64" rx="32" fill="${MARCA.verde}"/>${t(500, y + 44, 30, MARCA.branco, texto, 900)}`;
};

/** A imagem do pin (SVG 1000x1500) a partir dos dados. */
export function svgDoPin(d: DadosDoPin, config: Config): string {
  const canais = canaisDaChamada(config);
  const titulo = tituloGrande(d.gancho, 190, d.estrategia === 'beneficio' || d.estrategia === 'dica' ? 96 : 112);
  const topo = Math.round(titulo.fim + 30);
  let corpo = titulo.svg;

  if (d.estrategia === 'produto' || d.estrategia === 'quiz' || d.estrategia === 'sombra') {
    const item = d.itens?.[0];
    const altura = d.estrategia === 'produto' ? 700 : 560;
    corpo += painelBranco(110, topo, 780, altura, d.estrategia === 'sombra' ? d.sombra : item?.foto, d.estrategia === 'sombra' ? 60 : 24);
    let y = topo + altura;
    if (d.estrategia === 'produto') {
      if (d.selo) corpo += selo(d.selo, y - 32);
      corpo += tituloParaArte(item?.titulo ?? '', 30, 2).map((l, i) => t(500, y + 70 + i * 50, 42, MARCA.branco, l, 800, 'middle', ' font-style="italic"')).join('');
    } else {
      y += 40;
      const rotulos = d.estrategia === 'quiz' ? ['A', 'B', 'C'] : [];
      corpo += rotulos
        .map((r, i) => {
          const x = 110 + i * 270;
          return `<rect x="${x}" y="${y}" width="240" height="110" rx="28" fill="#2a2a31"/><circle cx="${x + 56}" cy="${y + 55}" r="30" fill="${MARCA.amarelo}"/>${t(x + 56, y + 68, 36, MARCA.f1, r, 900)}${t(x + 150, y + 70, 46, MARCA.branco, 'R$ ?', 800)}`;
        })
        .join('');
      if (d.estrategia === 'sombra') corpo += t(500, y + 60, 44, MARCA.branco, 'Só a sombra é a dica', 700, 'middle', ' font-style="italic"');
    }
  } else if (d.estrategia === 'lista') {
    (d.itens ?? []).slice(0, 3).forEach((it, i) => {
      const y = topo + i * 270;
      corpo += `${painelBranco(80, y, 270, 240, it.foto, 14)}<circle cx="80" cy="${y + 20}" r="34" fill="${MARCA.amarelo}"/>${t(80, y + 33, 38, MARCA.f1, String(i + 1), 900)}`;
      corpo += tituloParaArte(it.titulo, 20, 3).map((l, k) => t(390, y + 80 + k * 52, 42, MARCA.branco, l, 800, 'start', ' font-style="italic"')).join('');
    });
  } else {
    // Lista de tópicos (benefícios do canal ou critérios da dica): bolinha com marca ou número e o texto.
    const tops = (d.topicos ?? []).slice(0, 5);
    const passo = Math.min(150, Math.floor((1260 - topo) / Math.max(1, tops.length)));
    tops.forEach((tx, i) => {
      const y = topo + i * passo;
      corpo += `<circle cx="130" cy="${y + 40}" r="34" fill="${d.estrategia === 'dica' ? MARCA.amarelo : MARCA.verde}"/>${t(130, y + 54, 40, d.estrategia === 'dica' ? MARCA.f1 : MARCA.branco, d.estrategia === 'dica' ? String(i + 1) : '✓', 900)}`;
      corpo += tituloParaArte(tx, 30, 2).map((l, k) => t(190, y + 36 + k * 44, 38, MARCA.branco, l, 700, 'start')).join('');
    });
  }
  return moldura(d.estrategia, corpo, canais);
}

// ───────── Criação dos pins ─────────

const BENEFICIOS = [
  'As mesmas ofertas do grupo, no canal',
  'Ninguém vê o seu número',
  'Sem conversa e sem barulho',
  'Histórico de preço de 30 dias conferido',
  '100% grátis: você compra direto na loja',
];

const HASHTAGS = '#ofertas #achadinhos #promocao';

function descricaoBase(config: Config, resumo: string): string {
  const canais = linksDosCanais(config).map((l) => l.rotulo.replace('Canal do ', '')).join(' e ');
  const convite = canais ? `Entre grátis no canal do ${canais} e receba na hora, sem mostrar o seu número.` : 'Entre no canal e receba as ofertas na hora, sem mostrar o seu número.';
  return cortar(`${resumo} O ${nomeDoCanal(config)} confere o histórico de preço de 30 dias antes de postar. ${convite} Publi: links de afiliado, preços podem mudar. ${HASHTAGS}`, MAX_DESCRICAO);
}

/** Reduz a foto para o pin (o banco guarda a foto de cada pin por uma semana). */
export async function reduzirFoto(dataUri: string | undefined, lado = 640): Promise<string | undefined> {
  if (!dataUri) return undefined;
  try {
    const sharp = (await import('sharp')).default;
    const entrada = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
    const saida = await sharp(entrada).flatten({ background: '#ffffff' }).resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${saida.toString('base64')}`;
  } catch {
    return dataUri;
  }
}

const idDe = (o: OfertaAvaliada) => `${o.loja}:${o.idProduto}`;

/** Os produtos de hoje que servem para pin: foto, link, passa no filtro de qualidade e não saiu em outro pin da semana. */
function produtosDisponiveis(banco: Banco, config: Config, agora: Date, usados: Set<string>, semente: string): OfertaAvaliada[] {
  const lista = ofertasDaBio(banco, agora).filter((o) => /^https:\/\//i.test(o.imagem ?? '') && passaNoFiltroDoInstagram(o, config.instagram) && !usados.has(idDe(o)));
  const aleatorio = sorteio(semente);
  return lista
    .map((o) => ({ o, k: aleatorio() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.o);
}

async function criarDados(estrategia: EstrategiaDoPin, produtos: OfertaAvaliada[], config: Config, agora: Date, fetchFn: Fetch, usados: Set<string>): Promise<DadosDoPin | undefined> {
  const link = linkDoPin(config, estrategia);
  if (estrategia === 'beneficio') {
    return {
      estrategia,
      titulo: 'Canal de ofertas grátis, sem mostrar seu número (WhatsApp e Telegram)',
      descricao: descricaoBase(config, 'Quer receber ofertas sem entrar em grupo e sem mostrar o seu número?'),
      alt: 'Lista com os benefícios do canal de ofertas: mesmas ofertas do grupo, sem mostrar o número, sem conversa, histórico de 30 dias conferido e grátis.',
      link,
      gancho: ['OFERTAS SEM', 'MOSTRAR SEU', 'NÚMERO'],
      topicos: BENEFICIOS,
      produtos: [],
    };
  }
  if (estrategia === 'dica') {
    // O assunto gira por dia e não repete numa semana (a chave dica:slug fica nos produtos usados).
    const tipos = TIPOS_DE_GUIA.filter((tp) => tp.criterios.length >= 4);
    const inicio = Math.floor(agora.getTime() / 86_400_000) % tipos.length;
    const tipo = [...tipos.slice(inicio), ...tipos.slice(0, inicio)].find((tp) => !usados.has(`dica:${tp.slug}`));
    if (!tipo) return undefined;
    const criterios = tipo.criterios.slice(0, 5);
    return {
      estrategia,
      titulo: cortar(`${criterios.length} coisas para olhar antes de comprar ${tipo.nome}`, MAX_TITULO),
      descricao: descricaoBase(config, `Antes de comprar ${tipo.nome}, confira: ${criterios.join('; ')}.`),
      alt: `Lista de ${criterios.length} coisas para olhar antes de comprar ${tipo.nome}.`,
      link,
      gancho: [`${criterios.length} COISAS ANTES`, 'DE COMPRAR', tipo.nome.toUpperCase().split(' ').slice(0, 3).join(' ')],
      topicos: criterios,
      produtos: [`dica:${tipo.slug}`],
    };
  }
  if (estrategia === 'lista') {
    if (produtos.length < 3) return undefined;
    const escolhidos = produtos.slice(0, 3);
    const itens: NonNullable<DadosDoPin['itens']> = [];
    for (const o of escolhidos) itens.push({ titulo: nomeCurto(o.titulo, 2, 24), foto: await reduzirFoto(await baixarImagemComoDataUri(o.imagem, fetchFn)) });
    if (itens.some((i) => !i.foto)) return undefined;
    return {
      estrategia,
      titulo: '3 achados de hoje: ofertas com histórico de preço conferido',
      descricao: descricaoBase(config, `3 achados de hoje: ${itens.map((i) => i.titulo).join(', ')}.`),
      alt: `Três produtos em oferta hoje: ${itens.map((i) => i.titulo).join(', ')}.`,
      link,
      gancho: ['3 ACHADOS', 'DE HOJE'],
      itens,
      produtos: escolhidos.map(idDe),
    };
  }
  // produto, quiz e sombra: um produto só.
  for (const o of produtos) {
    const foto = await reduzirFoto(await baixarImagemComoDataUri(o.imagem, fetchFn));
    if (!foto) continue;
    const nome = nomeCurto(o.titulo, 2, 30);
    if (estrategia === 'produto') {
      const seloVerde = o.menorPrecoEmDias ? `MENOR PREÇO EM ${o.menorPrecoEmDias} DIAS` : undefined;
      return {
        estrategia,
        titulo: cortar(`${nome}: veja se o preço caiu de verdade`, MAX_TITULO),
        descricao: descricaoBase(config, `${nome} em oferta hoje${seloVerde ? `, no menor preço dos últimos ${o.menorPrecoEmDias} dias` : ''}.`),
        alt: `Foto de ${nome}.`,
        link,
        gancho: linhasDaPergunta(perguntaDaArte(o)),
        itens: [{ titulo: o.titulo, foto }],
        selo: seloVerde,
        produtos: [idDe(o)],
      };
    }
    if (estrategia === 'quiz') {
      return {
        estrategia,
        titulo: 'Você acerta o preço? Desafio de achados',
        descricao: descricaoBase(config, `Você acerta o preço de ${nome}? Escolha A, B ou C e descubra o preço de hoje no canal.`),
        alt: `Foto de ${nome} com três opções de preço, A, B e C.`,
        link,
        gancho: ['VOCÊ ACERTA', 'O PREÇO?'],
        itens: [{ titulo: o.titulo, foto }],
        produtos: [idDe(o)],
      };
    }
    // sombra: só serve com foto de fundo branco; se não servir, tenta o próximo produto.
    const silhueta = await criarSilhueta(foto);
    if (!('sombra' in silhueta)) continue;
    return {
      estrategia,
      titulo: 'Que produto é esse? Adivinhe pela silhueta',
      descricao: descricaoBase(config, 'Que produto é esse? Adivinhe pela silhueta e descubra a resposta no canal.'),
      alt: 'Silhueta preta de um produto sobre fundo branco: que produto é esse?',
      link,
      gancho: ['QUE PRODUTO', 'É ESSE?'],
      itens: [{ titulo: o.titulo, foto }],
      sombra: silhueta.sombra,
      produtos: [idDe(o)],
    };
  }
  return undefined;
}

/** No máximo isto por rodada: os pins do dia nascem ao longo do dia, não todos de uma vez. */
const PINS_POR_RODADA = 2;

/** Cria os pins que faltam para o dia (PINTEREST_PINS_POR_DIA), no horário de postagem. Devolve quantos criou. */
export async function prepararPins(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<number> {
  const p = config.pinterest;
  if (!config.social.ativo || !p.ativo || p.pinsPorDia <= 0 || !/^https:\/\//.test(config.blog.url)) return 0;
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return 0;
  const dia = diaDe(agora);
  let criados = 0;
  const recentes = banco.pinsRecentes(DIAS_DOS_PINS, agora);
  const usados = new Set<string>();
  for (const r of recentes) for (const id of (JSON.parse(r.dados) as Partial<DadosDoPin>).produtos ?? []) usados.add(id);
  let feitosHoje = banco.pinsCriadosNoDia(agora);
  const numeroDoDia = Math.floor(Date.parse(`${dia}T12:00:00Z`) / 86_400_000);
  while (criados < PINS_POR_RODADA && feitosHoje < p.pinsPorDia) {
    // A estratégia gira por dia e por número do pin; sem condição de fazer uma (faltam produtos, foto...), tenta a seguinte.
    const ultima = recentes[0]?.estrategia;
    let dados: DadosDoPin | undefined;
    for (let k = 0; k < ESTRATEGIAS.length && !dados; k++) {
      const estrategia = ESTRATEGIAS[(numeroDoDia + feitosHoje + k) % ESTRATEGIAS.length]!;
      if (estrategia === ultima && criados === 0 && ESTRATEGIAS.length > 1 && k === 0) continue;
      dados = await criarDados(estrategia, produtosDisponiveis(banco, config, agora, usados, `pin:${dia}:${feitosHoje}:${estrategia}`), config, agora, fetchFn, usados);
    }
    if (!dados) break;
    const chave = `pin-${dia}-${String(feitosHoje + 1).padStart(2, '0')}-${dados.estrategia}`;
    banco.salvarPin(chave, dados.estrategia, dados.titulo, JSON.stringify(dados), agora);
    for (const id of dados.produtos) usados.add(id);
    recentes.unshift({ chave, dia, estrategia: dados.estrategia, titulo: dados.titulo, dados: '{}', criadoEm: agora.getTime(), tentativas: 0 });
    feitosHoje++;
    criados++;
  }
  return criados;
}

// ───────── Arquivos do site ─────────

export const arquivoDoPin = (chave: string) => `pinterest/${chave}.png`;
const enderecoDoPin = (config: Config, chave: string) => `${config.blog.url}/${arquivoDoPin(chave)}`;

const csv = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Planilha para "Criar Pins em massa" do Pinterest (as imagens são buscadas no endereço do site). */
export function planilhaDosPins(pins: Array<{ chave: string; dados: DadosDoPin }>, config: Config): string {
  const linhas = [['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords']];
  for (const { chave, dados } of pins) linhas.push([dados.titulo, enderecoDoPin(config, chave), config.pinterest.quadro, '', dados.descricao, dados.link, '', 'ofertas, achadinhos, promoção, desconto']);
  return `${linhas.map((l) => l.map(csv).join(',')).join('\n')}\n`;
}

/** Feed RSS dos pins: com o site reivindicado no Pinterest, ele publica os pins num quadro sozinho. */
export function feedDosPins(pins: Array<{ chave: string; dados: DadosDoPin; criadoEm: number }>, config: Config): string {
  const itens = pins
    .map(({ chave, dados, criadoEm }) => {
      const img = enderecoDoPin(config, chave);
      return `<item><title>${xml(dados.titulo)}</title><link>${xml(dados.link)}</link><guid isPermaLink="false">${xml(chave)}</guid><pubDate>${new Date(criadoEm).toUTCString()}</pubDate><description><![CDATA[<img src="${img}" alt="${xml(dados.alt)}"/><p>${dados.descricao.replace(/\]\]>/g, '')}</p>]]></description><enclosure url="${xml(img)}" type="image/png" length="0"/></item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xml(config.blog.nome)}: pins</title><link>${xml(config.blog.url)}/</link><description>Achados e ofertas do dia</description>\n${itens}\n</channel></rss>\n`;
}

function salvarNoPinterest(config: Config, chave: string, dados: DadosDoPin): string {
  const q = new URLSearchParams({ url: dados.link, media: enderecoDoPin(config, chave), description: `${dados.titulo}. ${dados.descricao}`.slice(0, 480) });
  return `https://www.pinterest.com/pin/create/button/?${q}`;
}

/** Galeria para o dono: cada pin com a imagem, o texto pronto para copiar e o botão "Salvar no Pinterest". */
export function galeriaDosPins(pins: Array<{ chave: string; dados: DadosDoPin; publicado: boolean }>, config: Config): string {
  const cartoes = pins
    .map(
      ({ chave, dados, publicado }) => `<article><img src="${arquivoDoPin(chave)}" alt="${xml(dados.alt)}" loading="lazy" width="300"><h2>${xml(dados.titulo)}</h2><p class="e">${dados.estrategia}${publicado ? ' · publicado pela API' : ''}</p><textarea readonly rows="5">${xml(dados.descricao)}</textarea><p><a class="b" href="${xml(salvarNoPinterest(config, chave, dados))}" target="_blank" rel="noopener">Salvar no Pinterest</a> <a class="s" href="${arquivoDoPin(chave)}" download>Baixar imagem</a></p></article>`,
    )
    .join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Pins do Pinterest</title>
<style>body{margin:0;background:#0E0E10;color:#fff;font:16px/1.4 system-ui,sans-serif;padding:16px}h1{font-size:22px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}article{background:#17171B;border:1px solid #2A2A31;border-radius:16px;padding:12px}img{width:100%;height:auto;border-radius:12px}h2{font-size:16px}.e{color:#A9A9B3;font-size:13px}textarea{width:100%;background:#0E0E10;color:#fff;border:1px solid #2A2A31;border-radius:8px;padding:8px;box-sizing:border-box}a{display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700;margin:4px 4px 0 0}.b{background:#E10600;color:#fff}.s{background:#2A2A31;color:#fff}</style></head><body>
<h1>Pins do Pinterest (${pins.length})</h1><p>Imagens 2:3 prontas. <a class="s" href="pinterest/pins.csv" download>Planilha para envio em massa</a> <a class="s" href="pinterest/feed.xml">Feed RSS</a></p><main>${cartoes || '<p>Os pins de hoje estão chegando.</p>'}</main></body></html>\n`;
}

/** Grava as imagens, a planilha, o feed e a galeria dos pins da semana. Devolve quantos pins saíram. */
export async function gravarPins(banco: Banco, config: Config, agora: Date): Promise<{ gravados: number; semConversor: boolean }> {
  const resultado = { gravados: 0, semConversor: false };
  const p = config.pinterest;
  if (!config.social.ativo || !p.ativo || !/^https:\/\//.test(config.blog.url)) return resultado;
  const lista = banco
    .pinsRecentes(DIAS_DOS_PINS, agora)
    .map((r) => ({ chave: r.chave, criadoEm: r.criadoEm, publicado: r.publicadoEm !== undefined, dados: JSON.parse(r.dados) as DadosDoPin }))
    .filter((r) => r.dados.estrategia && r.dados.link);
  if (lista.length === 0) return resultado;
  const pasta = join(config.blog.pasta, 'pinterest');
  mkdirSync(pasta, { recursive: true });
  for (const f of readdirSync(pasta)) if (f.endsWith('.png')) rmSync(join(pasta, f));
  for (const pin of lista) {
    const png = await renderizarPng(svgDoPin(pin.dados, config), LARGURA_DO_PIN);
    if (!png) {
      resultado.semConversor = true;
      return resultado;
    }
    writeFileSync(join(pasta, `${pin.chave}.png`), png);
    resultado.gravados++;
  }
  writeFileSync(join(pasta, 'pins.csv'), planilhaDosPins(lista, config), 'utf8');
  writeFileSync(join(pasta, 'feed.xml'), feedDosPins(lista, config), 'utf8');
  writeFileSync(join(config.blog.pasta, 'pinterest.html'), galeriaDosPins(lista, config), 'utf8');
  return resultado;
}

// ───────── Publicação pela API ─────────

export class ErroPinterest extends Error {
  /** Verdadeiro quando repetir não adianta (token vencido ou sem permissão). */
  fatal: boolean;
  constructor(mensagem: string, fatal: boolean) {
    super(mensagem);
    this.fatal = fatal;
  }
}

/** Cliente mínimo da API v5 do Pinterest. Com PINTEREST_SANDBOX=1 usa o ambiente de testes (api-sandbox). */
export class Pinterest {
  private token: string;
  private boardId: string;
  private base: string;
  private fetchFn: Fetch;

  constructor(token: string, boardId: string, sandbox = false, fetchFn: Fetch = fetch) {
    this.token = token;
    this.boardId = boardId;
    this.base = sandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
    this.fetchFn = fetchFn;
  }

  private async chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<any> {
    let r: Response;
    try {
      r = await this.fetchFn(`${this.base}/${caminho}`, {
        method: metodo,
        headers: { authorization: `Bearer ${this.token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErroPinterest(`Sem conexão com o Pinterest: ${(e as Error).message}`, false);
    }
    const dados = (await r.json().catch(() => ({}))) as any;
    if (r.ok) return dados;
    // 401 = token inválido ou vencido (dura 30 dias); 403 = sem permissão (pins:write) ou app ainda em acesso de teste.
    throw new ErroPinterest(`Pinterest recusou (${r.status}${dados.code ? `/${dados.code}` : ''}): ${dados.message ?? 'erro desconhecido'}`, r.status === 401 || r.status === 403);
  }

  /** Confere o token e o quadro, sem publicar nada. */
  async checar(): Promise<string> {
    const conta = await this.chamar('GET', 'user_account');
    const quadro = await this.chamar('GET', `boards/${this.boardId}`);
    return `conta @${conta.username ?? '?'}, quadro "${quadro.name ?? this.boardId}"`;
  }

  async criarPin(d: { titulo: string; descricao: string; link: string; alt: string; imagem: string }): Promise<string> {
    const r = await this.chamar('POST', 'pins', {
      board_id: this.boardId,
      title: cortar(d.titulo, MAX_TITULO),
      description: cortar(d.descricao, MAX_DESCRICAO),
      link: d.link,
      alt_text: cortar(d.alt, 500),
      media_source: { source_type: 'image_url', url: d.imagem },
    });
    return String(r.id ?? '');
  }
}

async function noAr(url: string, fetchFn: Fetch): Promise<boolean> {
  try {
    return (await fetchFn(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })).ok;
  } catch {
    return false;
  }
}

export interface ResumoDoPinterest {
  publicados: number;
  avisos: string[];
}

/** Publica pela API, no máximo um pin por rodada e PINTEREST_PINS_POR_DIA por dia, quando a imagem já está no ar. Sem token e quadro, não faz nada. */
export async function publicarNoPinterest(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch, cliente?: Pinterest): Promise<ResumoDoPinterest> {
  const resumo: ResumoDoPinterest = { publicados: 0, avisos: [] };
  const p = config.pinterest;
  if (!p.ativo || !p.token || !p.boardId || !/^https:\/\//.test(config.blog.url)) return resumo;
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return resumo;
  if (banco.pinsPublicadosNoDia(agora) >= p.pinsPorDia) return resumo;
  const pendente = banco.pinsRecentes(1, agora).reverse().find((r) => r.publicadoEm === undefined && r.tentativas < 3);
  if (!pendente) return resumo;
  const imagem = enderecoDoPin(config, pendente.chave);
  if (!(await noAr(imagem, fetchFn))) return resumo;
  const dados = JSON.parse(pendente.dados) as DadosDoPin;
  try {
    await (cliente ?? new Pinterest(p.token, p.boardId, p.sandbox, fetchFn)).criarPin({ titulo: dados.titulo, descricao: dados.descricao, link: dados.link, alt: dados.alt, imagem });
    banco.marcarPinPublicado(pendente.chave, agora);
    resumo.publicados++;
  } catch (e) {
    banco.registrarFalhaDoPin(pendente.chave);
    resumo.avisos.push(`Pinterest: o pin não saiu (tentativa ${pendente.tentativas + 1} de 3): ${(e as Error).message}${e instanceof ErroPinterest && e.fatal ? ' Confira o PINTEREST_TOKEN (vale 30 dias) e se o app tem acesso para publicar.' : ''}`);
  }
  return resumo;
}
