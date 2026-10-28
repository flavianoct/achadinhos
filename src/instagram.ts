import { contemPalavra, normalizar } from './categoria.ts';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { diaDe, horaDe } from './db.ts';
import { CHAVE_DIRECT_BLOQUEADO, HORAS_DO_SOCIAL, comentaQueroAtivo, marcaDoToken, arquivoDaArte, arquivosDoCarrossel, legendaDoCarrossel, montarLegenda, totalDeImagens, type DadosDoCarrossel, type Fetch } from './social.ts';
import { Telegram } from './telegram.ts';
import { legendaDoQuiz, legendaParaTikTokEShorts, type DadosDoQuiz } from './quiz.ts';
import { arquivoDoReel, legendaDoDestaque, legendaDoReel, type DadosDoDestaque, type DadosDoReel } from './reel.ts';
import { linhaDeChegada, linhaDeOntem, numerosDoGrupo } from './grupo.ts';
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

  /** Comentários de um post (só os de primeiro nível; as respostas não entram). */
  async comentarios(mediaId: string): Promise<Array<{ id: string; texto: string; usuario?: string }>> {
    const r = await this.chamar('GET', `${mediaId}/comments`, { fields: 'id,text,username', limit: '50' });
    return ((r.data ?? []) as any[]).map((c) => ({ id: String(c.id), texto: String(c.text ?? ''), usuario: c.username }));
  }

  /** Quantos comentários o Instagram diz que o post tem (inclui os que o app não pode ler), ou undefined se não informou. */
  async contagemDeComentarios(mediaId: string): Promise<number | undefined> {
    const r = await this.chamar('GET', mediaId, { fields: 'comments_count' });
    const n = Number(r?.comments_count);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Resposta privada a um comentário: a mensagem chega no direct de quem comentou (o Instagram aceita uma por comentário, em até 7 dias). */
  async mandarNoDirect(commentId: string, texto: string): Promise<void> {
    await this.chamar('POST', `${this.userId}/messages`, { recipient: JSON.stringify({ comment_id: commentId }), message: JSON.stringify({ text: texto }) });
  }

  /** Resposta pública ao comentário ("te mandei no direct"), que mostra para quem passa que funciona. */
  async responderComentario(commentId: string, texto: string): Promise<void> {
    await this.chamar('POST', `${commentId}/replies`, { message: texto });
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
  const comentaQuero = comentaQueroAtivo(banco, config, agora);
  const ontem = linhaDeOntem(numerosDoGrupo(banco, agora));
  const todos = banco
    .socialRecentes(HORAS_DO_SOCIAL, 50, agora)
    .map((l) => ({ ...l, oferta: JSON.parse(l.dados) as OfertaAvaliada }));
  // As lojas se alternam no Instagram: depois de publicar de uma, a próxima vem da outra (a de maior pontuação não ocupa tudo).
  const ultimaLoja = banco.ultimaLojaNoInstagram();
  // Perfil de achadinhos vive de confiança: só vai para o Instagram produto bem avaliado, muito vendido e com cara de marca.
  // Sem a foto do produto, a arte não vai para o Instagram (sairia um cartão vazio): a foto é tentada de novo nas próximas rodadas.
  const candidatos = todos.filter((c) => c.imagem && !ig.soNosReels.includes(c.oferta.categoria) && passaNoFiltroDoInstagram(c.oferta, ig)).sort((a, b) => (a.oferta.loja === ultimaLoja ? 1 : 0) - (b.oferta.loja === ultimaLoja ? 1 : 0) || b.oferta.pontos - a.oferta.pontos);

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
          const id = await api.publicarCarrossel(urls, legendaDoCarrossel(dados, config, comentaQuero, ontem));
          banco.marcarCarrosselPublicado(carrossel.chave, agora);
          if (id) {
            // Carrossel de achados: o "comenta 3" leva ao produto 3. Os outros formatos levam à página da bio.
            const produtos = dados.formato === 'achados' ? dados.itens.map((it, i) => ({ titulo: dados.nomes?.[i] || it.oferta.titulo, link: it.oferta.link })) : undefined;
            banco.registrarMidiaDoInstagram(id, 'carrossel', dados.titulo, produtos ? JSON.stringify(produtos) : paginaDaBio(config), agora);
          }
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
          const dadosDoReel = JSON.parse(reel.dados) as DadosDoReel | DadosDoQuiz | DadosDoDestaque;
          const legenda = dadosDoReel.formato === 'quiz' ? legendaDoQuiz(dadosDoReel, config) : dadosDoReel.formato === 'destaque' ? legendaDoDestaque(dadosDoReel, config, comentaQuero, ontem) : legendaDoReel(dadosDoReel, config, comentaQuero, ontem);
          const id = await api.publicarReel(video, legenda);
          banco.marcarReelPublicado(reel.chave, agora);
          if (id) {
            // Reel de produtos: guarda o nome e o link de cada um, na ordem (o "comenta 2" leva ao produto 2). O quiz leva à página da bio.
            const produtos = dadosDoReel.formato === 'reel' ? dadosDoReel.itens.map((it) => ({ titulo: it.oferta.titulo, link: it.oferta.link })) : undefined;
            // Destaque: um produto só, o "eu quero" leva direto a ele.
            const link = dadosDoReel.formato === 'destaque' ? dadosDoReel.item.oferta.link : produtos ? JSON.stringify(produtos) : paginaDaBio(config);
            banco.registrarMidiaDoInstagram(id, 'reel', dadosDoReel.titulo, link, agora);
          }
          resumo.reels++;
          await pausa(2000);
          if (dadosDoReel.formato === 'quiz' && config.quiz.enviarPara && config.telegram.token) {
            // O quiz também vai para o TikTok e os Shorts: o robô manda o vídeo pronto, com a legenda, para o chat privado do dono.
            try {
              await new Telegram(config.telegram.token, config.quiz.enviarPara, fetchFn).enviarVideo(video, legendaParaTikTokEShorts(dadosDoReel));
            } catch (e) {
              resumo.avisos.push(`Quiz: não consegui mandar o vídeo para o seu Telegram privado: ${(e as Error).message}`);
            }
          }
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
        const id = await etapa('post do feed', () => api.publicarFoto(url(c.chave, 'feed'), montarLegenda(c.oferta, config, comentaQuero, { chegada: linhaDeChegada(banco, c.oferta, agora), ontem })));
        banco.marcarInstagram(c.chave, 'feed', agora);
        if (id) banco.registrarMidiaDoInstagram(id, 'feed', c.oferta.titulo, c.oferta.link, agora);
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

/** Página com todas as ofertas do dia (link da bio): é o link do direct para carrossel e Reel, que mostram vários produtos. */
function paginaDaBio(config: Config): string {
  return `${config.blog.url.replace(/\/+$/, '')}/bio.html`;
}

/** Código do Instagram para "fora da janela permitida" ou "pessoa indisponível": vale só para aquele comentário, não para a conta. */
const ERROS_DO_COMENTARIO = /2534022|2018278|551\b|2018001/;

export interface ResumoDosComentarios {
  lidos: number;
  respondidos: number;
  avisos: string[];
}

/** Mensagem do direct: o link do produto (que leva ao preço de agora), o aviso de afiliado e o convite para o grupo. */
export function mensagemDoDirect(titulo: string, link: string, config: Config): string {
  const curto = titulo.length > 80 ? `${titulo.slice(0, 80).replace(/\s+\S*$/, '')}…` : titulo;
  const linhas = ['Oi! Aqui está o link que você pediu 👇', '', `🛒 ${curto}`, `👉 ${link}`, '', 'O preço pode mudar a qualquer momento. Link de afiliado: comprando por ele você ajuda o perfil sem pagar nada a mais.'];
  if (config.blog.whatsappLink) linhas.push('', `📲 Quer receber achados assim todo dia? Entra no grupo: ${config.blog.whatsappLink}`);
  return linhas.join('\n');
}

/** Produtos de um Reel guardados como lista ([{titulo, link}]), ou undefined se o post leva a um link só. */
function produtosDoPost(link: string): Array<{ titulo: string; link: string }> | undefined {
  if (!link.startsWith('[')) return undefined;
  try {
    const lista = JSON.parse(link) as Array<{ titulo: string; link: string }>;
    return Array.isArray(lista) && lista.length ? lista : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A mensagem do direct para um comentário, ou undefined se o comentário não pediu nada. No Reel de produtos, o número comentado ("2",
 * "quero o 3") leva ao link daquele produto; "quero" sem número leva aos links de todos. Nos outros posts, uma das palavras leva ao link do post.
 */
export function mensagemParaOComentario(texto: string, midia: { titulo: string; link: string }, palavras: string[], config: Config): string | undefined {
  const produtos = produtosDoPost(midia.link);
  const pediu = palavras.some((p) => contemPalavra(texto, p));
  if (!produtos) return pediu ? mensagemDoDirect(midia.titulo, midia.link, config) : undefined;
  const numeros = [...new Set([...texto.matchAll(/(?:^|[^0-9])([1-9])(?![0-9])/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= produtos.length))];
  const escolhidos = numeros.length ? numeros.map((n) => produtos[n - 1]!) : pediu ? produtos : [];
  if (!escolhidos.length) return undefined;
  if (escolhidos.length === 1) return mensagemDoDirect(escolhidos[0]!.titulo, escolhidos[0]!.link, config);
  const curto = (t: string) => (t.length > 60 ? `${t.slice(0, 60).replace(/\s+\S*$/, '')}…` : t);
  const linhas = ['Oi! Aqui estão os links que você pediu 👇', ''];
  for (const p of escolhidos) linhas.push(`${produtos.indexOf(p) + 1}. ${curto(p.titulo)}`, `👉 ${p.link}`, '');
  linhas.push('O preço pode mudar a qualquer momento. Links de afiliado: comprando por eles você ajuda o perfil sem pagar nada a mais.');
  if (config.blog.whatsappLink) linhas.push('', `📲 Quer receber achados assim todo dia? Entra no grupo: ${config.blog.whatsappLink}`);
  return linhas.join('\n');
}

const RESPOSTAS_PUBLICAS = ['Te mandei no direct! 📩', 'Mandei o link no seu direct 📩', 'Enviado! Olha o seu direct 📩', 'Prontinho, link no direct 📩'];

/**
 * "Comenta QUERO": lê os comentários dos posts dos últimos 7 dias e, a quem comentou uma das palavras, manda o link no direct e responde
 * o comentário ("te mandei no direct"). Cada comentário é tratado uma vez só. Se o token não tiver as permissões de comentários e mensagens
 * (ou o app não puder mandar direct ao público), desliga o "comenta QUERO" até o token mudar e avisa como resolver.
 */
export async function responderComentarios(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch, cliente?: Instagram): Promise<ResumoDosComentarios> {
  const resumo: ResumoDosComentarios = { lidos: 0, respondidos: 0, avisos: [] };
  const ig = config.instagram;
  if (!ig.ativo || !ig.token || !ig.userId || !comentaQueroAtivo(banco, config, agora)) return resumo;
  const api = cliente ?? new Instagram(ig.token, ig.userId, fetchFn);
  const palavras = ig.palavrasDoComentario.map(normalizar);
  let falhas = 0;
  let escondidos = 0;
  const bloquear = (motivo: string, como: string) => {
    banco.salvarTexto(CHAVE_DIRECT_BLOQUEADO, `${marcaDoToken(ig.token)}|${motivo}`, agora);
    resumo.avisos.push(`O "comenta QUERO" foi desligado (as artes e legendas voltam para o link da bio): ${motivo}. ${como}`);
  };
  try {
    for (const midia of banco.midiasRecentesDoInstagram(7, agora)) {
      if (resumo.respondidos >= ig.respostasPorRodada) break;
      const comentarios = await api.comentarios(midia.mediaId);
      // O Instagram diz quantos comentários o post tem; se diz que há e o app não recebe nenhum, o app está em modo de desenvolvimento
      // (nesse modo só chegam os comentários de quem tem função no app) ou falta a permissão.
      const total = await api.contagemDeComentarios?.(midia.mediaId).catch(() => undefined);
      if (total && total > comentarios.length) escondidos += total - comentarios.length;
      for (const c of comentarios) {
        if (resumo.respondidos >= ig.respostasPorRodada) break;
        resumo.lidos++;
        if (banco.comentarioRespondido(c.id)) continue;
        const texto = normalizar(c.texto);
        const mensagem = mensagemParaOComentario(texto, midia, palavras, config);
        if (!mensagem) continue;
        try {
          await api.mandarNoDirect(c.id, mensagem);
        } catch (e) {
          if (e instanceof ErroInstagram && e.fatal && !ERROS_DO_COMENTARIO.test(e.message)) throw e;
          // Só aquele comentário não deu (passou de 7 dias, a pessoa bloqueou mensagens): marca para não insistir.
          banco.marcarComentario(c.id, false, agora);
          // Várias falhas seguidas sem nenhum direct entregue: não é a pessoa, é o app (sem a aprovação da Meta para mandar mensagens).
          if (++falhas >= 3 && resumo.respondidos === 0 && banco.respostasNoDirect(7, agora) === 0) {
            bloquear(`o Instagram recusou o direct em ${falhas} comentários seguidos (${(e as Error).message})`, 'O app precisa do acesso avançado à permissão instagram_business_manage_messages (revisão do app na Meta). Depois, gere um token novo e atualize o Secret INSTAGRAM_TOKEN: o robô volta a tentar sozinho.');
            return resumo;
          }
          continue;
        }
        banco.marcarComentario(c.id, true, agora);
        resumo.respondidos++;
        try {
          await api.responderComentario(c.id, RESPOSTAS_PUBLICAS[resumo.respondidos % RESPOSTAS_PUBLICAS.length]!);
        } catch {
          // A resposta pública é um extra: se falhar, o link já foi no direct.
        }
        await pausa(1500);
      }
    }
    if (escondidos > 0) resumo.avisos.push(`Instagram: os posts têm ${escondidos} comentário(s) que o app não recebeu (modo de desenvolvimento: só chegam comentários de quem tem função no app). Para o público receber o link no direct, o app precisa do acesso avançado da Meta.`);
  } catch (e) {
    const mensagem = (e as Error).message;
    if (e instanceof ErroInstagram && e.fatal) {
      bloquear(`o token do Instagram não deixa ler comentários ou mandar direct (${mensagem})`, 'Gere um token novo com as permissões instagram_business_manage_comments e instagram_business_manage_messages e atualize o Secret INSTAGRAM_TOKEN: o robô volta a tentar sozinho.');
    } else {
      resumo.avisos.push(`Instagram, comentários: ${mensagem}`);
    }
  }
  return resumo;
}
