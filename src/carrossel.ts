import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { EXPLICACOES_DOS_CRITERIOS } from './dicas.ts';
import { TIPOS_DE_GUIA, tipoDeGuia } from './guias.ts';
import { passaNoFiltroDoInstagram } from './instagram.ts';
import { arquivosDoCarrossel, baixarImagemComoDataUri, comentaQueroAtivo, montarSvgsDoCarrossel, montarSvgsDosAchados, nomeDaMarca, renderizarPng, type DadosDaDica, type DadosDoCarrossel, type DadosDoDuelo, type DadosDoGrupo, type DadosDosAchados, type Fetch } from './social.ts';
import { formatarVendas } from './mensagem.ts';
import { mesmoTipoDeProduto } from './parecidos.ts';
import { gravarCarrosselComRemotion, nomesDaIa, propsDoRemotion } from './remotion.ts';
import { linhaPorDia, numerosDoGrupo } from './grupo.ts';
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
  if (ig.dicasDias.includes(diaDaSemana(agora)) && (await prepararDica(banco, config, agora, fetchFn))) return true;
  if (ig.perguntaDias.includes(diaDaSemana(agora)) && (await prepararDuelo(banco, config, agora, fetchFn))) return true;
  return prepararAchados(banco, config, agora, fetchFn);
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
  if (dados.formato === 'achados') {
    // O carrossel de achados é desenhado pelo Remotion; se não der, sai o plano B (capa simples e a arte do feed de cada produto).
    const nomes = arquivosDoCarrossel(pendente.chave, dados.itens.length + 2);
    const comentaQuero = comentaQueroAtivo(banco, config, agora);
    const props = propsDoRemotion(dados.itens, comentaQuero, dados.nomes);
    const grupo = linhaPorDia(numerosDoGrupo(banco, agora));
    const motivo = await gravarCarrosselComRemotion({ titulo: dados.capa, fato: dados.fato, itens: props.itens, comentaQuero, ...(grupo ? { grupo } : {}) }, pasta, nomes, config);
    if (!motivo) return nomes.length;
    console.log(`[carrossel] imagens do Remotion não saíram (${motivo}); gravando o plano B.`);
    const svgs = montarSvgsDosAchados(dados, comentaQuero);
    let gravados = 0;
    for (let i = 0; i < svgs.length; i++) {
      const png = await renderizarPng(svgs[i]!, 1080);
      if (!png) return gravados;
      writeFileSync(join(pasta, nomes[i]!), png);
      gravados++;
    }
    return gravados;
  }
  // Carrossel de outro formato (o "Top" antigo, que mostrava preço) não é mais gravado.
  if (dados.formato !== 'dica' && dados.formato !== 'grupo' && dados.formato !== 'duelo') return 0;
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

/** Como o nicho aparece no título da capa ("5 ACHADOS DE PET"). */
const NICHO_NA_CAPA: Record<string, string> = { tech: 'TECNOLOGIA', casa: 'CASA', games: 'GAMER', beleza: 'BELEZA', moda: 'MODA', esporte: 'ACADEMIA', pet: 'PET', bebe: 'BEBÊ', ferramentas: 'FERRAMENTAS' };
/** Quantos produtos o carrossel de achados mostra, e por quantos dias um nicho espera para voltar. */
const ITENS_DOS_ACHADOS = 5;
const DIAS_SEM_REPETIR_NICHO = 3;

