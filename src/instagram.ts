import { contemPalavra, normalizar } from './categoria.ts';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { diaDe, horaDe } from './db.ts';
import { HORAS_DO_SOCIAL, arquivoDaArte, arquivosDoCarrossel, legendaDoCarrossel, montarLegenda, totalDeImagens, type DadosDoCarrossel, type Fetch } from './social.ts';
import { arquivoDoReel, legendaDoReel, type DadosDoReel } from './reel.ts';
import type { OfertaAvaliada } from './types.ts';
import { campanhaDeHoje, carregarCampanhas } from './datas.ts';
import { arquivoDaData, arquivoDoResumo, chaveDaDataPublicada, chaveDoResumoPublicado } from './vitrine.ts';

const BASE = 'https://graph.instagram.com/v23.0';
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ErroInstagram extends Error {
  /** Verdadeiro quando repetir na mesma rodada não adianta (token vencido, permissão). */
  fatal: boolean;
  constructor(mensagem: string, fatal: boolean) {
    super(mensagem);
    this.fatal = fatal;
  }
}

/** Cliente mínimo da API do Instagram com Instagram Login (conta profissional). */
export class Instagram {
  private token: string;
  private userId: string;
  private fetchFn: Fetch;
  private esperaMs: number;

  constructor(token: string, userId: string, fetchFn: Fetch = fetch, esperaMs = 3000) {
    this.token = token;
    this.userId = userId;
    this.fetchFn = fetchFn;
    this.esperaMs = esperaMs;
  }

