import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import { horaDe } from './db.ts';
import { HORAS_DO_SOCIAL, arquivoDaArte, montarLegenda, type Fetch } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

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
    throw new ErroInstagram(`Instagram recusou (${r.status}${erro.code ? `/${erro.code}` : ''}): ${erro.message ?? 'erro desconhecido'}`, fatal);
  }

  /** Confere o token e o ID da conta, sem postar nada. */
  async checar(): Promise<string> {
    const eu = await this.chamar('GET', this.userId, { fields: 'username' });
    return `conta @${eu.username ?? this.userId}`;
  }

  private async publicar(params: Record<string, string>): Promise<string> {
    const container = await this.chamar('POST', `${this.userId}/media`, params);
    // A imagem leva alguns segundos para ser processada; espera até 10 verificações.
    for (let i = 0; i < 10; i++) {
      const st = await this.chamar('GET', container.id, { fields: 'status_code' });
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new ErroInstagram(`O Instagram não processou a imagem (${st.status_code}).`, false);
      await pausa(this.esperaMs);
    }
    const feito = await this.chamar('POST', `${this.userId}/media_publish`, { creation_id: container.id });
    return feito.id as string;
  }

  publicarFoto(urlDaImagem: string, legenda: string): Promise<string> {
    return this.publicar({ image_url: urlDaImagem, caption: legenda });
  }

  /** Story pela API não aceita legenda nem adesivos. */
  publicarStory(urlDaImagem: string): Promise<string> {
    return this.publicar({ image_url: urlDaImagem, media_type: 'STORIES' });
  }
}

export interface ResumoDoInstagram {
  feed: number;
  stories: number;
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
  const resumo: ResumoDoInstagram = { feed: 0, stories: 0, avisos: [] };
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
  const candidatos = banco
    .socialRecentes(HORAS_DO_SOCIAL, 50, agora)
    .map((l) => ({ ...l, oferta: JSON.parse(l.dados) as OfertaAvaliada }))
    .sort((a, b) => b.oferta.pontos - a.oferta.pontos);

  const url = (chave: string, tipo: 'feed' | 'story') => `${config.blog.url}/social/${arquivoDaArte(chave, tipo)}`;
  if (!candidatos.length) resumo.avisos.push('Instagram: nenhuma oferta recente com arte pronta para publicar.');
  let esperando = 0;
  const noAr = async (u: string) => {
    const ok = await pngNoAr(u, fetchFn);
    if (!ok) esperando++;
    return ok;
  };
  try {
    for (const c of candidatos) {
      if (!c.igFeedEm && banco.instagramNoDia('feed', agora) < ig.feedPorDia && (await noAr(url(c.chave, 'feed')))) {
        await api.publicarFoto(url(c.chave, 'feed'), montarLegenda(c.oferta, config));
        banco.marcarInstagram(c.chave, 'feed', agora);
        resumo.feed++;
        await pausa(2000);
      }
      if (!c.igStoryEm && banco.instagramNoDia('story', agora) < ig.storiesPorDia && (await noAr(url(c.chave, 'story')))) {
        await api.publicarStory(url(c.chave, 'story'));
        banco.marcarInstagram(c.chave, 'story', agora);
        resumo.stories++;
        await pausa(2000);
      }
      // No máximo uma publicação de feed por rodada: o feed é espaçado, o Story pode sair mais.
      if (resumo.feed >= 1 && resumo.stories >= 1) break;
    }
  } catch (e) {
    resumo.avisos.push((e as Error).message);
  }
  if (esperando && !resumo.feed && !resumo.stories) resumo.avisos.push(`Instagram: ${esperando} imagens ainda não estão no ar; saem na próxima rodada.`);
  return resumo;
}