/** Os melhores produtos do nicho que servem ao Instagram (bem avaliados, com foto e link seguro), sem dois do mesmo tipo. */
export function produtosDosAchados(produtos: OfertaAvaliada[], config: Config, categoria?: string): OfertaAvaliada[] {
  const escolhidos: OfertaAvaliada[] = [];
  for (const o of produtos) {
    if (categoria && o.categoria !== categoria) continue;
    if (!/^https:\/\//i.test(o.link) || !/^https:\/\//i.test(o.imagem ?? '') || !passaNoFiltroDoInstagram(o, config.instagram)) continue;
    if (escolhidos.some((e) => e.idProduto === o.idProduto || mesmoTipoDeProduto(e.titulo, o.titulo))) continue;
    escolhidos.push(o);
  }
  return escolhidos;
}

/**
 * Cria o carrossel "5 achados de [nicho]": o nicho do dia gira entre os que têm produtos bons suficientes e não saíram nos últimos dias
 * (sem nenhum, um carrossel com os melhores de todos os nichos). Só nasce perto da primeira hora do feed, para os dados serem de agora.
 * A IA escreve os nomes curtos uma vez, aqui.
 */
export async function prepararAchados(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const primeiraHora = Math.min(...(config.instagram.horariosFeed.length ? config.instagram.horariosFeed : [config.ritmo.horaInicio + 1]));
  if (horaDe(agora) < primeiraHora - 1) return false;
  const produtos = banco.melhoresProdutos({ horas: 48, limite: 400 }, agora);
  const recentes = banco.carrosseisPublicadosRecentes(DIAS_SEM_REPETIR_NICHO, agora);
  const candidatos = Object.keys(NICHO_NA_CAPA)
    .filter((c) => !config.instagram.soNosReels.includes(c))
    .filter((c) => !recentes.some((r) => r.startsWith('achados-') && r.endsWith(`-${c}`)))
    .map((c) => ({ categoria: c, itens: produtosDosAchados(produtos, config, c) }))
    .filter((c) => c.itens.length >= ITENS_DOS_ACHADOS);
  // Gira entre os nichos possíveis pelo dia (o mesmo nicho não sai dias seguidos).
  const escolhido = candidatos.length ? candidatos[Math.floor(agora.getTime() / DIA_MS) % candidatos.length]! : { categoria: 'geral', itens: produtosDosAchados(produtos, config) };
  const itens: DadosDosAchados['itens'] = [];
  for (const oferta of escolhido.itens) {
    if (itens.length >= ITENS_DOS_ACHADOS) break;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    if (imagem) itens.push({ oferta, imagem });
  }
  if (itens.length < 3) return false;
  const rotulo = NICHO_NA_CAPA[escolhido.categoria] ?? 'HOJE';
  const soma = itens.reduce((t, it) => t + (it.oferta.vendas ?? 0), 0);
  const dados: DadosDosAchados = {
    formato: 'achados',
    titulo: `${itens.length} achados de ${rotulo.toLowerCase()} pra salvar`,
    capa: [`${itens.length} ACHADOS DE ${rotulo}`, 'PRA SALVAR AGORA'],
    fato: soma >= 1000 ? `+${formatarVendas(soma).toUpperCase()} VENDIDOS` : '',
    categoria: escolhido.categoria,
    itens,
    nomes: await nomesDaIa(itens.map((it) => it.oferta.titulo), config, fetchFn),
  };
  banco.salvarCarrossel(`achados-${diaDe(agora)}-${escolhido.categoria}`, dados.titulo, JSON.stringify(dados), agora);
  return true;
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

/** Um assunto do "A ou B?" não volta antes disso. */
const DIAS_SEM_REPETIR_DUELO = 21;

/**
 * Cria o carrossel "A ou B?": os dois primeiros produtos de um guia publicado, lado a lado, para a pessoa escolher nos comentários.
 * Só usa dois produtos de verdade do guia (com foto) e não repete o assunto nos últimos 21 dias. Sem preço.
 */
export async function prepararDuelo(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const usados = new Set(
    banco
      .carrosseisPublicadosRecentes(DIAS_SEM_REPETIR_DUELO, agora)
      .filter((c) => c.startsWith('duelo-'))
      .map((c) => c.replace(/^duelo-\d{4}-\d{2}-\d{2}-/, '')),
  );
  const candidatos: Array<{ tipo: (typeof TIPOS_DE_GUIA)[number]; itens: OfertaAvaliada[] }> = [];
  for (const salvo of banco.guiasSalvos()) {
    const tipo = TIPOS_DE_GUIA.find((t) => t.slug === salvo.tipo);
    if (!tipo || usados.has(tipo.slug)) continue;
    let itens: OfertaAvaliada[];
    try {
      itens = ((JSON.parse(salvo.dados) as { itens?: OfertaAvaliada[] }).itens ?? []).filter((o) => o?.titulo && Number.isFinite(o.preco) && /^https:\/\//i.test(o.link ?? '') && /^https:\/\//i.test(o.imagem ?? '') && tipoDeGuia(o.titulo)?.slug === tipo.slug);
    } catch {
      continue;
    }
    if (itens.length >= 2) candidatos.push({ tipo, itens });
  }
  if (candidatos.length === 0) return false;
  candidatos.sort((a, b) => a.tipo.slug.localeCompare(b.tipo.slug));
  const { tipo, itens } = candidatos[Math.floor(agora.getTime() / DIA_MS) % candidatos.length]!;

  const dois: DadosDoDuelo['itens'] = [];
  for (const o of itens.slice(0, 2)) {
    const imagem = await baixarImagemComoDataUri(o.imagem, fetchFn);
    if (!imagem) return false; // sem as duas fotos, o "A ou B?" não faz sentido
    const oferta: OfertaAvaliada = { loja: o.loja, idProduto: o.idProduto, titulo: o.titulo, preco: o.preco, link: o.link, nota: o.nota, vendas: o.vendas, freteGratis: o.freteGratis, categoria: o.categoria, pontos: o.pontos };
    dois.push({ oferta, imagem });
  }
  const dados: DadosDoDuelo = { formato: 'duelo', titulo: `${tipo.nome}: A ou B?`, slug: tipo.slug, assunto: tipo.nome, categoria: tipo.categoria, itens: dois };
  banco.salvarCarrossel(`duelo-${diaDe(agora)}-${tipo.slug}`, dados.titulo, JSON.stringify(dados), agora);
  return true;
}