  private async chamar(metodo: 'GET' | 'POST', caminho: string, params: Record<string, string> = {}): Promise<any> {
    const corpo = new URLSearchParams({ ...params, access_token: this.token });
    let r: Response;
    try {
      r = await this.fetchFn(metodo === 'GET' ? `${BASE}/${caminho}?${corpo}` : `${BASE}/${caminho}`, {
        method: metodo,
        headers: metodo === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
        body: metodo === 'POST' ? corpo : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new ErroInstagram(`Sem conexão com o Instagram: ${(e as Error).message}`, false);
    }
    const dados = (await r.json().catch(() => ({}))) as any;
    if (r.ok && !dados.error) return dados;
    const erro = dados.error ?? {};
    // 190 = token inválido ou vencido; 10 e 200 = falta de permissão.
    const fatal = erro.code === 190 || erro.code === 10 || erro.code === 200 || r.status === 401 || r.status === 403;
    const codigo = `${r.status}${erro.code ? `/${erro.code}` : ''}${erro.error_subcode ? `/${erro.error_subcode}` : ''}`;
    const detalhe = erro.error_user_msg && erro.error_user_msg !== erro.message ? ` (${erro.error_user_msg})` : '';
    throw new ErroInstagram(`Instagram recusou (${codigo}): ${erro.message ?? 'erro desconhecido'}${detalhe}`, fatal);
  }

  /** Confere o token e o ID da conta, sem postar nada. */
  async checar(): Promise<string> {
    const eu = await this.chamar('GET', this.userId, { fields: 'username' });
    return `conta @${eu.username ?? this.userId}`;
  }

  /** Cria o contêiner de mídia e espera o Instagram terminar de processar a imagem. Devolve o id do contêiner. */
  private async criarContainer(params: Record<string, string>, verificacoes = 10): Promise<string> {
    const container = await this.chamar('POST', `${this.userId}/media`, params);
    // A imagem leva alguns segundos para ser processada (um vídeo leva bem mais); espera pelas verificações.
    let pronto = false;
    for (let i = 0; i < verificacoes; i++) {
      const st = await this.chamar('GET', container.id, { fields: 'status_code' });
      if (st.status_code === 'FINISHED') {
        pronto = true;
        break;
      }
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new ErroInstagram(`O Instagram não processou a mídia (${st.status_code}).`, false);
      await pausa(this.esperaMs);
    }
    if (!pronto && verificacoes > 10) throw new ErroInstagram('O Instagram demorou demais para processar o vídeo.', false);
    return container.id as string;
  }

  private async publicar(params: Record<string, string>, verificacoes = 10): Promise<string> {
    const container = await this.criarContainer(params, verificacoes);
    // Às vezes o Instagram ainda não liberou o contêiner e recusa a publicação ("The requested resource does not exist"):
    // espera um pouco e tenta de novo com o mesmo contêiner (3 tentativas). Token vencido ou falta de permissão não se repete.
    for (let tentativa = 1; ; tentativa++) {
      try {
        const feito = await this.chamar('POST', `${this.userId}/media_publish`, { creation_id: container });
        return feito.id as string;
      } catch (e) {
        if (tentativa >= 3 || !(e instanceof ErroInstagram) || e.fatal) throw e;
        await pausa(this.esperaMs * 2);
      }
    }
  }

  publicarFoto(urlDaImagem: string, legenda: string): Promise<string> {
    return this.publicar({ image_url: urlDaImagem, caption: legenda });
  }

  /** Carrossel de 2 a 10 imagens: cada imagem vira um contêiner "filho" e o contêiner do carrossel leva a legenda. */
  async publicarCarrossel(urls: string[], legenda: string): Promise<string> {
    if (urls.length < 2 || urls.length > 10) throw new ErroInstagram('Um carrossel precisa de 2 a 10 imagens.', false);
    const filhos: string[] = [];
    for (const url of urls) filhos.push(await this.criarContainer({ image_url: url, is_carousel_item: 'true' }));
    return this.publicar({ media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda });
  }

  /** Reel (vídeo vertical em mp4 já no ar no site). O Instagram leva de alguns segundos a poucos minutos para processar o vídeo. */
  publicarReel(urlDoVideo: string, legenda: string): Promise<string> {
    return this.publicar({ media_type: 'REELS', video_url: urlDoVideo, caption: legenda, share_to_feed: 'true' }, 60);
  }

  /** Story pela API não aceita legenda nem adesivos. */
  publicarStory(urlDaImagem: string): Promise<string> {
    return this.publicar({ image_url: urlDaImagem, media_type: 'STORIES' });
  }
}

export interface ResumoDoInstagram {
  feed: number;
  stories: number;
  reels: number;
  avisos: string[];
}

/** Dias desde a data no formato AAAA-MM-DD; undefined se a data for inválida. */
export function diasDesde(data: string, agora: Date): number | undefined {
  const t = Date.parse(`${data}T12:00:00Z`);
  return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / 86_400_000) : undefined;
}

/** Aviso quando o token de 60 dias está para vencer (a data de criação é informada em INSTAGRAM_TOKEN_DATA). */
export function avisoDoToken(config: Config, agora: Date): string | undefined {
  if (!config.instagram.ativo || !config.instagram.tokenData) return undefined;
  const dias = diasDesde(config.instagram.tokenData, agora);
  if (dias === undefined) return 'INSTAGRAM_TOKEN_DATA não é uma data válida (use AAAA-MM-DD).';
  if (dias >= 60) return 'O token do Instagram venceu. Gere um novo e atualize o Secret INSTAGRAM_TOKEN e a data INSTAGRAM_TOKEN_DATA.';
  if (dias >= 50) return `O token do Instagram vence em ${60 - dias} dias. Gere um novo e atualize o Secret INSTAGRAM_TOKEN e a data INSTAGRAM_TOKEN_DATA.`;
  return undefined;
}

/** Nota alta, muitas vendas e sem palavras que passam desconfiança (genérico, paralelo...). Sem nota ou sem vendas informadas, não passa. */
export function passaNoFiltroDoInstagram(o: OfertaAvaliada, ig: Config['instagram']): boolean {
  // Produto do ranking dos mais vendidos da loja já é campeão de vendas: se a loja não informou nota ou vendas, vale pelo ranking.
  if (o.nota ? o.nota < ig.notaMinima : !o.maisVendido) return false;
  if (o.vendas ? o.vendas < ig.vendasMinimas : !o.maisVendido) return false;
  const titulo = normalizar(o.titulo);
  return !ig.palavrasBloqueadas.some((p) => contemPalavra(titulo, p));
}

/** Diz no aviso qual publicação falhou (feed, Story...), mantendo se o erro é fatal. */
async function etapa<T>(nome: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw e instanceof ErroInstagram ? new ErroInstagram(`Instagram, ${nome}: ${e.message}`, e.fatal) : e;
  }
}

