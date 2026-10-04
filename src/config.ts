import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export interface Config {
  telegram: { token: string; chatId: string };
  shopee: { ativo: boolean; appId: string; secret: string; palavras: string[]; paginas: number };
  ml: {
    ativo: boolean;
    mattWord: string;
    mattTool: string;
    /** Quantas páginas de ofertas ler a cada rodada, no total (cerca de 48 produtos por página). */
    paginas: number;
    /** Categorias do Mercado Livre lidas em rodízio (IDs como MLB1051). Vazio = só a vitrine geral. */
    categorias: string[];
    /** Quantas das páginas da rodada vão para as categorias; o resto vai para a vitrine geral. */
    paginasDeCategoria: number;
  };
  amazon: { ativo: boolean; tag: string };
  filtro: {
    descontoMinimo: number;
    quedaMinima: number;
    precoMinimo: number;
    precoMaximo: number;
    notaMinima: number;
    vendasMinimas: number;
    palavrasBloqueadas: string[];
    diasSemRepetir: number;
  };
  ritmo: {
    minutosEntreColetas: number;
    minutosEntrePosts: number;
    horaInicio: number;
    horaFim: number;
    maxPostsPorDia: number;
    /** Modo nuvem: quantas ofertas postar no Telegram a cada execução. */
    postsPorRodada: number;
  };
  blog: {
    ativo: boolean;
    nome: string;
    /** Endereço público do blog (ex.: https://usuario.github.io/achadinhos). Vazio = ainda não publicado. */
    url: string;
    pasta: string;
    /** De quantas em quantas horas o blog é refeito. */
    horas: number;
    /** Quantos dias um post fica no ar antes de ser apagado. */
    diasNoAr: number;
    ia: 'nenhuma' | 'ollama' | 'github' | 'gemini';
    ollamaUrl: string;
    ollamaModelo: string;
    /** Token para a IA gratuita do GitHub. No GitHub Actions vem do próprio workflow. */
    githubToken: string;
    githubModelo: string;
    /** Espera entre pedidos à IA do GitHub (o plano gratuito aceita poucos por minuto). */
    githubPausaMs: number;
    /** Chave gratuita do Google Gemini (aistudio.google.com). Fica nos Secrets como GEMINI_API_KEY. */
    geminiChave: string;
    geminiModelo: string;
    /** Modelo usado quando o principal está sobrecarregado. */
    geminiReserva: string;
    publicar: 'nao' | 'git';
    /** Link do canal do Telegram mostrado no blog. */
    telegramLink: string;
  };
  /** Mensagens de WhatsApp para o enviador do PC (ver pasta enviador/). */
  whatsapp: { ativo: boolean };
  /** Arte de Story, legenda e roteiro de vídeo das ofertas postadas (aparecem no painel). */
  social: { ativo: boolean };
  /** Publicação automática no Instagram (conta profissional). Token e ID ficam nos Secrets. */
  instagram: { ativo: boolean; token: string; userId: string; feedPorDia: number; storiesPorDia: number; intervaloFeedMin: number; intervaloStoryMin: number; tokenData: string };
  painel: { porta: number };
}

export type Env = Record<string, string | undefined>;

function lista(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function numero(env: Env, chave: string, padrao: number): number {
  const bruto = env[chave];
  if (bruto === undefined || bruto.trim() === '') return padrao;
  const n = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Valor inválido em ${chave}: "${bruto}" (esperado um número)`);
  return n;
}

function ligado(env: Env, chave: string, padrao: boolean): boolean {
  const bruto = env[chave];
  if (bruto === undefined || bruto.trim() === '') return padrao;
  return ['1', 'true', 'sim', 's', 'on'].includes(bruto.trim().toLowerCase());
}

function opcao<T extends string>(env: Env, chave: string, validas: readonly T[], padrao: T): T {
  const bruto = (env[chave] ?? '').trim().toLowerCase();
  if (!bruto) return padrao;
  if (!(validas as readonly string[]).includes(bruto)) throw new Error(`Valor inválido em ${chave}: "${bruto}" (use: ${validas.join(' ou ')})`);
  return bruto as T;
}

/** Lê o arquivo .env. Devolve undefined se ele não existir. */
export function lerArquivoEnv(caminho = '.env'): Record<string, string> | undefined {
  if (!existsSync(caminho)) return undefined;
  return parseEnv(readFileSync(caminho, 'utf8')) as Record<string, string>;
}

/** Valor pronto para uma linha do .env (com aspas quando necessário). */
function valorParaEnv(valor: string): string {
  if (/[\r\n]/.test(valor)) throw new Error('O valor não pode ter quebra de linha.');
  // Valor simples vai sem aspas; com #, aspas, barra ou espaço nas pontas, vai entre aspas.
  if (valor === valor.trim() && !/[#'"`\\]/.test(valor)) return valor;
  if (!valor.includes("'")) return `'${valor}'`;
  if (!valor.includes('"')) return `"${valor}"`;
  throw new Error('O valor não pode misturar aspas simples e duplas.');
}

