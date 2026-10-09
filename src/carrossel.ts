import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { EXPLICACOES_DOS_CRITERIOS } from './dicas.ts';
import { TIPOS_DE_GUIA, tipoDeGuia } from './guias.ts';
import { passaNoFiltroDoInstagram } from './instagram.ts';
import { arquivosDoCarrossel, baixarImagemComoDataUri, montarSvgsDoCarrossel, nomeDaMarca, renderizarPng, type DadosDaDica, type DadosDoCarrossel, type DadosDoGrupo, type Fetch } from './social.ts';
import { dadosDaApresentacao } from './vitrine.ts';
import type { OfertaAvaliada } from './types.ts';

const DIA_MS = 86_400_000;

/**
 * Escolhe os produtos do Reel (o carrossel "Top N até R$ X" saiu: ele mostrava preço). O teto de preço, só um filtro interno, gira entre os dias (50, 100, 200...),
 * e só entram produtos que passam no filtro de qualidade do Instagram, com foto. Evita encher o carrossel de um
 * tipo só (no máximo 2 por categoria, a menos que faltem produtos). Se o teto do dia não tem produtos
 * suficientes, tenta o seguinte. `produtos` já vem do melhor para o pior.
 */
export function escolherParaCarrossel(produtos: OfertaAvaliada[], config: Config, agora: Date): { teto: number; ordem: OfertaAvaliada[] } | undefined {
  const ig = config.instagram;
  const n = ig.carrosselItens;
  if (ig.carrosselTetos.length === 0) return undefined;
  const volta = Math.floor(agora.getTime() / DIA_MS);
  for (let k = 0; k < ig.carrosselTetos.length; k++) {
    const teto = ig.carrosselTetos[(volta + k) % ig.carrosselTetos.length]!;
    const faixa = produtos.filter((o) => o.preco <= teto && /^https:\/\//i.test(o.link) && /^https:\/\//i.test(o.imagem ?? '') && passaNoFiltroDoInstagram(o, ig));
    if (faixa.length < n) continue;
    const porCategoria = new Map<string, number>();
    const variados = faixa.filter((o) => {
      const usados = porCategoria.get(o.categoria) ?? 0;
      if (usados >= 2) return false;
      porCategoria.set(o.categoria, usados + 1);
      return true;
    });
    // A ordem de tentativa: primeiro os variados, depois o resto (caso alguma foto falhe ou faltem categorias).
    const ordem = [...variados, ...faixa.filter((o) => !variados.includes(o))];
    return { teto, ordem };
  }
  return undefined;
}

/**
 * Cria o carrossel do dia (um só por dia), se o Instagram e o carrossel estiverem ligados. Só nos dias da dica
 * (INSTAGRAM_DICAS_DIAS) e só com assunto que não saiu nos últimos 14 dias: o carrossel é sempre educativo
 * ("N coisas para olhar antes de comprar [produto]"), sem preço. Sem assunto novo, não cria nada.
 * Devolve true se criou um.
 */
export async function prepararCarrossel(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const ig = config.instagram;
  if (!config.social.ativo || !ig.ativo || ig.carrosselPorDia <= 0) return false;
  if (banco.carrosselCriadoNoDia(agora)) return false;
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return false;
  // Uma vez por semana, nos dias escolhidos, o carrossel apresenta o grupo ("Por que entrar no grupo").
  if (ig.grupoDias.includes(diaDaSemana(agora)) && prepararApresentacao(banco, config, agora)) return true;
  if (!ig.dicasDias.includes(diaDaSemana(agora))) return false;
  return prepararDica(banco, config, agora, fetchFn);
}

/** A apresentação do grupo não volta antes disso, mesmo que mais de um dia da semana esteja marcado. */
const DIAS_SEM_REPETIR_APRESENTACAO = 6;
/** Com menos achados que isso na semana, a apresentação não convence: espera. */
const MINIMO_DE_ACHADOS_NA_SEMANA = 10;

/** Cria o carrossel "Por que entrar no grupo" com os números da última semana. Devolve true se criou. */
export function prepararApresentacao(banco: Banco, config: Config, agora: Date): boolean {
  if (banco.carrosseisPublicadosRecentes(DIAS_SEM_REPETIR_APRESENTACAO, agora).some((c) => c.startsWith('grupo-'))) return false;
  const numeros = dadosDaApresentacao(banco, config, agora);
  if (numeros.achadosNaSemana < MINIMO_DE_ACHADOS_NA_SEMANA) return false;
  const dados: DadosDoGrupo = { formato: 'grupo', titulo: `Por que entrar no grupo ${nomeDaMarca()}`, ...numeros };
  banco.salvarCarrossel(`grupo-${diaDe(agora)}`, dados.titulo, JSON.stringify(dados), agora);
  return true;
}

/**
 * Grava em blog/social/ os PNGs do carrossel que está esperando para ser publicado (capa, um critério por imagem e o fechamento).
 * Como o site é refeito inteiro a cada rodada, isso roda toda vez. Devolve quantos PNGs saíram.
 */
export async function gravarPngsDoCarrossel(banco: Banco, config: Config, agora: Date): Promise<number> {
  if (!config.social.ativo || !config.instagram.ativo) return 0;
  const pendente = banco.carrosselPendente(agora);
  if (!pendente) return 0;
  const dados = JSON.parse(pendente.dados) as DadosDoCarrossel;
  const pasta = join(config.blog.pasta, 'social');
  mkdirSync(pasta, { recursive: true });
  // Carrossel de outro formato (o "Top" antigo, que mostrava preço) não é mais gravado.
  if (dados.formato !== 'dica' && dados.formato !== 'grupo') return 0;
  const svgs = montarSvgsDoCarrossel(dados);
  const nomes = arquivosDoCarrossel(pendente.chave, svgs.length);
  let gravados = 0;
  for (let i = 0; i < svgs.length; i++) {
    const png = await renderizarPng(svgs[i]!, 1080);
    if (!png) return gravados; // sem o conversor de imagens não há o que gravar
    writeFileSync(join(pasta, nomes[i]!), png);
    gravados++;
  }
  return gravados;
}

/** Dia da semana no horário de Brasília: 0 = domingo ... 6 = sábado. */
export function diaDaSemana(agora: Date): number {
  const curto = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(agora);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(curto);
}

/** Um assunto de dica não volta antes disso (são 30 tipos de guia; os com produtos suficientes giram). */
const DIAS_SEM_REPETIR_DICA = 14;

/**
 * Cria o carrossel educativo "N coisas para olhar antes de comprar [produto]": os critérios fixos do guia
 * (texto escrito uma vez, sem inventar nada sobre produtos) e, no fim, os 3 primeiros produtos do guia publicado.
 * Só usa guias que já têm 3 produtos ou mais, e não repete um assunto usado nos últimos 14 dias.
 */
export async function prepararDica(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const usados = new Set(
    banco
      .carrosseisPublicadosRecentes(DIAS_SEM_REPETIR_DICA, agora)
      .filter((c) => c.startsWith('dica-'))
      .map((c) => c.replace(/^dica-\d{4}-\d{2}-\d{2}-/, '')),
  );
  const candidatos: Array<{ tipo: (typeof TIPOS_DE_GUIA)[number]; itens: OfertaAvaliada[] }> = [];
  for (const salvo of banco.guiasSalvos()) {
    const tipo = TIPOS_DE_GUIA.find((t) => t.slug === salvo.tipo);
    if (!tipo || usados.has(tipo.slug) || tipo.criterios.length < 3) continue;
    let itens: OfertaAvaliada[];
    try {
      itens = ((JSON.parse(salvo.dados) as { itens?: OfertaAvaliada[] }).itens ?? []).filter((o) => o?.titulo && Number.isFinite(o.preco) && /^https:\/\//i.test(o.link ?? '') && tipoDeGuia(o.titulo)?.slug === tipo.slug);
    } catch {
      continue;
    }
    if (itens.length >= 3) candidatos.push({ tipo, itens });
  }
  if (candidatos.length === 0) return false;
  candidatos.sort((a, b) => a.tipo.slug.localeCompare(b.tipo.slug));
  const { tipo, itens } = candidatos[Math.floor(agora.getTime() / DIA_MS) % candidatos.length]!;

  const primeiros: DadosDaDica['itens'] = [];
  for (const o of itens.slice(0, 3)) {
    // Guarda só o que a arte e a legenda usam (o item do guia traz gráfico e textos que pesam no banco).
    const oferta: OfertaAvaliada = { loja: o.loja, idProduto: o.idProduto, titulo: o.titulo, preco: o.preco, link: o.link, nota: o.nota, vendas: o.vendas, categoria: o.categoria, pontos: o.pontos };
    primeiros.push({ oferta, imagem: await baixarImagemComoDataUri(o.imagem, fetchFn) });
  }
  const dados: DadosDaDica = {
    formato: 'dica',
    titulo: `${tipo.criterios.length} coisas para olhar antes de comprar ${tipo.nome}`,
    slug: tipo.slug,
    assunto: tipo.nome,
    categoria: tipo.categoria,
    criterios: tipo.criterios,
    explicacoes: EXPLICACOES_DOS_CRITERIOS[tipo.slug],
    itens: primeiros,
  };
  banco.salvarCarrossel(`dica-${diaDe(agora)}-${tipo.slug}`, dados.titulo, JSON.stringify(dados), agora);
  return true;
}
