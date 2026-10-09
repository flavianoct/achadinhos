import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { CATEGORIAS, definirPalavrasDosNichos } from './categoria.ts';

export interface Config {
  telegram: { token: string; chatId: string };
  /**
   * Roteamento por nicho: cada categoria pode ter o seu canal do Telegram (ROTAS_TELEGRAM=tech=@canaltech,moda=@canalmoda).
   * Categoria sem rota vai para o canal geral (TELEGRAM_CHAT_ID). Rota inválida é ignorada e vira aviso.
   */
  rotas: {
    porCategoria: Record<string, string>;
    tambemNoGeral: boolean;
    /** Nichos aceitos no canal geral (GERAL_NICHOS). Vazio = todos. */
    geralNichos: string[];
    /** Nichos que nunca vão para o canal geral (GERAL_SEM_NICHOS). */
    geralSem: string[];
    /** Máximo de posts por dia de cada nicho (NICHO_MAX_POR_DIA). 0 = sem limite. */
    limitePorDia: number;
    /** Limite próprio de alguns nichos (NICHO_LIMITES=moda=5,tech=10); vale mais que o geral. */
    limites: Record<string, number>;
    avisos: string[];
  };
  shopee: { ativo: boolean; appId: string; secret: string; palavras: string[]; paginas: number };
  ml: {
    ativo: boolean;
    mattWord: string;
    mattTool: string;
    /** App do DevCenter do Mercado Livre (API oficial, usada como reserva da leitura da página). */
    clientId: string;
    clientSecret: string;
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
  /** Cupons do Mercado Livre e da Amazon, cadastrados por você em cupons.json. */
  cupons: { ativo: boolean; arquivo: string; porDia: number; repetirDias: number };
  /** Convite discreto aos outros canais (WhatsApp, Telegram, Instagram): poucas vezes, sem encher o canal. */
  convite: { ativo: boolean; aCadaDias: number; hora: number };
  /** Vendas e comissão da Shopee (conversionReport), lidas de tempos em tempos para o painel. */
  vendas: { ativo: boolean; horasEntreLeituras: number; dias: number };
  /** Campanhas da própria Shopee postadas no canal geral do Telegram. 0 = desligado. */
  campanhas: { porDia: number; repetirDias: number };
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
    /** Link do perfil do Instagram mostrado no blog (vem de BLOG_INSTAGRAM, só o @ ou o endereço). */
    instagramLink: string;
    /** Canal ou grupo do WhatsApp mostrado no blog (BLOG_WHATSAPP): só endereços https do próprio WhatsApp. */
    whatsappLink: string;
    /** Arquivo com os achados da Amazon escolhidos à mão (página Amazon do blog). */
    amazonArquivo: string;
  };
  /** Mensagens de WhatsApp para o enviador do PC (ver pasta enviador/). */
  whatsapp: {
    ativo: boolean;
    /** Duas linhas no fim de cada oferta com o Telegram e o Instagram (WHATSAPP_RODAPE). */
    rodape: boolean;
    /** Canais e grupos gerais onde o enviador posta (links https do WhatsApp), de WHATSAPP_DESTINOS. Seguem o filtro do geral. */
    destinos: string[];
    /** Canais e grupos de um nicho (WHATSAPP_ROTAS=moda=https://chat.whatsapp.com/...): recebem só as ofertas desse nicho. */
    rotas: Array<{ nicho: string; link: string }>;
    avisos: string[];
  };
  /** Arte de Story, legenda e roteiro de vídeo das ofertas postadas (aparecem no painel). */
  social: { ativo: boolean };
  /** Publicação automática no Instagram (conta profissional). Token e ID ficam nos Secrets. */
  instagram: { ativo: boolean; token: string; userId: string; feedPorDia: number; storiesPorDia: number; intervaloFeedMin: number; intervaloStoryMin: number; notaMinima: number; vendasMinimas: number; palavrasBloqueadas: string[]; carrosselPorDia: number; carrosselItens: number; carrosselTetos: number[]; dicasDias: number[]; horariosFeed: number[]; horariosStories: number[]; reelsPorDia: number; horariosReels: number[]; resumoHora: number; grupoDias: number[]; tokenData: string };
  painel: { porta: number };
}