/**
 * Grava alterações no .env sem apagar os comentários.
 * Se o .env ainda não existe, parte do .env.example.
 */
export function salvarNoEnv(alteracoes: Record<string, string>, caminho = '.env', modelo = '.env.example'): void {
  let texto = existsSync(caminho) ? readFileSync(caminho, 'utf8') : existsSync(modelo) ? readFileSync(modelo, 'utf8') : '';
  const fimDeLinha = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);
  for (const [chave, valor] of Object.entries(alteracoes)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(chave)) throw new Error(`Nome de ajuste inválido: ${chave}`);
    const nova = `${chave}=${valorParaEnv(valor)}`;
    const i = linhas.findIndex((l) => new RegExp(`^\\s*${chave}\\s*=`).test(l));
    if (i >= 0) linhas[i] = nova;
    else {
      if (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
      linhas.push(nova, '');
    }
  }
  texto = linhas.join(fimDeLinha);
  writeFileSync(caminho, texto, 'utf8');
}

export function lerConfig(env: Env = process.env): Config {
  const chatId = (env.TELEGRAM_CHAT_ID ?? '').trim();
  return {
    telegram: {
      token: (env.TELEGRAM_BOT_TOKEN ?? '').trim(),
      chatId,
    },
    shopee: {
      ativo: ligado(env, 'SHOPEE_ATIVO', true),
      appId: (env.SHOPEE_APP_ID ?? '').trim(),
      secret: (env.SHOPEE_SECRET ?? '').trim(),
      palavras: lista(env.SHOPEE_PALAVRAS),
      paginas: numero(env, 'SHOPEE_PAGINAS', 2),
    },
    ml: {
      ativo: ligado(env, 'ML_ATIVO', false),
      mattWord: (env.ML_MATT_WORD ?? '').trim(),
      mattTool: (env.ML_MATT_TOOL ?? '').trim(),
      paginas: numero(env, 'ML_PAGINAS', 3),
      // Eletrônicos, Celulares, Informática, Eletrodomésticos, Casa, Games, Beleza e Esportes.
      categorias: env.ML_CATEGORIAS === undefined ? ['MLB1000', 'MLB1051', 'MLB1648', 'MLB5726', 'MLB1574', 'MLB1144', 'MLB1246', 'MLB1276'] : lista(env.ML_CATEGORIAS).map((c) => c.toUpperCase()),
      paginasDeCategoria: numero(env, 'ML_PAGINAS_DE_CATEGORIA', 2),
    },
    amazon: {
      ativo: ligado(env, 'AMAZON_ATIVO', false),
      tag: (env.AMAZON_TAG ?? '').trim(),
    },
    filtro: {
      descontoMinimo: numero(env, 'DESCONTO_MINIMO', 25),
      quedaMinima: numero(env, 'QUEDA_MINIMA', 10),
      precoMinimo: numero(env, 'PRECO_MINIMO', 15),
      precoMaximo: numero(env, 'PRECO_MAXIMO', 5000),
      notaMinima: numero(env, 'NOTA_MINIMA', 4.5),
      vendasMinimas: numero(env, 'VENDAS_MINIMAS', 50),
      palavrasBloqueadas: lista(env.PALAVRAS_BLOQUEADAS ?? 'réplica,replica,usado,recondicionado,erótico'),
      diasSemRepetir: numero(env, 'DIAS_SEM_REPETIR', 7),
    },
    ritmo: {
      minutosEntreColetas: numero(env, 'MINUTOS_ENTRE_COLETAS', 30),
      minutosEntrePosts: numero(env, 'MINUTOS_ENTRE_POSTS', 12),
      horaInicio: numero(env, 'HORA_INICIO', 8),
      horaFim: numero(env, 'HORA_FIM', 23),
      maxPostsPorDia: numero(env, 'MAX_POSTS_POR_DIA', 60),
      postsPorRodada: numero(env, 'POSTS_POR_RODADA', 2),
    },
    blog: {
      ativo: ligado(env, 'BLOG_ATIVO', false),
      nome: (env.BLOG_NOME ?? '').trim() || 'Achadinhos do Dia',
      url: (env.BLOG_URL ?? '').trim().replace(/\/+$/, ''),
      pasta: (env.BLOG_PASTA ?? '').trim() || 'blog',
      horas: numero(env, 'BLOG_HORAS', 6),
      diasNoAr: numero(env, 'BLOG_DIAS_NO_AR', 60),
      ia: opcao(env, 'BLOG_IA', ['nenhuma', 'ollama', 'github', 'gemini'] as const, 'nenhuma'),
      ollamaUrl: ((env.OLLAMA_URL ?? '').trim() || 'http://localhost:11434').replace(/\/+$/, ''),
      ollamaModelo: (env.OLLAMA_MODELO ?? '').trim(),
      githubToken: (env.GITHUB_TOKEN ?? '').trim(),
      githubModelo: (env.GITHUB_MODELO ?? '').trim() || 'openai/gpt-4o-mini',
      githubPausaMs: numero(env, 'GITHUB_PAUSA_MS', 4500),
      geminiChave: (env.GEMINI_API_KEY ?? '').trim(),
      geminiModelo: (env.GEMINI_MODELO ?? '').trim() || 'gemini-3.8-flash',
      geminiReserva: (env.GEMINI_RESERVA ?? '').trim() || 'gemini-3.1-flash-lite',
      publicar: opcao(env, 'BLOG_PUBLICAR', ['nao', 'git'] as const, 'nao'),
      telegramLink: (env.BLOG_TELEGRAM ?? '').trim() || (chatId.startsWith('@') ? `https://t.me/${chatId.slice(1)}` : ''),
    },
    whatsapp: { ativo: ligado(env, 'WHATSAPP_ATIVO', true) },
    social: { ativo: ligado(env, 'SOCIAL_ATIVO', true) },
    instagram: {
      ativo: ligado(env, 'INSTAGRAM_ATIVO', false),
      token: (env.INSTAGRAM_TOKEN ?? '').trim(),
      userId: (env.INSTAGRAM_USER_ID ?? '').trim(),
      feedPorDia: numero(env, 'INSTAGRAM_FEED_POR_DIA', 3),
      storiesPorDia: numero(env, 'INSTAGRAM_STORIES_POR_DIA', 6),
      intervaloFeedMin: numero(env, 'INSTAGRAM_INTERVALO_FEED_MIN', 180),
      intervaloStoryMin: numero(env, 'INSTAGRAM_INTERVALO_STORY_MIN', 60),
      tokenData: (env.INSTAGRAM_TOKEN_DATA ?? '').trim(),
    },
    painel: { porta: numero(env, 'PAINEL_PORTA', 3210) },
  };
}

