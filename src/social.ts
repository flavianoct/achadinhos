import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { formatarVendas } from './mensagem.ts';
import { normalizar } from './categoria.ts';
import { CORES_DO_NICHO, esc, fundo, marca, MARCA, svgDaCapaDaDica, svgDaCapaDoDuelo, svgDoCompetidor, svgDoFechamentoDoDuelo, svgDoCriterio, svgDoFechamentoDaDica, svgDoFeed, svgDoStory, svgsDaApresentacao, type DadosDaApresentacao, type DadosDaArte, type TipoDeGancho } from './moldes.ts';
import { semListaDeModelos } from './fontes/mercadolivre-api.ts';
import type { OfertaAvaliada } from './types.ts';

export type Fetch = typeof fetch;

/** Tudo o que o painel mostra para uma oferta: arte do Story, legenda e roteiro de vídeo. */
export interface ConteudoSocial {
  id: string;
  criadoEm: number;
  titulo: string;
  legenda: string;
  roteiro: string;
  svg: string;
}

const HASHTAGS: Record<string, string[]> = {
  tech: ['#tecnologia', '#gadgets', '#celular', '#fone', '#fonebluetooth', '#eletronicos', '#smartphone', '#tecnologiabrasil'],
  casa: ['#casa', '#cozinha', '#utilidades', '#decoracao', '#casaorganizada', '#utilidadesdomesticas', '#lar', '#dicasdecasa'],
  beleza: ['#beleza', '#skincare', '#maquiagem', '#autocuidado', '#cuidadoscomapele', '#cabelo', '#perfumes', '#makeup'],
  moda: ['#moda', '#lookdodia', '#estilo', '#modafeminina', '#modamasculina', '#outfit', '#tendencia', '#acessorios'],
  esporte: ['#fitness', '#treino', '#academia', '#suplementos', '#vidasaudavel', '#whey', '#musculacao', '#saude'],
  games: ['#games', '#gamer', '#videogame', '#gamebr', '#setupgamer', '#playstation', '#pcgamer', '#gaming'],
  bebe: ['#maternidade', '#bebe', '#mamae', '#maedeprimeiraviagem', '#enxovalbebe', '#filhos', '#vidademae', '#infantil'],
  ferramentas: ['#ferramentas', '#bricolagem', '#facavocemesmo', '#diy', '#construcao', '#reforma', '#oficina', '#marcenaria'],
  pet: ['#pet', '#cachorro', '#gato', '#petshop', '#amopets', '#dogsofinstagram', '#tutordepet', '#cuidadoscompet'],
  geral: ['#achadinhos', '#ofertas', '#compras', '#dicasdecompra', '#economia'],
};

/** Hashtags de alcance, comuns a todas as ofertas (ofertas, economia, achadinhos, Mercado Livre). */
const HASHTAGS_COMUNS = ['#achadinhos', '#achadinhosdodia', '#achadinhosmercadolivre', '#promocao', '#promocaododia', '#ofertas', '#ofertasdodia', '#desconto', '#cupom', '#mercadolivre', '#comprasonline', '#economizar', '#publi'];

/** No máximo 9 hashtags de assunto (muitas parecem spam): as da categoria primeiro, depois as de alcance. O #publi vai na primeira linha. */
export function hashtagsDaCategoria(categoria: string): string[] {
  const todas = [...(HASHTAGS[categoria] ?? HASHTAGS.geral), ...HASHTAGS_COMUNS];
  return [...new Set(todas.filter((h) => h !== '#publi'))].slice(0, 9);
}

const ROTULO_DA_CATEGORIA: Record<string, string> = {
  tech: 'TECNOLOGIA',
  casa: 'CASA E COZINHA',
  games: 'GAMES',
  beleza: 'BELEZA',
  moda: 'MODA',
  esporte: 'ESPORTE E FITNESS',
  pet: 'PET',
  bebe: 'BEBÊ E INFANTIL',
  ferramentas: 'FERRAMENTAS',
  geral: 'VARIEDADES',
};

/** Palavras que sozinhas não dizem nada sobre o produto (ou só enchem o título do anúncio). */
const RUIDO_DO_TITULO = new Set(['promocao', 'oferta', 'lancamento', 'imperdivel', 'full']);
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'em', 'a', 'o', 'na', 'no', 'por', 'c/', '+', '-', '–', '|', 'ou']);

/**
 * Título curto para a arte, sem reticências: tira o que vem entre parênteses, corta no primeiro separador forte
 * (" - ", " | ", vírgula) e fica só com as palavras que cabem em `maxLinhas` linhas, sem terminar numa palavra de ligação.
 * O título completo vai na legenda.
 */
export function tituloParaArte(titulo: string, largura: number, maxLinhas = 2): string[] {
  let t = titulo.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const primeiro = t.split(/\s[-–|]\s|,\s/)[0]!.trim();
  if (primeiro.length >= 18) t = primeiro;
  const palavras = t.split(' ').filter((p) => !RUIDO_DO_TITULO.has(normalizar(p)));
  if (palavras.length === 0) return quebrarTexto(titulo, largura, maxLinhas);

  let cabem = 0;
  for (let k = 1; k <= palavras.length; k++) {
    if (quebrarSemCorte(palavras.slice(0, k).join(' '), largura).length > maxLinhas) break;
    cabem = k;
  }
  let usadas = palavras.slice(0, Math.max(cabem, 1));
  while (usadas.length > 2 && LIGACOES.has(normalizar(usadas[usadas.length - 1]!))) usadas = usadas.slice(0, -1);
  return quebrarTexto(usadas.join(' '), largura, maxLinhas);
}