/** Só publica se o PNG já estiver no ar (o site é publicado no fim de cada rodada, então vale a partir da seguinte). */
async function pngNoAr(url: string, fetchFn: Fetch): Promise<boolean> {
  try {
    const r = await fetchFn(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Publica no Instagram as melhores ofertas postadas e ainda não enviadas: o feed (4:5, com legenda) e o Story (9:16).
 * Respeita horário, limite diário e escolhe a de maior pontuação primeiro.
 */
export async function publicarNoInstagram(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch, cliente?: Instagram): Promise<ResumoDoInstagram> {
  const resumo: ResumoDoInstagram = { feed: 0, stories: 0, reels: 0, avisos: [] };
  const ig = config.instagram;
  if (!ig.ativo) return resumo;
  const aviso = avisoDoToken(config, agora);
  if (aviso) resumo.avisos.push(aviso);
  if (!ig.token || !ig.userId) {
    resumo.avisos.push('Instagram ligado, mas faltam os Secrets INSTAGRAM_TOKEN e INSTAGRAM_USER_ID.');
    return resumo;
  }
  if (!config.blog.url) {
    resumo.avisos.push('O Instagram precisa do endereço público do blog (BLOG_URL) para buscar as imagens.');
    return resumo;
  }
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return resumo;

  const api = cliente ?? new Instagram(ig.token, ig.userId, fetchFn);
  const todos = banco
    .socialRecentes(HORAS_DO_SOCIAL, 50, agora)
    .map((l) => ({ ...l, oferta: JSON.parse(l.dados) as OfertaAvaliada }));
  // As lojas se alternam no Instagram: depois de publicar de uma, a próxima vem da outra (a de maior pontuação não ocupa tudo).
  const ultimaLoja = banco.ultimaLojaNoInstagram();
  // Perfil de achadinhos vive de confiança: só vai para o Instagram produto bem avaliado, muito vendido e com cara de marca.
  const candidatos = todos.filter((c) => passaNoFiltroDoInstagram(c.oferta, ig)).sort((a, b) => (a.oferta.loja === ultimaLoja ? 1 : 0) - (b.oferta.loja === ultimaLoja ? 1 : 0) || b.oferta.pontos - a.oferta.pontos);

  const url = (chave: string, tipo: 'feed' | 'story') => `${config.blog.url}/social/${arquivoDaArte(chave, tipo)}`;
  const carrossel = ig.carrosselPorDia > 0 && banco.carrosseisPublicadosNoDia(agora) < ig.carrosselPorDia ? banco.carrosselPendente(agora) : undefined;
  if (!candidatos.length && !carrossel) {
    resumo.avisos.push(
      todos.length
        ? `Instagram: ${todos.length} ofertas recentes, mas nenhuma passa no filtro de qualidade (nota ${ig.notaMinima}+, ${ig.vendasMinimas}+ vendas, sem "genérico").`
        : 'Instagram: nenhuma oferta recente com arte pronta para publicar.',
    );
  }
  let esperando = 0;
  const noAr = async (u: string) => {
    const ok = await pngNoAr(u, fetchFn);
    if (!ok) esperando++;
    return ok;
  };
  // Limite por dia, no máximo um de cada tipo por rodada e um intervalo mínimo desde a última publicação (evita rajada, que o Instagram trata como spam).
  const podePublicar = (tipo: 'feed' | 'story') => {
    // Só nas horas escolhidas (horários em que o público está online); com a lista vazia vale o horário de postagem inteiro.
    const janelas = tipo === 'feed' ? ig.horariosFeed : ig.horariosStories;
    if (janelas.length > 0 && !janelas.includes(hora)) return false;
    const [porDia, intervaloMin, feitos] = tipo === 'feed' ? [ig.feedPorDia, ig.intervaloFeedMin, resumo.feed] : [ig.storiesPorDia, ig.intervaloStoryMin, resumo.stories];
    if (feitos >= 1 || banco.instagramNoDia(tipo, agora) >= porDia) return false;
    const ultimo = banco.ultimoInstagram(tipo);
    return ultimo === undefined || agora.getTime() - ultimo >= intervaloMin * 60_000;
  };
  try {
    // O carrossel do dia ocupa a vaga do feed da rodada (conta como post de feed): é a variação de formato do perfil.
    if (carrossel && podePublicar('feed')) {
      const dados = JSON.parse(carrossel.dados) as DadosDoCarrossel;
      const urls = arquivosDoCarrossel(carrossel.chave, totalDeImagens(dados)).map((a) => `${config.blog.url}/social/${a}`);
      let todasNoAr = true;
      for (const u of urls) {
        if (!(await noAr(u))) {
          todasNoAr = false;
          break;
        }
      }
      if (todasNoAr) {
        try {
          await api.publicarCarrossel(urls, legendaDoCarrossel(dados, config));
          banco.marcarCarrosselPublicado(carrossel.chave, agora);
          resumo.feed++;
          await pausa(2000);
        } catch (e) {
          // O carrossel é um formato novo: se falhar, anota (3 tentativas no máximo) e os posts de foto seguem normalmente.
          banco.registrarFalhaDoCarrossel(carrossel.chave);
          resumo.avisos.push(`Instagram: o carrossel não saiu (tentativa ${carrossel.tentativas + 1} de 3): ${(e as Error).message}`);
          if (e instanceof ErroInstagram && e.fatal) throw e;
        }
      }
    }
    // O Reel do dia é um formato à parte (vídeo): tem o próprio limite diário e as próprias horas.
    const reel = ig.reelsPorDia > 0 && banco.reelsPublicadosNoDia(agora) < ig.reelsPorDia && (ig.horariosReels.length === 0 || ig.horariosReels.includes(hora)) ? banco.reelPendente(agora) : undefined;
    if (reel) {
      const video = `${config.blog.url}/social/${arquivoDoReel(reel.chave)}`;
      if (await noAr(video)) {
        try {
          await api.publicarReel(video, legendaDoReel(JSON.parse(reel.dados) as DadosDoReel, config));
          banco.marcarReelPublicado(reel.chave, agora);
          resumo.reels++;
          await pausa(2000);
        } catch (e) {
          banco.registrarFalhaDoReel(reel.chave);
          resumo.avisos.push(`Instagram: o Reel não saiu (tentativa ${reel.tentativas + 1} de 3): ${(e as Error).message}`);
          if (e instanceof ErroInstagram && e.fatal) throw e;
        }
      }
    }
    // Story da data grande de hoje (10.10, Black Friday...): uma vez por data e dia, a partir de INSTAGRAM_DATA_HORA, antes dos Stories de produto.
    const dataDeHoje = config.datas.ativo && ig.dataHora > 0 && hora >= ig.dataHora ? campanhaDeHoje(carregarCampanhas(config, agora), diaDe(agora)) : undefined;
    if (dataDeHoje && !banco.textoSalvo(chaveDaDataPublicada(dataDeHoje, agora), 1, agora)) {
      const arteDaData = `${config.blog.url}/social/${arquivoDaData(dataDeHoje, agora)}`;
      if (await noAr(arteDaData)) {
        await etapa(`Story da data ${dataDeHoje.nome}`, () => api.publicarStory(arteDaData));
        banco.salvarTexto(chaveDaDataPublicada(dataDeHoje, agora), arteDaData, agora);
        resumo.stories++;
        await pausa(2000);
      }
    }
    // Story "Hoje no grupo": uma vez por dia, a partir da hora do resumo. É o post que vende o grupo, por isso vem antes
    // dos Stories de produto (e ocupa a vaga de Story da rodada, para não sair dois Stories juntos).
    if (ig.resumoHora > 0 && hora >= ig.resumoHora && !banco.textoSalvo(chaveDoResumoPublicado(agora), 1, agora)) {
      const arte = `${config.blog.url}/social/${arquivoDoResumo(agora)}`;
      if (await noAr(arte)) {
        await etapa('Story "Hoje no grupo"', () => api.publicarStory(arte));
        banco.salvarTexto(chaveDoResumoPublicado(agora), arte, agora);
        resumo.stories++;
        await pausa(2000);
      }
    }
    for (const c of candidatos) {
      if (!c.igFeedEm && podePublicar('feed') && (await noAr(url(c.chave, 'feed')))) {
        await etapa('post do feed', () => api.publicarFoto(url(c.chave, 'feed'), montarLegenda(c.oferta, config)));
        banco.marcarInstagram(c.chave, 'feed', agora);
        resumo.feed++;
        await pausa(2000);
      }
      if (!c.igStoryEm && podePublicar('story') && (await noAr(url(c.chave, 'story')))) {
        await etapa('Story', () => api.publicarStory(url(c.chave, 'story')));
        banco.marcarInstagram(c.chave, 'story', agora);
        resumo.stories++;
        await pausa(2000);
      }
      if (resumo.feed >= 1 && resumo.stories >= 1) break;
    }
  } catch (e) {
    resumo.avisos.push((e as Error).message);
  }
  if (esperando && !resumo.feed && !resumo.stories) resumo.avisos.push(`Instagram: ${esperando} imagens ainda não estão no ar; saem na próxima rodada.`);
  return resumo;
}