export type Env = Record<string, string | undefined>;

/** Lista de horas ("12,18,21"). Sem a variável, usa o padrão; com a variável vazia, devolve vazio (sem restrição). */
/** Canais e grupos do WhatsApp (links https, separados por vírgula). Qualquer outra coisa é ignorada; sem repetidos. */
export function destinosDoWhatsapp(valor: string): string[] {
  const ok = /^https:\/\/(whatsapp\.com\/channel\/|chat\.whatsapp\.com\/)[A-Za-z0-9_-]{8,}\/?$/i;
  // O WhatsApp acrescenta parâmetros ao copiar o link (?s=cl&p=a...): só o endereço até a interrogação importa.
  return [...new Set(valor.split(/[,\s]+/).map((v) => v.trim().replace(/[?#].*$/, '')).filter((v) => ok.test(v)))];
}

/** WHATSAPP_ROTAS: "nicho=link" separados por vírgula; um nicho pode ter vários links. Inválido vira aviso. */
export function rotasDoWhatsapp(valor: string | undefined): { rotas: Array<{ nicho: string; link: string }>; avisos: string[] } {
  const rotas: Array<{ nicho: string; link: string }> = [];
  const avisos: string[] = [];
  for (const item of lista(valor)) {
    const i = item.indexOf('=');
    const nicho = item.slice(0, Math.max(0, i)).trim().toLowerCase();
    const link = destinosDoWhatsapp(item.slice(i + 1))[0];
    if (!CATEGORIAS.includes(nicho)) avisos.push(`WHATSAPP_ROTAS: nicho "${nicho}" não existe (use: ${CATEGORIAS.join(', ')}).`);
    else if (!link) avisos.push(`WHATSAPP_ROTAS: o link de "${nicho}" precisa ser de um canal (https://whatsapp.com/channel/...) ou grupo (https://chat.whatsapp.com/...).`);
    else if (!rotas.some((r) => r.nicho === nicho && r.link === link)) rotas.push({ nicho, link });
  }
  return { rotas, avisos };
}

/** Só aceita endereço https do WhatsApp (canal, grupo ou wa.me); qualquer outra coisa vira vazio. */
function linkDoWhatsapp(valor: string): string {
  const v = valor.trim();
  return /^https:\/\/(whatsapp\.com\/channel\/|chat\.whatsapp\.com\/|wa\.me\/)[A-Za-z0-9_\-/?=&.]+$/i.test(v) ? v : '';
}

/** Aceita "@perfil", "perfil" ou o endereço completo; devolve o endereço https do perfil, ou vazio. */
function linkDoInstagram(valor: string): string {
  const v = valor.trim();
  if (!v) return '';
  if (/^https:\/\//i.test(v)) return v;
  const nome = v.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(nome) ? `https://www.instagram.com/${nome}/` : '';
}

function horas(valor: string | undefined, padrao: number[]): number[] {
  if (valor === undefined) return padrao;
  return [...new Set(lista(valor).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 23))].sort((a, b) => a - b);
}

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

/** Lê "categoria=@canal, categoria=-100123" do ajuste ROTAS_TELEGRAM. */
export function lerRotas(texto: string | undefined, tambemNoGeral: boolean, geralNichos?: string, geralSem?: string, limitePorDia = 0, limites?: string): Config['rotas'] {
  const rotas: Config['rotas'] = { porCategoria: {}, tambemNoGeral, geralNichos: [], geralSem: [], limitePorDia: Math.max(0, limitePorDia), limites: {}, avisos: [] };
  for (const item of lista(limites)) {
    const [nicho, valor] = item.split('=').map((x) => x.trim().toLowerCase());
    const n = Number(valor);
    if (!CATEGORIAS.includes(nicho ?? '')) rotas.avisos.push(`NICHO_LIMITES: nicho "${nicho}" não existe (use: ${CATEGORIAS.join(', ')}).`);
    else if (!Number.isInteger(n) || n < 0) rotas.avisos.push(`NICHO_LIMITES: "${item}" precisa ser nicho=número (0 = sem limite).`);
    else rotas.limites[nicho!] = n;
  }
  const nichos = (valor: string | undefined, chave: string): string[] =>
    lista(valor)
      .map((n) => n.toLowerCase())
      .filter((n) => {
        if (CATEGORIAS.includes(n)) return true;
        rotas.avisos.push(`${chave}: nicho "${n}" não existe (use: ${CATEGORIAS.join(', ')}).`);
        return false;
      });
  rotas.geralNichos = nichos(geralNichos, 'GERAL_NICHOS');
  rotas.geralSem = nichos(geralSem, 'GERAL_SEM_NICHOS');
  for (const item of lista(texto)) {
    const [categoria, ...resto] = item.split('=');
    const chave = (categoria ?? '').trim().toLowerCase();
    const canal = resto.join('=').trim();
    if (!CATEGORIAS.includes(chave)) rotas.avisos.push(`ROTAS_TELEGRAM: categoria "${chave}" não existe (use: ${CATEGORIAS.join(', ')}).`);
    else if (!/^(@[A-Za-z][A-Za-z0-9_]{4,}|-?\d{5,})$/.test(canal)) rotas.avisos.push(`ROTAS_TELEGRAM: canal "${canal}" de "${chave}" precisa ser @nomedocanal ou o ID numérico.`);
    else rotas.porCategoria[chave] = canal;
  }
  return rotas;
}

/** NICHO_PALAVRAS_<NICHO>=palavra,-palavra para cada nicho que tiver o ajuste. */
export function lerPalavrasDosNichos(env: Env): Record<string, string[]> {
  const porNicho: Record<string, string[]> = {};
  for (const nicho of CATEGORIAS) {
    const lido = lista(env[`NICHO_PALAVRAS_${nicho.toUpperCase()}`]);
    if (lido.length && nicho !== 'geral') porNicho[nicho] = lido;
  }
  return porNicho;
}

export function lerConfig(env: Env = process.env): Config {
  const chatId = (env.TELEGRAM_CHAT_ID ?? '').trim();
  // As palavras dos nichos valem para o classificador inteiro (filtro, painel, guias), por isso são aplicadas aqui.
  definirPalavrasDosNichos(lerPalavrasDosNichos(env));
  return {
    rotas: lerRotas(env.ROTAS_TELEGRAM, ligado(env, 'ROTAS_TAMBEM_NO_GERAL', false), env.GERAL_NICHOS, env.GERAL_SEM_NICHOS, numero(env, 'NICHO_MAX_POR_DIA', 0), env.NICHO_LIMITES),
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
      clientId: (env.ML_CLIENT_ID ?? '').trim(),
      clientSecret: (env.ML_CLIENT_SECRET ?? '').trim(),
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
    vendas: { ativo: ligado(env, 'VENDAS_ATIVO', true), horasEntreLeituras: numero(env, 'VENDAS_HORAS', 3), dias: numero(env, 'VENDAS_DIAS', 30) },
    campanhas: { porDia: numero(env, 'CAMPANHAS_POR_DIA', 0), repetirDias: numero(env, 'CAMPANHAS_REPETIR_DIAS', 7) },
    cupons: {
      ativo: ligado(env, 'CUPONS_ATIVO', true),
      arquivo: (env.CUPONS_ARQUIVO ?? '').trim() || 'cupons.json',
      porDia: numero(env, 'CUPONS_POR_DIA', 3),
      repetirDias: numero(env, 'CUPONS_REPETIR_DIAS', 3),
    },
    blog: {
      ativo: ligado(env, 'BLOG_ATIVO', false),
      nome: (env.BLOG_NOME ?? '').trim() || 'Mata Preço',
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
      instagramLink: linkDoInstagram(env.BLOG_INSTAGRAM ?? ''),
      whatsappLink: linkDoWhatsapp(env.BLOG_WHATSAPP ?? ''),
      amazonArquivo: (env.BLOG_AMAZON_ARQUIVO ?? '').trim() || 'amazon.json',
    },
    convite: { ativo: ligado(env, 'CONVITE_ATIVO', false), aCadaDias: Math.max(1, numero(env, 'CONVITE_A_CADA_DIAS', 1)), hora: Math.min(21, Math.max(0, numero(env, 'CONVITE_HORA', 12))) },
    whatsapp: { ativo: ligado(env, 'WHATSAPP_ATIVO', true), rodape: ligado(env, 'WHATSAPP_RODAPE', true), destinos: destinosDoWhatsapp(env.WHATSAPP_DESTINOS ?? ''), ...rotasDoWhatsapp(env.WHATSAPP_ROTAS) },
    social: { ativo: ligado(env, 'SOCIAL_ATIVO', true) },
    instagram: {
      ativo: ligado(env, 'INSTAGRAM_ATIVO', false),
      token: (env.INSTAGRAM_TOKEN ?? '').trim(),
      userId: (env.INSTAGRAM_USER_ID ?? '').trim(),
      feedPorDia: numero(env, 'INSTAGRAM_FEED_POR_DIA', 3),
      storiesPorDia: numero(env, 'INSTAGRAM_STORIES_POR_DIA', 6),
      intervaloFeedMin: numero(env, 'INSTAGRAM_INTERVALO_FEED_MIN', 180),
      intervaloStoryMin: numero(env, 'INSTAGRAM_INTERVALO_STORY_MIN', 60),
      // O Instagram só recebe produtos que passam confiança: bem avaliados, muito vendidos e sem cara de genérico.
      notaMinima: numero(env, 'INSTAGRAM_NOTA_MINIMA', 4.6),
      vendasMinimas: numero(env, 'INSTAGRAM_VENDAS_MINIMAS', 300),
      // Carrossel do dia (só a dica "Antes de comprar", sem preço): no máximo um por dia (conta como post de feed).
      carrosselPorDia: numero(env, 'INSTAGRAM_CARROSSEL_POR_DIA', 1),
      carrosselItens: Math.min(9, Math.max(3, numero(env, 'INSTAGRAM_CARROSSEL_ITENS', 5))),
      carrosselTetos: lista(env.INSTAGRAM_CARROSSEL_TETOS === undefined ? '50,100,200' : env.INSTAGRAM_CARROSSEL_TETOS).map(Number).filter((n) => Number.isFinite(n) && n > 0),
      // Dias da semana (0 = domingo ... 6 = sábado) em que o carrossel da dica sai; nos outros dias não há carrossel.
      dicasDias: lista(env.INSTAGRAM_DICAS_DIAS === undefined ? '2,4,6' : env.INSTAGRAM_DICAS_DIAS).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      // Horas (0 a 23, de Brasília) em que o robô pode publicar. Fora delas ele espera, para os posts caírem nos horários em que
      // mais gente está online em vez de saírem todos na primeira rodada do dia. Vazio = qualquer hora do horário de postagem.
      horariosFeed: horas(env.INSTAGRAM_HORARIOS_FEED, [12, 18, 21]),
      horariosStories: horas(env.INSTAGRAM_HORARIOS_STORIES, [8, 10, 12, 15, 18, 20, 21]),
      reelsPorDia: numero(env, 'INSTAGRAM_REELS_POR_DIA', 1),
      horariosReels: horas(env.INSTAGRAM_HORARIOS_REELS, [19, 20]),
      // Story "Hoje no grupo" (o resumo do que o grupo entregou no dia), uma vez por dia a partir desta hora. 0 desliga.
      resumoHora: numero(env, 'INSTAGRAM_RESUMO_HORA', 21),
      // Dias da semana do carrossel "Por que entrar no grupo" (no máximo um por semana). Vazio = nunca. Padrão: segunda.
      grupoDias: lista(env.INSTAGRAM_GRUPO_DIAS === undefined ? '1' : env.INSTAGRAM_GRUPO_DIAS).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      palavrasBloqueadas: env.INSTAGRAM_PALAVRAS_BLOQUEADAS === undefined ? ['generico', 'paralelo', 'similar', 'replica', 'imitacao', 'sem marca', 'inspirado', 'primeira linha'] : lista(env.INSTAGRAM_PALAVRAS_BLOQUEADAS),
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