/** Quebra em linhas sem cortar nada (diferente de quebrarTexto, que limita e põe reticências). */
function quebrarSemCorte(texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of texto.split(' ')) {
    if (!atual) atual = p;
    else if (`${atual} ${p}`.length <= largura) atual = `${atual} ${p}`;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Título inteiro para a legenda, sem reticências (corta numa palavra só se passar de `max`). */
function tituloCompleto(titulo: string, max = 150): string {
  const limpo = semListaDeModelos(titulo);
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  return corte.slice(0, corte.lastIndexOf(' ') > 40 ? corte.lastIndexOf(' ') : max).replace(/[\s,;:\-–|]+$/, '');
}

/**
 * O desconto pode ir na arte e na legenda (em %, nunca em reais)? Sim, a menos que o histórico do robô prove que o preço "de"
 * é inflado (o produto nunca custou perto dele).
 */
export function descontoConfiavel(o: OfertaAvaliada): boolean {
  return o.precoDe !== 'inflado';
}

/** Desconto em % para a arte: o da loja ou, sem ele, o calculado pelo preço "de". 0 se não há ou se o "de" parece inflado. */
export function descontoParaArte(o: OfertaAvaliada): number {
  if (!descontoConfiavel(o)) return 0;
  if (o.desconto && o.desconto > 0) return Math.round(o.desconto);
  return o.precoOriginal && o.precoOriginal > o.preco ? Math.round((1 - o.preco / o.precoOriginal) * 100) : 0;
}

/**
 * O selo do topo da arte: o motivo para parar o dedo. Prefere o que o histórico do robô prova (menor preço em N dias),
 * e, sem nada melhor, o assunto do produto. Nunca mostra valor (nem em reais nem em %): o preço fica no grupo.
 */
export function ganchoDaOferta(o: OfertaAvaliada): { gancho: string; curto: string; tipo: TipoDeGancho } {
  if (o.menorPrecoEmDias) return { gancho: `MENOR PREÇO EM ${o.menorPrecoEmDias} DIAS`, curto: 'MENOR PREÇO', tipo: 'historico' };
  const categoria = ROTULO_DA_CATEGORIA[o.categoria] ?? ROTULO_DA_CATEGORIA.geral!;
  return { gancho: categoria, curto: categoria, tipo: 'categoria' };
}

/** Perguntas de curiosidade: o preço só aparece no grupo. */
const PERGUNTAS = ['QUANTO CUSTA AGORA?', 'ADIVINHA O PREÇO?', 'QUANTO VOCÊ PAGARIA?'];

/** A pergunta da arte: "CAIU MESMO?" quando o histórico prova a queda; senão, uma pergunta de curiosidade (a mesma para o mesmo produto). */
export function perguntaDaArte(o: OfertaAvaliada): string {
  return ganchoDaOferta(o).tipo === 'historico' ? 'CAIU MESMO?' : PERGUNTAS[escolha(o.idProduto, PERGUNTAS.length)]!;
}

/**
 * Gatilhos mentais da arte, em duas etiquetas: a vermelha grande (urgência e escassez) e a amarela pequena (exclusividade e curiosidade).
 * Nada que invente estoque, prazo ou número: só a sensação de "corra e entre no grupo".
 */
export const GATILHOS_DE_URGENCIA = ['ACHADO DO DIA', 'OLHA ESSE ACHADO', 'VALE O OLHAR', 'GARIMPO DE HOJE', 'SEPARADO PRA VOCÊ', 'BOM DEMAIS'];
export const GATILHOS_DE_EXCLUSIVIDADE = ['SÓ NO GRUPO', 'VEJA PRIMEIRO NO GRUPO', 'O PREÇO TÁ NO GRUPO', 'LIBERADO NO GRUPO'];

export function gatilhoDaArte(o: OfertaAvaliada): string {
  return GATILHOS_DE_URGENCIA[escolha(`g${o.idProduto}`, GATILHOS_DE_URGENCIA.length)]!;
}

export function gatilhoDeExclusividade(o: OfertaAvaliada): string {
  return GATILHOS_DE_EXCLUSIVIDADE[escolha(`e${o.idProduto}`, GATILHOS_DE_EXCLUSIVIDADE.length)]!;
}

/** Número estável de 0 a n-1 para o mesmo produto: varia o gancho entre produtos sem sorteio (o mesmo produto repete a frase). */
function escolha(id: string, n: number): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

/**
 * Primeira linha da legenda. Só afirma o que os dados provam: "menor preço" só quando o histórico do robô confirma,
 * "campeão de vendas" só com muitas vendas e nota alta. Varia a frase entre produtos para as legendas não ficarem iguais.
 */
export function montarGancho(o: OfertaAvaliada): string {
  const dias = o.menorPrecoEmDias;
  const queda = Math.round(o.quedaHistorica ?? 0);
  let opcoes: string[];
  if (dias && queda >= 5) opcoes = [`📉 ${queda}% mais barato que o menor preço dos últimos ${dias} dias`, `📉 Caiu ${queda}% abaixo do nosso menor registro de ${dias} dias`];
  else if (dias) opcoes = [`📉 Menor preço dos últimos ${dias} dias`, `📉 O preço mais baixo que registramos em ${dias} dias`];
  else if (o.vendas && o.vendas >= 1000 && o.nota && o.nota >= 4.7) opcoes = [`⭐ Campeão de vendas: ${formatarVendas(o.vendas)} vendidos`, `⭐ Queridinho de quem compra: nota ${o.nota.toFixed(1).replace('.', ',')}`];
  else opcoes = ['👀 Separei esse achado pra você', '🛒 Olha o que eu garimpei hoje', '🔥 Esse achado merece o seu olhar'];
  return opcoes[escolha(o.idProduto, opcoes.length)];
}

/** "@topfera_achadinhos" a partir do link do canal; se não houver, o nome do blog. */
export function nomeDoCanal(config: Config): string {
  const m = /t\.me\/([A-Za-z0-9_]+)/.exec(config.blog.telegramLink);
  return m ? `@${m[1]}` : config.blog.nome;
}

/** Endereço do blog sem "https://" (ex.: flavianoct.github.io/achadinhos). Sem blog publicado, usa o canal. */
export function enderecoDoBlog(config: Config): string {
  const url = (config.blog.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return url || nomeDoCanal(config);
}

function titulosCurto(titulo: string, max = 70): string {
  const limpo = semListaDeModelos(titulo);
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  return `${corte.slice(0, corte.lastIndexOf(' ') > 30 ? corte.lastIndexOf(' ') : max).trimEnd()}…`;
}

/** Legenda para Instagram e TikTok. O link não é clicável na legenda: manda para a bio. */
/** O blog tem canal ou grupo de WhatsApp configurado? Se sim, as legendas e a bio divulgam. */
export function temWhatsapp(config: Config): boolean {
  return Boolean(config.blog.whatsappLink || config.whatsapp.destinos.length);
}

/** Para quem o produto serve: diz de cara se o post é para a pessoa, o que atrai quem realmente compra a categoria. */
const PARA_QUEM: Record<string, string[]> = {
  tech: ['Pra quem vive de tela e quer um upgrade sem gastar à toa', 'Pra quem quer tecnologia boa sem pagar o preço cheio'],
  casa: ['Pra quem quer facilitar a rotina de casa e da cozinha', 'Pra quem gosta de casa organizada sem gastar muito'],
  games: ['Pra quem joga e quer melhorar o setup', 'Pra gamer que sabe que cada real conta'],
  beleza: ['Pra quem quer cuidar de si sem pesar no bolso', 'Pra quem ama beleza e adora um bom preço'],
  moda: ['Pra quem quer estilo sem estourar o orçamento', 'Pra quem gosta de se vestir bem pagando menos'],
  esporte: ['Pra quem treina e quer equipamento bom pelo preço certo', 'Pra quem está criando o hábito de se exercitar'],
  pet: ['Pra quem tem pet e quer o melhor pra ele', 'Pra tutor que faz tudo pelo bichinho'],
  bebe: ['Pra mamãe e papai que querem economizar no enxoval', 'Pra quem tem criança em casa e sabe como o gasto cresce'],
  ferramentas: ['Pra quem gosta de resolver as coisas em casa', 'Pra quem tem uma reforma ou um conserto na lista'],
  geral: ['Pra quem gosta de comprar bem e pagar menos', 'Pra quem não perde achado bom'],
};

/** Perguntas que convidam a responder (comentário pesa mais no alcance do que curtida). */
const PERGUNTAS_DA_LEGENDA = ['Você usaria? Conta aqui 👇', 'Já tem um desses em casa? Me conta 👇', 'Entrou na sua lista? Responde aqui 👇', 'Marca quem precisa de um desses 👇'];

/** Prova real, só com o que os dados mostram: nota, vendas e frete. Sem número, não inventa. */
export function provaDaOferta(o: OfertaAvaliada): string | undefined {
  const partes: string[] = [];
  if (o.nota && o.nota >= 4) partes.push(`nota ${o.nota.toFixed(1).replace('.', ',')}`);
  if (o.vendas && o.vendas >= 100) partes.push(`${formatarVendas(o.vendas)} vendidos`);
  if (o.freteGratis) partes.push('frete grátis');
  return partes.length ? `✅ ${partes.join(' · ')}` : undefined;
}

export function montarLegenda(o: OfertaAvaliada, config: Config, comentaQuero = false): string {
  const linhas: string[] = [];
  const quem = PARA_QUEM[o.categoria] ?? PARA_QUEM.geral!;
  const grupo = temWhatsapp(config);
  // A primeira linha é o que aparece antes do "mais": gancho e aviso de publicidade já ali.
  linhas.push(`${montarGancho(o)} #publi`);
  // A chamada logo na segunda linha (antes do "mais"): é ela que gera o comentário, e o comentário é o que mais leva o post longe.
  if (comentaQuero) linhas.push('💬 Comenta QUERO que eu te mando o link no direct');
  linhas.push(tituloCompleto(o.titulo));
  linhas.push('');
  linhas.push(`🎯 ${quem[escolha(`q${o.idProduto}`, quem.length)]}`);
  const prova = provaDaOferta(o);
  if (prova) linhas.push(prova);
  linhas.push('');
  if (!comentaQuero) linhas.push(PERGUNTAS_DA_LEGENDA[escolha(`p${o.idProduto}`, PERGUNTAS_DA_LEGENDA.length)]!);
  linhas.push('💾 Salva o post pra achar depois');
  linhas.push('');
  // O preço em reais não vai na imagem nem na legenda: quem quer saber entra no grupo.
  // Sem grupo de WhatsApp configurado, não promete grupo: manda para o link da bio (blog).
  if (comentaQuero) linhas.push('💰 O preço de agora vai junto com o link, no seu direct');
  else linhas.push(grupo ? '💰 O preço de agora está no grupo (link na bio)' : '💰 O preço de agora está no link da bio');
  linhas.push(grupo ? '⏳ Achado assim some rápido: quem está no grupo vê primeiro' : '⏳ Achado assim some rápido: corre ver na bio');
  linhas.push(`👉 Todas as ofertas no blog, link na bio: ${enderecoDoBlog(config)}`);
  if (grupo) linhas.push(`📲 No grupo ${nomeDaMarca()} chegam achados assim todo dia, com o preço de agora e o histórico conferido. Entrar é grátis: link na bio.`);
  linhas.push('');
  linhas.push('Publi: link de afiliado. O preço pode mudar a qualquer momento.');
  linhas.push('');
  linhas.push(hashtagsDaCategoria(o.categoria).join(' '));
  return linhas.join('\n');
}

/** Roteiro de 15 segundos para o Reels/TikTok: gancho, produto, preço, chamada. */
export function montarRoteiro(o: OfertaAvaliada, config: Config): string {
  return [
    `0 a 3 s (gancho, mostre o produto): "Caiu mesmo? ${titulosCurto(o.titulo, 45)}!"`,
    `3 a 8 s (mostre em uso ou de perto): "${o.nota ? `Nota ${o.nota.toFixed(1).replace('.', ',')}` : 'Bem avaliado'}${o.vendas ? ` e ${formatarVendas(o.vendas)} vendidos` : ''}${o.freteGratis ? ', com frete grátis' : ''}."`,
    `8 a 12 s (texto grande na tela, sem valor em reais): "O preço de agora está no grupo. Quem entra primeiro, vê primeiro"`,
    `12 a 15 s (chamada): "O preço de agora está no grupo, link na minha bio." (texto na tela: ${enderecoDoBlog(config)})`,
    'Dica: escreva "publi" ou "link de afiliado" na legenda. Não fale nem mostre o preço em reais: ele fica no grupo.',
  ].join('\n');
}

/** Quebra o texto em linhas de até `largura` caracteres, no máximo `maxLinhas`; corta com reticências. */
export function quebrarTexto(texto: string, largura: number, maxLinhas: number): string[] {
  const palavras = texto.replace(/\s+/g, ' ').trim().split(' ');
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    if (!atual) atual = p;
    else if (`${atual} ${p}`.length <= largura) atual = `${atual} ${p}`;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= maxLinhas) return linhas;
  const cortadas = linhas.slice(0, maxLinhas);
  const ultima = cortadas[maxLinhas - 1];
  cortadas[maxLinhas - 1] = `${(ultima.length > largura - 1 ? ultima.slice(0, largura - 1) : ultima).trimEnd()}…`;
  return cortadas;
}

/** Dados da arte que os moldes (moldes.ts) usam. Nada aqui é valor em reais. */
/** Chave do aviso "o token do Instagram não tem permissão para ler comentários ou mandar direct": enquanto valer, o "comenta QUERO" fica desligado. */
export const CHAVE_DIRECT_BLOQUEADO = 'instagram:direct-bloqueado';

/** Final do token, para saber se o bloqueio do direct é do token atual (um token novo, com as permissões, libera de novo sozinho). */
export function marcaDoToken(token: string): string {
  return token.slice(-10);
}

/**
 * O "comenta QUERO" está valendo? Ligado no ajuste e sem o Instagram ter recusado comentários ou direct com o token atual. Quando recusa,
 * fica desligado até o token mudar: a arte e a legenda nunca prometem um direct que não vai chegar.
 */
export function comentaQueroAtivo(banco: Banco, config: Config, agora: Date): boolean {
  if (!config.instagram.comentaQuero) return false;
  const bloqueio = banco.textoSalvo(CHAVE_DIRECT_BLOQUEADO, 60, agora);
  return !bloqueio || !bloqueio.startsWith(`${marcaDoToken(config.instagram.token)}|`);
}

/** Vendas por dia a partir das quais o produto ganha o selo "EM ALTA" (a febre medida pelo robô). */
const VENDAS_POR_DIA_EM_ALTA = 30;

/**
 * O selo da foto, só com o que é verdade: o desconto em % quando o nosso histórico confirma o preço "de" (o produto já custou aquilo),
 * o menor preço provado pelo histórico, ou a febre (vendas por dia medidas pelo robô, ou o selo de mais vendido da própria loja).
 */
export function seloDaOferta(o: OfertaAvaliada): DadosDaArte['selo'] {
  const desconto = o.precoDe === 'confirmado' ? descontoParaArte(o) : 0;
  if (desconto >= 15) return { texto: `-${desconto}%`, tipo: 'desconto' };
  if (o.menorPrecoEmDias) return { texto: 'MENOR PREÇO', tipo: 'historico' };
  if ((o.vendasPorDia ?? 0) >= VENDAS_POR_DIA_EM_ALTA || o.maisVendido) return { texto: 'EM ALTA', tipo: 'febre' };
  return undefined;
}

function dadosDaArte(o: OfertaAvaliada, imagem: string | undefined, larguraDoTitulo: number, comentaQuero = false): DadosDaArte {
  const g = ganchoDaOferta(o);
  return {
    cor: CORES_DO_NICHO[o.categoria] ?? CORES_DO_NICHO.geral,
    selo: seloDaOferta(o),
    chamada: comentaQuero ? { linha: 'COMENTA "QUERO"', apoio: 'QUE EU TE MANDO O LINK NO DIRECT' } : undefined,
    titulo: tituloParaArte(o.titulo, larguraDoTitulo),
    desconto: 0,
    gatilho: gatilhoDaArte(o),
    gatilho2: gatilhoDeExclusividade(o),
    freteGratis: Boolean(o.freteGratis),
    foto: imagem,
    gancho: g.gancho,
    ganchoCurto: g.curto,
    ganchoTipo: g.tipo,
    pergunta: perguntaDaArte(o),
    nota: o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : undefined,
    vendas: o.vendas && o.vendas > 0 ? formatarVendas(o.vendas) : undefined,
  };
}

/** Arte do Story, 1080x1920, em SVG. A imagem do produto vai embutida (data URI) para o painel virar PNG no navegador. */
export function montarSvgDoStory(o: OfertaAvaliada, imagem: string | undefined, _config?: Config, comentaQuero = false): string {
  return svgDoStory(dadosDaArte(o, imagem, 32, comentaQuero));
}

/** Versão 4:5 (1080x1350) para o feed: o feed do Instagram não aceita imagem em pé 9:16. */
export function montarSvgDoFeed(o: OfertaAvaliada, imagem: string | undefined, _config?: Config, comentaQuero = false): string {
  return svgDoFeed(dadosDaArte(o, imagem, 33, comentaQuero));
}


/** Carrossel educativo "Antes de comprar [produto]": os critérios fixos do guia e os primeiros produtos dele. */
export interface DadosDaDica {
  formato: 'dica';
  titulo: string;
  slug: string;
  /** O produto, no plural ("fones de ouvido bluetooth"). */
  assunto: string;
  categoria: string;
  criterios: string[];
  /** Explicação prática de cada critério, na mesma ordem (ver dicas.ts). */
  explicacoes?: string[];
  itens: Array<{ oferta: OfertaAvaliada; imagem?: string }>;
}

/** Carrossel "Por que entrar no grupo": o que o grupo entrega, com os números do robô (sem preço). */
export interface DadosDoGrupo extends DadosDaApresentacao {
  formato: 'grupo';
  titulo: string;
}

/** Carrossel "A ou B?": os dois primeiros produtos de um guia, lado a lado, para a pessoa escolher nos comentários. Sem preço. */
export interface DadosDoDuelo {
  formato: 'duelo';
  titulo: string;
  slug: string;
  /** O produto, no plural ("air fryers"). */
  assunto: string;
  categoria: string;
  itens: Array<{ oferta: OfertaAvaliada; imagem?: string }>;
}

/** Os carrosséis do perfil: a dica "Antes de comprar", o "A ou B?" e a apresentação do grupo (o "Top até R$" saiu: ele mostrava preço). */
/** Carrossel "N achados de [nicho]": capa, um produto por imagem e o fim pedindo o número. Os nomes curtos vêm da IA (ou do título). */
export interface DadosDosAchados {
  formato: 'achados';
  titulo: string;
  /** Título da capa em duas linhas e o fato real ("+12 MIL VENDIDOS"; vazio se não houver). */
  capa: [string, string];
  fato: string;
  categoria: string;
  itens: Array<{ oferta: OfertaAvaliada; imagem: string }>;
  nomes?: string[];
}

export type DadosDoCarrossel = DadosDaDica | DadosDoGrupo | DadosDoDuelo | DadosDosAchados;

/** As quatro imagens do "A ou B?": capa, A, B e o fechamento. */
export function montarSvgsDoDuelo(d: DadosDoDuelo): string[] {
  const [a, b] = d.itens;
  const prova = (o: OfertaAvaliada, imagem?: string) => ({
    foto: imagem,
    linhas: tituloParaArte(o.titulo, 30),
    nota: o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : undefined,
    vendas: o.vendas && o.vendas > 0 ? formatarVendas(o.vendas) : undefined,
    freteGratis: Boolean(o.freteGratis),
  });
  return [
    svgDaCapaDoDuelo({ assunto: quebrarSemCorte(d.assunto, 24).slice(0, 2), a: a?.imagem, b: b?.imagem }),
    svgDoCompetidor({ letra: 'A', ...prova(a!.oferta, a!.imagem) }),
    svgDoCompetidor({ letra: 'B', ...prova(b!.oferta, b!.imagem) }),
    svgDoFechamentoDoDuelo(),
  ];
}

/** As imagens do carrossel, na ordem (a primeira é a capa). */
export function montarSvgsDoCarrossel(d: DadosDoCarrossel): string[] {
  if (d.formato === 'achados') return montarSvgsDosAchados(d);
  if (d.formato === 'duelo') return montarSvgsDoDuelo(d);
  return d.formato === 'grupo' ? svgsDaApresentacao(d) : montarSvgsDaDica(d);
}

/** Quantas imagens o carrossel tem. O Instagram aceita no máximo 10. */
export function totalDeImagens(d: DadosDoCarrossel): number {
  if (d.formato === 'achados') return d.itens.length + 2;
  if (d.formato === 'duelo') return 4;
  if (d.formato === 'grupo') return svgsDaApresentacao(d).length;
  return 1 + d.criterios.length + (d.itens.length >= 2 ? 1 : 0);
}

/** Nomes dos PNGs do carrossel, na ordem (a primeira é a capa). Estáveis entre rodadas (o Instagram precisa de um endereço público). */
export function arquivosDoCarrossel(chave: string, imagens: number): string[] {
  const base = chave.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return Array.from({ length: imagens }, (_, i) => `${base}-${i === 0 ? 'capa' : i}.png`);
}

/** As imagens do carrossel "Antes de comprar": capa, um critério por imagem e, no fim, os 3 primeiros do guia. */
export function montarSvgsDaDica(d: DadosDaDica): string[] {
  const slides = [svgDaCapaDaDica({ numero: d.criterios.length, assunto: quebrarSemCorte(d.assunto, 22).slice(0, 3) })];
  d.criterios.forEach((c, i) => {
    // O critério em destaque (grande) e a explicação logo abaixo (menor); o título encolhe se for comprido.
    let titulo = quebrarSemCorte(c, 22);
    let tamanhoDoTitulo = 64;
    if (titulo.length > 3) {
      titulo = quebrarSemCorte(c, 26);
      tamanhoDoTitulo = 56;
    }
    const explicacao = quebrarSemCorte(d.explicacoes?.[i] ?? '', 36).slice(0, 6);
    slides.push(svgDoCriterio({ posicao: i + 1, total: d.criterios.length, titulo, tamanhoDoTitulo, explicacao, assunto: d.assunto }));
  });
  if (d.itens.length >= 2) {
    slides.push(
      svgDoFechamentoDaDica({
        assunto: quebrarSemCorte(`de ${d.assunto}`, 30).slice(0, 2),
        itens: d.itens.slice(0, 3).map(({ oferta: o, imagem }) => ({
          foto: imagem,
          linhas: tituloParaArte(o.titulo, 24),
          nota: o.nota && o.nota > 0 ? o.nota.toFixed(1).replace('.', ',') : undefined,
          vendas: o.vendas && o.vendas > 0 ? formatarVendas(o.vendas) : undefined,
        })),
      }),
    );
  }
  return slides;
}

/** Perguntas que convidam a comentar (comentário vale mais para o alcance do que curtida); a mesma dica repete a pergunta. */
function perguntaDaDica(d: DadosDaDica): string {
  const opcoes = [
    'Qual desses pontos pesa mais para você? Conta aqui nos comentários 👇',
    'Faltou algum critério que você sempre olha? Comenta aqui 👇',
    `Marca alguém que está pesquisando ${d.assunto} 👇`,
  ];
  return opcoes[escolha(d.slug, opcoes.length)]!;
}

/** Legenda da dica: gancho e #publi na primeira linha, os critérios por escrito, a pergunta e a chamada para o guia. */
export function legendaDaDica(d: DadosDaDica, config: Config): string {
  const linhas = [`📌 ${d.titulo} #publi`, '🔖 Salva este post: ajuda na hora de comprar e evita arrependimento.', ''];
  d.criterios.forEach((c, i) => linhas.push(d.explicacoes?.[i] ? `${i + 1}) ${c}: ${d.explicacoes[i]}` : `${i + 1}) ${c}`));
  linhas.push(
    '',
    `💬 ${perguntaDaDica(d)}`,
    '',
    `👉 Os 3 primeiros do nosso guia de ${d.assunto}, com nota e vendas, e o guia completo: link na bio (${enderecoDoBlog(config)}). O preço de agora está no grupo.`,
    '',
    'Publi: link de afiliado nos produtos do guia. Os preços podem mudar a qualquer momento.',
    '',
    hashtagsDaCategoria(d.categoria).join(' '),
  );
  return linhas.join('\n');
}

/** O nome da marca em texto ("Mata Preço"). */
export const nomeDaMarca = () => MARCA.nome.map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');

/** Legenda da apresentação do grupo: o que ele entrega, em tópicos, e a chamada para entrar. Sem preço. */
export function legendaDoGrupo(d: DadosDoGrupo): string {
  const linhas = [
    `📲 Por que entrar no grupo ${nomeDaMarca()}? #publi`,
    '',
    `✅ ${d.achadosNaSemana} achados separados nos últimos 7 dias, direto no seu WhatsApp`,
    `📉 ${d.diasDeHistorico} dias de histórico de preço: a gente avisa quando é o menor preço do mês`,
    `🔎 Só entra oferta com ${d.descontoMinimo}% de desconto ou mais (ou ${d.quedaMinima}% abaixo do próprio histórico), com nota e vendas conferidas`,
  ];
  if (d.bloqueadas.length) linhas.push(`🚫 Nada de ${d.bloqueadas.slice(0, 3).join(', ')}`);
  if (d.assuntos.length) linhas.push(`🗂️ Separado por assunto: ${d.assuntos.join(', ')}`);
  linhas.push('', '👉 Entrar é grátis: link na bio. Sair é um toque, quando quiser.', '', '🔖 Salve este post e mande para quem vive caçando promoção.', '', 'Publi: os achados do grupo levam link de afiliado.', '', hashtagsDaCategoria('geral').join(' '));
  return linhas.join('\n');
}

/** Legenda do "A ou B?": a pergunta logo na primeira linha, os dois nomes, a prova de cada um e o pedido para comentar. Sem preço. */
export function legendaDoDuelo(d: DadosDoDuelo, config: Config): string {
  const [a, b] = d.itens.map((i) => i.oferta);
  const um = (letra: string, o: OfertaAvaliada) => {
    const prova = provaDaOferta(o);
    return `${letra} ${titulosCurto(o.titulo, 60)}${prova ? `\n${prova}` : ''}`;
  };
  return [
    `🤔 ${d.assunto}: A ou B? Qual você escolhe? #publi`,
    '',
    um('🅰️', a!),
    '',
    um('🅱️', b!),
    '',
    '💬 Comenta A ou B e conta o porquê 👇',
    '💾 Salva o post pra decidir com calma',
    '',
    `👉 O guia completo de ${d.assunto}, com nota e vendas: link na bio (${enderecoDoBlog(config)}). O preço de agora está no grupo.`,
    '',
    'Publi: link de afiliado nos produtos do guia. Os preços podem mudar a qualquer momento.',
    '',
    hashtagsDaCategoria(d.categoria).join(' '),
  ].join('\n');
}

/**
 * Plano B do carrossel de achados, sem o Remotion: capa simples, a arte do feed de cada produto e o fim com o pedido do número.
 * O visual principal é o do Remotion (remotion/src/Carrossel.tsx).
 */
export function montarSvgsDosAchados(d: DadosDosAchados, comentaQuero = false): string[] {
  const svg = (corpo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif">\n${fundo(1080, 1350, CORES_DO_NICHO[d.categoria] ?? CORES_DO_NICHO.geral)}\n${corpo}\n</svg>`;
  const t = (y: number, tam: number, cor: string, s: string) => `<text x="540" y="${y}" font-size="${tam}" font-weight="700" fill="${cor}" text-anchor="middle">${esc(s)}</text>`;
  const n = d.itens.length;
  const numeros = d.itens.map((_, i) => i + 1).join(', ').replace(/, (\d+)$/, ' OU $1');
  const capa = svg(`${marca(540, 110, 40, 'centro')}\n${t(330, 96, MARCA.branco, d.capa[0])}\n${t(450, 80, MARCA.amarelo, d.capa[1])}\n${d.fato ? t(600, 52, MARCA.branco, d.fato) : ''}\n${t(1180, 48, MARCA.amarelo, 'ARRASTA PRO LADO')}`);
  const fim = svg(`${marca(540, 110, 40, 'centro')}\n${t(420, 84, MARCA.amarelo, 'QUAL VOCÊ LEVARIA?')}\n${t(620, 72, MARCA.branco, `COMENTA ${numeros}`)}\n${t(720, 40, MARCA.branco, comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'OS LINKS ESTÃO NA BIO')}\n${t(900, 44, MARCA.amarelo, 'SALVA PRA NÃO PERDER')}`);
  return [capa, ...d.itens.map((it) => montarSvgDoFeed(it.oferta, it.imagem, undefined, comentaQuero)), fim].slice(0, n + 2);
}

/** Legenda do carrossel de achados: o pedido do número logo no começo, os nomes numerados, salvar e compartilhar, o aviso de publi. */
export function legendaDosAchados(d: DadosDosAchados, config: Config, comentaQuero = false): string {
  const n = d.itens.length;
  const nomes = d.itens.map((it, i) => (d.nomes?.[i] || tituloCompleto(it.oferta.titulo, 70)));
  return [
    `📌 ${d.titulo} #publi`,
    comentaQuero ? `💬 Comenta o número (1 a ${n}) que eu te mando o link no direct` : `💬 Qual você levaria? Comenta o número 👇`,
    '',
    ...nomes.map((nome, i) => `${i + 1}. ${nome}`),
    '',
    '💾 Salva pra não perder e manda pra quem vai gostar',
    comentaQuero ? '💰 O preço de agora vai junto com o link, no seu direct.' : '💰 O preço de agora está no link da bio.',
    '',
    'Publi: links de afiliado. Preços e estoque podem mudar a qualquer momento.',
    '',
    hashtagsDaCategoria(d.categoria).join(' '),
  ].join('\n');
}

/** Legenda do carrossel, pelo formato. */
export function legendaDoCarrossel(d: DadosDoCarrossel, config: Config, comentaQuero = false): string {
  if (d.formato === 'achados') return legendaDosAchados(d, config, comentaQuero);
  if (d.formato === 'duelo') return legendaDoDuelo(d, config);
  return d.formato === 'grupo' ? legendaDoGrupo(d) : legendaDaDica(d, config);
}

/** Transforma o SVG em PNG. Devolve undefined se o conversor (@resvg/resvg-js) não estiver instalado. */
export async function renderizarPng(svg: string, largura: number): Promise<Buffer | undefined> {
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const r = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Liberation Sans' }, fitTo: { mode: 'width', value: largura } });
    return Buffer.from(r.render().asPng());
  } catch {
    return undefined;
  }
}

export type TipoDeArte = 'story' | 'feed';

/** Nome do arquivo PNG de uma arte, estável entre rodadas (o Instagram precisa de um endereço público). */
export function arquivoDaArte(chave: string, tipo: TipoDeArte): string {
  return `${chave.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${tipo}.png`;
}

/**
 * Grava em blog/social/ os PNGs (Story e feed) das ofertas recentes. Como o site é refeito inteiro a cada rodada,
 * isso roda toda vez. Devolve quantos PNGs saíram e se o conversor está faltando.
 */
export async function gravarPngs(banco: Banco, config: Config, agora: Date): Promise<{ gravados: number; semConversor: boolean }> {
  if (!config.social.ativo || !config.instagram.ativo) return { gravados: 0, semConversor: false };
  const pasta = join(config.blog.pasta, 'social');
  mkdirSync(pasta, { recursive: true });
  let gravados = 0;
  const comentaQuero = comentaQueroAtivo(banco, config, agora);
  for (const l of banco.socialRecentes(HORAS_DO_SOCIAL, MAXIMO_DE_ARTES, agora)) {
    if (!l.svg) continue;
    const oferta = JSON.parse(l.dados) as OfertaAvaliada;
    const foto = await imagemParaPng(l.imagem);
    const story = await renderizarPng(montarSvgDoStory(oferta, foto, config), 1080);
    if (!story) return { gravados, semConversor: true };
    const feed = await renderizarPng(montarSvgDoFeed(oferta, foto, config, comentaQuero), 1080);
    writeFileSync(join(pasta, arquivoDaArte(l.chave, 'story')), story);
    gravados++;
    if (feed) {
      writeFileSync(join(pasta, arquivoDaArte(l.chave, 'feed')), feed);
      gravados++;
    }
  }
  return { gravados, semConversor: false };
}

const LIMITE_DA_IMAGEM = 400_000;

/**
 * O conversor de PNG (resvg) não lê WebP, o formato das fotos do Mercado Livre: a foto sumia da arte do Instagram.
 * Aqui o WebP vira JPEG com o "sharp". Se o sharp não estiver instalado, devolve undefined (a arte sai sem foto, como antes).
 */
export async function imagemParaPng(dataUri: string | undefined): Promise<string | undefined> {
  if (!dataUri || !dataUri.startsWith('data:image/webp')) return dataUri;
  try {
    const sharp = (await import('sharp')).default;
    const entrada = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
    const saida = await sharp(entrada).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${saida.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Baixa a foto do produto e devolve como data URI; se algo der errado, devolve undefined (a arte sai sem foto). */
export async function baixarImagemComoDataUri(url: string | undefined, fetchFn: Fetch = fetch): Promise<string | undefined> {
  if (!url || !/^https:\/\//.test(url)) return undefined;
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return undefined;
    const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!/^image\/(png|jpe?g|webp)$/.test(tipo)) return undefined;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length || bytes.length > LIMITE_DA_IMAGEM) return undefined;
    return await imagemParaPng(`data:${tipo};base64,${bytes.toString('base64')}`);
  } catch {
    return undefined;
  }
}

/**
 * Reduz a foto (data URI) para guardar no banco e desenhar a arte: no máximo `lado` px, JPEG. As fotos originais chegam a 500 KB e o banco
 * (um arquivo só no ramo "dados") não pode passar de 100 MB. Sem o sharp, devolve a foto como veio.
 */
export async function reduzirFoto(dataUri: string | undefined, lado = 800, qualidade = 82): Promise<string | undefined> {
  if (!dataUri) return undefined;
  try {
    const sharp = (await import('sharp')).default;
    const entrada = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
    const saida = await sharp(entrada).flatten({ background: '#ffffff' }).resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: qualidade }).toBuffer();
    const reduzida = `data:image/jpeg;base64,${saida.toString('base64')}`;
    return reduzida.length < dataUri.length ? reduzida : dataUri;
  } catch {
    return dataUri;
  }
}