/** Lista o que falta preencher para o robô postar de verdade. Vazio = tudo certo. */
export function problemasDeConfig(c: Config): string[] {
  const p: string[] = [];
  if (!c.telegram.token) p.push('TELEGRAM_BOT_TOKEN está vazio (crie o bot no @BotFather).');
  if (!c.telegram.chatId) p.push('TELEGRAM_CHAT_ID está vazio (ex.: @seucanal).');
  if (!c.shopee.ativo && !c.ml.ativo && !c.amazon.ativo) p.push('Nenhuma loja está ativa.');
  if (c.shopee.ativo && (!c.shopee.appId || !c.shopee.secret)) {
    p.push('Shopee ativa, mas SHOPEE_APP_ID ou SHOPEE_SECRET estão vazios.');
  }
  if (c.ml.ativo) {
    if (!c.ml.mattWord || !c.ml.mattTool) p.push('Mercado Livre ativo, mas ML_MATT_WORD ou ML_MATT_TOOL estão vazios (sem eles o link não leva seu código).');
  }
  if (c.amazon.ativo) p.push('A Amazon ainda não coleta ofertas sozinha (fase 2). Deixe AMAZON_ATIVO=0 por enquanto.');
  if (c.ritmo.horaInicio >= c.ritmo.horaFim) p.push('HORA_INICIO precisa ser menor que HORA_FIM.');
  return p;
}

/** Problemas que só afetam o blog (não impedem o robô de postar no Telegram). */
export function problemasDoBlog(c: Config): string[] {
  const p: string[] = [];
  if (c.blog.publicar === 'git' && !c.blog.url) p.push('BLOG_PUBLICAR=git, mas BLOG_URL está vazio (o endereço público do blog).');
  return p;
}