export const HORAS_DO_SOCIAL = 12;
const MAXIMO_DE_ARTES = 10;

/** Cria a arte das ofertas postadas que ainda não têm. Cada arte é feita uma vez só. */
export async function prepararSocial(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<number> {
  if (!config.social.ativo) return 0;
  let feitas = 0;
  for (const linha of banco.socialSemArte(MAXIMO_DE_ARTES, HORAS_DO_SOCIAL, agora)) {
    const oferta = JSON.parse(linha.dados) as OfertaAvaliada;
    // O banco guarda a foto reduzida uma vez só (o desenho com a foto é refeito quando precisa): antes guardava a foto duas vezes, em tamanho original.
    const imagem = await reduzirFoto(await baixarImagemComoDataUri(oferta.imagem, fetchFn));
    banco.salvarArteSocial(linha.chave, montarSvgDoStory(oferta, undefined, config), imagem);
    feitas++;
  }
  return feitas;
}

/** Conteúdo pronto (legenda, roteiro, arte) das últimas ofertas postadas, para o painel. */
export function conteudoSocialRecente(banco: Banco, config: Config, agora: Date): ConteudoSocial[] {
  if (!config.social.ativo) return [];
  return banco.socialRecentes(HORAS_DO_SOCIAL, MAXIMO_DE_ARTES, agora).map((l) => {
    const o = JSON.parse(l.dados) as OfertaAvaliada;
    return { id: l.chave, criadoEm: l.criadoEm, titulo: o.titulo, legenda: montarLegenda(o, config), roteiro: montarRoteiro(o, config), svg: montarSvgDoStory(o, l.imagem, config) };
  });
}
