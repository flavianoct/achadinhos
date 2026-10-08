import { DatabaseSync } from 'node:sqlite';
import type { Loja, Oferta, OfertaAvaliada } from './types.ts';

const FUSO = 'America/Sao_Paulo';
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });

/** Dia no formato AAAA-MM-DD, no horário de Brasília. */
export function diaDe(data: Date): string {
  return fmtDia.format(data);
}

/** Hora (0 a 23) no horário de Brasília. */
export function horaDe(data: Date): number {
  return Number(fmtHora.format(data));
}

function diasAtras(data: Date, dias: number): string {
  return diaDe(new Date(data.getTime() - dias * 86_400_000));
}

/** Um post do blog como fica guardado. `dados` é JSON com os produtos e os textos do post. */
export interface PostSalvo {
  arquivo: string;
  dia: string;
  tema: string;
  titulo: string;
  dados: string;
  atualizadoEm: number;
}

export class Banco {
  private db: DatabaseSync;

  constructor(caminho = 'dados.db') {
    this.db = new DatabaseSync(caminho);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS precos (
        loja TEXT NOT NULL,
        id_produto TEXT NOT NULL,
        dia TEXT NOT NULL,
        preco REAL NOT NULL,
        PRIMARY KEY (loja, id_produto, dia)
      );
      CREATE TABLE IF NOT EXISTS postados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loja TEXT NOT NULL,
        id_produto TEXT NOT NULL,
        titulo TEXT NOT NULL,
        categoria TEXT NOT NULL,
        preco REAL NOT NULL,
        dia TEXT NOT NULL,
        postado_em INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS postados_produto ON postados (loja, id_produto, postado_em);
      CREATE INDEX IF NOT EXISTS postados_dia ON postados (dia);
      CREATE TABLE IF NOT EXISTS fila (
        loja TEXT NOT NULL,
        id_produto TEXT NOT NULL,
        dados TEXT NOT NULL,
        pontos REAL NOT NULL,
        criado_em INTEGER NOT NULL,
        PRIMARY KEY (loja, id_produto)
      );
      CREATE TABLE IF NOT EXISTS produtos (
        loja TEXT NOT NULL,
        id_produto TEXT NOT NULL,
        dados TEXT NOT NULL,
        pontos REAL NOT NULL,
        categoria TEXT NOT NULL,
        visto_em INTEGER NOT NULL,
        PRIMARY KEY (loja, id_produto)
      );
      CREATE INDEX IF NOT EXISTS produtos_visto ON produtos (visto_em, pontos);
      CREATE TABLE IF NOT EXISTS posts (
        arquivo TEXT PRIMARY KEY,
        dia TEXT NOT NULL,
        tema TEXT NOT NULL,
        titulo TEXT NOT NULL,
        dados TEXT NOT NULL,
        atualizado_em INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS posts_dia ON posts (dia);
      CREATE TABLE IF NOT EXISTS guia_produtos (
        tipo TEXT NOT NULL,
        loja TEXT NOT NULL,
        id_produto TEXT NOT NULL,
        dados TEXT NOT NULL,
        visto_em INTEGER NOT NULL,
        PRIMARY KEY (tipo, loja, id_produto)
      );
      CREATE INDEX IF NOT EXISTS guia_produtos_visto ON guia_produtos (tipo, visto_em);
      CREATE TABLE IF NOT EXISTS guias (
        arquivo TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        titulo TEXT NOT NULL,
        dados TEXT NOT NULL,
        atualizado_em INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS whatsapp_saida (
        chave TEXT PRIMARY KEY,
        loja TEXT NOT NULL,
        texto TEXT NOT NULL,
        imagem TEXT,
        link TEXT NOT NULL,
        criado_em INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS social_saida (
        chave TEXT PRIMARY KEY,
        dados TEXT NOT NULL,
        svg TEXT,
        imagem TEXT,
        ig_feed_em INTEGER,
        ig_story_em INTEGER,
        criado_em INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS textos (
        chave TEXT PRIMARY KEY,
        texto TEXT NOT NULL,
        criado_em INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS instagram_carrosseis (
        chave TEXT PRIMARY KEY,
        dia TEXT NOT NULL,
        titulo TEXT NOT NULL,
        dados TEXT NOT NULL,
        criado_em INTEGER NOT NULL,
        publicado_em INTEGER,
        tentativas INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS cupons_postados (
        chave TEXT NOT NULL,
        dia TEXT NOT NULL,
        postado_em INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS instagram_reels (
        chave TEXT PRIMARY KEY,
        dia TEXT NOT NULL,
        titulo TEXT NOT NULL,
        dados TEXT NOT NULL,
        criado_em INTEGER NOT NULL,
        publicado_em INTEGER,
        tentativas INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS saude_fontes (
        fonte TEXT PRIMARY KEY,
        falhas INTEGER NOT NULL,
        ultimo_erro TEXT,
        ultimo_ok_em INTEGER
      );
    `);
    // Bancos antigos (guardados no ramo "dados") não têm a coluna do canal: acrescenta sem perder nada.
    const colunas = this.db.prepare(`PRAGMA table_info(postados)`).all() as Array<{ name: string }>;
    if (!colunas.some((c) => c.name === 'canal')) this.db.exec(`ALTER TABLE postados ADD COLUMN canal TEXT`);
    // Bancos criados antes do Instagram não têm estas colunas.
    for (const coluna of ['imagem TEXT', 'ig_feed_em INTEGER', 'ig_story_em INTEGER']) {
      try {
        this.db.exec(`ALTER TABLE social_saida ADD COLUMN ${coluna}`);
      } catch {
        // já existe
      }
    }
  }

  /** Guarda o menor preço visto no dia. É isso que forma o histórico. */
  registrarPreco(o: Oferta, agora: Date): void {
    this.db
      .prepare(
        `INSERT INTO precos (loja, id_produto, dia, preco) VALUES (?, ?, ?, ?)
         ON CONFLICT (loja, id_produto, dia) DO UPDATE SET preco = MIN(preco, excluded.preco)`,
      )
      .run(o.loja, o.idProduto, diaDe(agora), o.preco);
  }

  /**
   * Menor preço do histórico nos últimos `dias`, sem contar hoje.
   * `diasComDado` diz quantos dias diferentes temos registrados na janela.
   */
  historico(loja: Loja, idProduto: string, dias: number, agora: Date): { menor?: number; maior?: number; diasComDado: number; desde?: string } {
    const linha = this.db
      .prepare(
        `SELECT MIN(preco) AS menor, MAX(preco) AS maior, COUNT(*) AS n, MIN(dia) AS desde FROM precos
         WHERE loja = ? AND id_produto = ? AND dia >= ? AND dia < ?`,
      )
      .get(loja, idProduto, diasAtras(agora, dias), diaDe(agora)) as { menor: number | null; maior: number | null; n: number; desde: string | null };
    return { menor: linha.menor ?? undefined, maior: linha.maior ?? undefined, diasComDado: linha.n, desde: linha.desde ?? undefined };
  }

  ultimoPost(loja: Loja, idProduto: string): { preco: number; postadoEm: number } | undefined {
    const linha = this.db
      .prepare(`SELECT preco, postado_em FROM postados WHERE loja = ? AND id_produto = ? ORDER BY postado_em DESC LIMIT 1`)
      .get(loja, idProduto) as { preco: number; postado_em: number } | undefined;
    return linha ? { preco: linha.preco, postadoEm: linha.postado_em } : undefined;
  }

  /** `canal` é o destino principal do post no Telegram (o canal do nicho ou o geral). */
  registrarPost(o: OfertaAvaliada, agora: Date, canal?: string): void {
    this.db
      .prepare(`INSERT INTO postados (loja, id_produto, titulo, categoria, preco, dia, postado_em, canal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(o.loja, o.idProduto, o.titulo, o.categoria, o.preco, diaDe(agora), agora.getTime(), canal ?? null);
  }

  /** Posts por categoria nos últimos `dias` dias (1 = só hoje), do maior para o menor. */
  postsPorCategoria(dias: number, agora: Date): Array<{ categoria: string; posts: number }> {
    return this.db
      .prepare(`SELECT categoria, COUNT(*) AS posts FROM postados WHERE dia >= ? GROUP BY categoria ORDER BY posts DESC, categoria ASC`)
      .all(diasAtras(agora, dias - 1))
      .map((l) => ({ categoria: String(l.categoria), posts: Number(l.posts) }));
  }

  /** Ofertas esperando na fila, por categoria. */
  filaPorCategoria(): Array<{ categoria: string; total: number }> {
    return this.db
      .prepare(`SELECT COALESCE(json_extract(dados, '$.categoria'), 'geral') AS categoria, COUNT(*) AS total FROM fila GROUP BY categoria ORDER BY total DESC, categoria ASC`)
      .all()
      .map((l) => ({ categoria: String(l.categoria), total: Number(l.total) }));
  }

  postsNoDia(agora: Date): number {
    const linha = this.db.prepare(`SELECT COUNT(*) AS n FROM postados WHERE dia = ?`).get(diaDe(agora)) as { n: number };
    return linha.n;
  }

  /** Quando o cupom foi postado pela última vez (ms), se já foi. */
  ultimoPostDeCupom(chave: string): number | undefined {
    const linha = this.db.prepare(`SELECT MAX(postado_em) AS t FROM cupons_postados WHERE chave = ?`).get(chave) as { t: number | null };
    return linha.t ?? undefined;
  }

  registrarCupom(chave: string, agora: Date): void {
    this.db.prepare(`INSERT INTO cupons_postados (chave, dia, postado_em) VALUES (?, ?, ?)`).run(chave, diaDe(agora), agora.getTime());
  }

  cuponsNoDia(agora: Date): number {
    const linha = this.db.prepare(`SELECT COUNT(*) AS n FROM cupons_postados WHERE dia = ?`).get(diaDe(agora)) as { n: number };
    return linha.n;
  }

  /** Coloca na fila; se o produto já estiver lá, fica a versão mais nova. */
  enfileirar(o: OfertaAvaliada, agora: Date): void {
    this.db
      .prepare(
        `INSERT INTO fila (loja, id_produto, dados, pontos, criado_em) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (loja, id_produto) DO UPDATE SET dados = excluded.dados, pontos = excluded.pontos, criado_em = excluded.criado_em`,
      )
      .run(o.loja, o.idProduto, JSON.stringify(o), o.pontos, agora.getTime());
  }

  /**
   * Melhor oferta da fila (maior pontuação), sem removê-la. Com `evitar`, prefere a melhor de outra loja: assim as lojas se alternam
   * em vez de uma (a que dá mais pontos) ocupar tudo. Se só houver ofertas da loja a evitar, usa a melhor delas.
   */
  melhorDaFila(evitar?: Loja): OfertaAvaliada | undefined {
    const pegar = (sql: string, ...args: string[]) => this.db.prepare(sql).get(...args) as { dados: string } | undefined;
    const base = 'SELECT dados FROM fila';
    const ordem = 'ORDER BY pontos DESC, criado_em ASC LIMIT 1';
    const linha = (evitar ? pegar(`${base} WHERE loja <> ? ${ordem}`, evitar) : undefined) ?? pegar(`${base} ${ordem}`);
    return linha ? (JSON.parse(linha.dados) as OfertaAvaliada) : undefined;
  }

  /** Loja da última oferta publicada no Instagram (feed ou story), para alternar as lojas lá também. */
  ultimaLojaNoInstagram(): string | undefined {
    const l = this.db.prepare(`SELECT chave FROM social_saida WHERE ig_feed_em IS NOT NULL OR ig_story_em IS NOT NULL ORDER BY MAX(COALESCE(ig_feed_em, 0), COALESCE(ig_story_em, 0)) DESC LIMIT 1`).get() as { chave: string } | undefined;
    return l?.chave.split(':')[0];
  }

  /** Loja do último post feito, para a próxima oferta vir de outra loja. */
  ultimaLojaPostada(): Loja | undefined {
    const l = this.db.prepare(`SELECT loja FROM postados ORDER BY postado_em DESC LIMIT 1`).get() as { loja: Loja } | undefined;
    return l?.loja;
  }

  removerDaFila(loja: Loja, idProduto: string): void {
    this.db.prepare(`DELETE FROM fila WHERE loja = ? AND id_produto = ?`).run(loja, idProduto);
  }

  /** Preço muda rápido: oferta parada na fila há muito tempo é descartada. */
  limparFilaAntiga(horas: number, agora: Date): number {
    const r = this.db.prepare(`DELETE FROM fila WHERE criado_em < ?`).run(agora.getTime() - horas * 3_600_000);
    return Number(r.changes);
  }

  tamanhoDaFila(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM fila`).get() as { n: number }).n;
  }

  itensDaFila(limite: number): OfertaAvaliada[] {
    const linhas = this.db.prepare(`SELECT dados FROM fila ORDER BY pontos DESC, criado_em ASC LIMIT ?`).all(limite) as Array<{ dados: string }>;
    return linhas.map((l) => JSON.parse(l.dados) as OfertaAvaliada);
  }

  ultimosPosts(limite: number): Array<{ loja: string; titulo: string; categoria: string; preco: number; postadoEm: number }> {
    const linhas = this.db
      .prepare(`SELECT loja, titulo, categoria, preco, postado_em FROM postados ORDER BY postado_em DESC LIMIT ?`)
      .all(limite) as Array<{ loja: string; titulo: string; categoria: string; preco: number; postado_em: number }>;
    return linhas.map((l) => ({ loja: l.loja, titulo: l.titulo, categoria: l.categoria, preco: l.preco, postadoEm: l.postado_em }));
  }

  /** Mensagens por dia nos últimos `dias` dias (do mais antigo ao de hoje), incluindo dias sem posts. */
  postsPorDia(dias: number, agora: Date): Array<{ dia: string; posts: number }> {
    const linhas = this.db.prepare(`SELECT dia, COUNT(*) AS n FROM postados WHERE dia >= ? GROUP BY dia`).all(diasAtras(agora, dias - 1)) as Array<{ dia: string; n: number }>;
    const porDia = new Map(linhas.map((l) => [l.dia, l.n]));
    const saida: Array<{ dia: string; posts: number }> = [];
    for (let i = dias - 1; i >= 0; i--) {
      const dia = diasAtras(agora, i);
      saida.push({ dia, posts: porDia.get(dia) ?? 0 });
    }
    return saida;
  }

  /** Guarda a mensagem de WhatsApp de uma oferta já postada. O enviador do PC lê isto pelo arquivo whatsapp.json. */
  guardarParaWhatsapp(o: OfertaAvaliada, texto: string, agora: Date): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO whatsapp_saida (chave, loja, texto, imagem, link, criado_em) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(`${o.loja}:${o.idProduto}:${agora.getTime()}`, o.loja, texto, o.imagem ?? null, o.link, agora.getTime());
  }

  /** Guarda a oferta postada para virar conteúdo de Stories e Reels. A arte é feita depois (precisa baixar a foto). */
  guardarParaSocial(o: OfertaAvaliada, agora: Date): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO social_saida (chave, dados, svg, criado_em) VALUES (?, ?, NULL, ?)`)
      .run(`${o.loja}:${o.idProduto}:${agora.getTime()}`, JSON.stringify(o), agora.getTime());
  }

  socialSemArte(limite: number, horas: number, agora: Date): Array<{ chave: string; dados: string }> {
    return this.db
      .prepare(`SELECT chave, dados FROM social_saida WHERE svg IS NULL AND criado_em >= ? ORDER BY criado_em DESC LIMIT ?`)
      .all(agora.getTime() - horas * 3_600_000, limite) as Array<{ chave: string; dados: string }>;
  }

  salvarArteSocial(chave: string, svg: string, imagem?: string): void {
    this.db.prepare(`UPDATE social_saida SET svg = ?, imagem = ? WHERE chave = ?`).run(svg, imagem ?? null, chave);
  }

  socialRecentes(horas: number, limite: number, agora: Date): Array<{ chave: string; dados: string; svg?: string; imagem?: string; criadoEm: number; igFeedEm?: number; igStoryEm?: number }> {
    const linhas = this.db
      .prepare(`SELECT chave, dados, svg, imagem, ig_feed_em, ig_story_em, criado_em FROM social_saida WHERE criado_em >= ? ORDER BY criado_em DESC LIMIT ?`)
      .all(agora.getTime() - horas * 3_600_000, limite) as Array<{ chave: string; dados: string; svg: string | null; imagem: string | null; ig_feed_em: number | null; ig_story_em: number | null; criado_em: number }>;
    return linhas.map((l) => ({ chave: l.chave, dados: l.dados, svg: l.svg ?? undefined, imagem: l.imagem ?? undefined, criadoEm: l.criado_em, igFeedEm: l.ig_feed_em ?? undefined, igStoryEm: l.ig_story_em ?? undefined }));
  }

  marcarInstagram(chave: string, tipo: 'feed' | 'story', agora: Date): void {
    const coluna = tipo === 'feed' ? 'ig_feed_em' : 'ig_story_em';
    this.db.prepare(`UPDATE social_saida SET ${coluna} = ? WHERE chave = ?`).run(agora.getTime(), chave);
  }

  /** Quantas publicações do tipo já saíram no Instagram no dia (horário de Brasília). O carrossel conta como post de feed. */
  instagramNoDia(tipo: 'feed' | 'story', agora: Date): number {
    const coluna = tipo === 'feed' ? 'ig_feed_em' : 'ig_story_em';
    const linhas = this.db.prepare(`SELECT ${coluna} AS t FROM social_saida WHERE ${coluna} IS NOT NULL`).all() as Array<{ t: number }>;
    const hoje = diaDe(agora);
    return linhas.filter((l) => diaDe(new Date(l.t)) === hoje).length + (tipo === 'feed' ? this.carrosseisPublicadosNoDia(agora) : 0);
  }

  // ───────── Carrossel do Instagram ("Top 5 até R$ 100") ─────────

  /** Guarda o carrossel pronto para publicar (os dados trazem as ofertas e as fotos, para refazer as imagens a cada rodada). */
  salvarCarrossel(chave: string, titulo: string, dados: string, agora: Date): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO instagram_carrosseis (chave, dia, titulo, dados, criado_em, publicado_em) VALUES (?, ?, ?, ?, ?, NULL)`)
      .run(chave, diaDe(agora), titulo, dados, agora.getTime());
  }

  /** Já existe carrossel criado hoje (publicado ou não)? Só se cria um por dia. */
  carrosselCriadoNoDia(agora: Date): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM instagram_carrosseis WHERE dia = ?`).get(diaDe(agora)));
  }

  /** O carrossel de hoje que ainda não foi publicado, se houver (e que não falhou demais: depois de 3 tentativas desiste). */
  carrosselPendente(agora: Date): { chave: string; titulo: string; dados: string; tentativas: number } | undefined {
    const l = this.db
      .prepare(`SELECT chave, titulo, dados, tentativas FROM instagram_carrosseis WHERE dia = ? AND publicado_em IS NULL AND tentativas < 3 ORDER BY criado_em DESC LIMIT 1`)
      .get(diaDe(agora)) as { chave: string; titulo: string; dados: string; tentativas: number } | undefined;
    return l;
  }

  registrarFalhaDoCarrossel(chave: string): void {
    this.db.prepare(`UPDATE instagram_carrosseis SET tentativas = tentativas + 1 WHERE chave = ?`).run(chave);
  }

  /** Marca como publicado e descarta o conteúdo pesado (fotos); fica só o registro, para saber o que já saiu. */
  marcarCarrosselPublicado(chave: string, agora: Date): void {
    this.db.prepare(`UPDATE instagram_carrosseis SET publicado_em = ?, dados = '{}' WHERE chave = ?`).run(agora.getTime(), chave);
  }

  /** Chaves dos carrosséis já publicados nos últimos `dias` dias (a chave de uma dica leva o assunto: dica-AAAA-MM-DD-slug). */
  carrosseisPublicadosRecentes(dias: number, agora: Date): string[] {
    const linhas = this.db.prepare(`SELECT chave FROM instagram_carrosseis WHERE publicado_em IS NOT NULL AND publicado_em >= ?`).all(agora.getTime() - dias * 86_400_000) as Array<{ chave: string }>;
    return linhas.map((l) => l.chave);
  }

  carrosseisPublicadosNoDia(agora: Date): number {
    const linhas = this.db.prepare(`SELECT publicado_em AS t FROM instagram_carrosseis WHERE publicado_em IS NOT NULL`).all() as Array<{ t: number }>;
    const hoje = diaDe(agora);
    return linhas.filter((l) => diaDe(new Date(l.t)) === hoje).length;
  }

  // ───────── Reel do Instagram (vídeo "Top 3 achadinhos do dia") ─────────

  /** Guarda o Reel do dia (as ofertas e as fotos, para refazer o vídeo a cada rodada até ele ser publicado). */
  salvarReel(chave: string, titulo: string, dados: string, agora: Date): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO instagram_reels (chave, dia, titulo, dados, criado_em, publicado_em) VALUES (?, ?, ?, ?, ?, NULL)`)
      .run(chave, diaDe(agora), titulo, dados, agora.getTime());
  }

  reelCriadoNoDia(agora: Date): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM instagram_reels WHERE dia = ?`).get(diaDe(agora)));
  }

  /** O Reel de hoje que ainda não foi publicado (depois de 3 falhas desiste). */
  reelPendente(agora: Date): { chave: string; titulo: string; dados: string; tentativas: number } | undefined {
    return this.db
      .prepare(`SELECT chave, titulo, dados, tentativas FROM instagram_reels WHERE dia = ? AND publicado_em IS NULL AND tentativas < 3 ORDER BY criado_em DESC LIMIT 1`)
      .get(diaDe(agora)) as { chave: string; titulo: string; dados: string; tentativas: number } | undefined;
  }

  registrarFalhaDoReel(chave: string): void {
    this.db.prepare(`UPDATE instagram_reels SET tentativas = tentativas + 1 WHERE chave = ?`).run(chave);
  }

  marcarReelPublicado(chave: string, agora: Date): void {
    this.db.prepare(`UPDATE instagram_reels SET publicado_em = ?, dados = '{}' WHERE chave = ?`).run(agora.getTime(), chave);
  }

  reelsPublicadosNoDia(agora: Date): number {
    const linhas = this.db.prepare(`SELECT publicado_em AS t FROM instagram_reels WHERE publicado_em IS NOT NULL`).all() as Array<{ t: number }>;
    const hoje = diaDe(agora);
    return linhas.filter((l) => diaDe(new Date(l.t)) === hoje).length;
  }

  /** Anota o resultado da última coleta de uma loja. Sem `erro` zera a contagem de falhas seguidas. */
  registrarSaudeFonte(fonte: string, erro: string | undefined, agora: Date): void {
    if (erro === undefined) {
      this.db
        .prepare(`INSERT INTO saude_fontes (fonte, falhas, ultimo_erro, ultimo_ok_em) VALUES (?, 0, NULL, ?)
                  ON CONFLICT(fonte) DO UPDATE SET falhas = 0, ultimo_erro = NULL, ultimo_ok_em = excluded.ultimo_ok_em`)
        .run(fonte, agora.getTime());
    } else {
      this.db
        .prepare(`INSERT INTO saude_fontes (fonte, falhas, ultimo_erro) VALUES (?, 1, ?)
                  ON CONFLICT(fonte) DO UPDATE SET falhas = falhas + 1, ultimo_erro = excluded.ultimo_erro`)
        .run(fonte, erro);
    }
  }

  /** Lojas que falharam em pelo menos `minimo` coletas seguidas. */
  fontesComFalhas(minimo: number): Array<{ fonte: string; falhas: number; erro: string; ultimoOkEm?: number }> {
    const linhas = this.db
      .prepare(`SELECT fonte, falhas, ultimo_erro, ultimo_ok_em FROM saude_fontes WHERE falhas >= ? ORDER BY fonte`)
      .all(minimo) as Array<{ fonte: string; falhas: number; ultimo_erro: string | null; ultimo_ok_em: number | null }>;
    return linhas.map((l) => ({ fonte: l.fonte, falhas: l.falhas, erro: l.ultimo_erro ?? 'erro desconhecido', ultimoOkEm: l.ultimo_ok_em ?? undefined }));
  }

  /** Momento (ms) da última publicação do tipo no Instagram; undefined se nunca houve. */
  ultimoInstagram(tipo: 'feed' | 'story'): number | undefined {
    const coluna = tipo === 'feed' ? 'ig_feed_em' : 'ig_story_em';
    const l = this.db.prepare(`SELECT MAX(${coluna}) AS t FROM social_saida`).get() as { t: number | null } | undefined;
    const c = tipo === 'feed' ? (this.db.prepare(`SELECT MAX(publicado_em) AS t FROM instagram_carrosseis`).get() as { t: number | null } | undefined) : undefined;
    const maior = Math.max(l?.t ?? 0, c?.t ?? 0);
    return maior > 0 ? maior : undefined;
  }

  /** Mensagens de WhatsApp criadas nas últimas `horas` horas, da mais antiga para a mais nova. */
  mensagensDoWhatsapp(horas: number, agora: Date): Array<{ chave: string; loja: string; texto: string; imagem?: string; link: string; criadoEm: number }> {
    const linhas = this.db
      .prepare(`SELECT chave, loja, texto, imagem, link, criado_em FROM whatsapp_saida WHERE criado_em >= ? ORDER BY criado_em ASC`)
      .all(agora.getTime() - horas * 3_600_000) as Array<{ chave: string; loja: string; texto: string; imagem: string | null; link: string; criado_em: number }>;
    return linhas.map((l) => ({ chave: l.chave, loja: l.loja, texto: l.texto, imagem: l.imagem ?? undefined, link: l.link, criadoEm: l.criado_em }));
  }

  /** Guarda a última versão de uma oferta boa. O blog lê daqui. */
  guardarProduto(o: OfertaAvaliada, agora: Date): void {
    this.db
      .prepare(
        `INSERT INTO produtos (loja, id_produto, dados, pontos, categoria, visto_em) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (loja, id_produto) DO UPDATE SET dados = excluded.dados, pontos = excluded.pontos, categoria = excluded.categoria, visto_em = excluded.visto_em`,
      )
      .run(o.loja, o.idProduto, JSON.stringify(o), o.pontos, o.categoria, agora.getTime());
  }

  /** Melhores produtos vistos nas últimas `horas`, por pontuação. Sem `categoria`, vale para todas. */
  melhoresProdutos(opcoes: { horas: number; limite: number; categoria?: string }, agora: Date): OfertaAvaliada[] {
    const desde = agora.getTime() - opcoes.horas * 3_600_000;
    const linhas = (
      opcoes.categoria
        ? this.db.prepare(`SELECT dados FROM produtos WHERE visto_em >= ? AND categoria = ? ORDER BY pontos DESC LIMIT ?`).all(desde, opcoes.categoria, opcoes.limite)
        : this.db.prepare(`SELECT dados FROM produtos WHERE visto_em >= ? ORDER BY pontos DESC LIMIT ?`).all(desde, opcoes.limite)
    ) as Array<{ dados: string }>;
    return linhas.map((l) => JSON.parse(l.dados) as OfertaAvaliada);
  }

  /** Categorias que têm produtos recentes, com a contagem de cada uma. */
  categoriasRecentes(horas: number, agora: Date): Array<{ categoria: string; total: number }> {
    return this.db
      .prepare(`SELECT categoria, COUNT(*) AS total FROM produtos WHERE visto_em >= ? GROUP BY categoria ORDER BY total DESC, categoria ASC`)
      .all(agora.getTime() - horas * 3_600_000) as Array<{ categoria: string; total: number }>;
  }

  /** Preço de cada dia registrado, do mais antigo ao mais novo (inclui hoje). */
  historicoDiario(loja: Loja, idProduto: string, dias: number, agora: Date): Array<{ dia: string; preco: number }> {
    return this.db
      .prepare(`SELECT dia, preco FROM precos WHERE loja = ? AND id_produto = ? AND dia >= ? ORDER BY dia ASC`)
      .all(loja, idProduto, diasAtras(agora, dias)) as Array<{ dia: string; preco: number }>;
  }

  /** Guarda o produto no acervo do guia do seu tipo (é de onde saem os "Melhores X"). */
  guardarParaGuia(tipo: string, o: Oferta, agora: Date): void {
    this.db
      .prepare(
        `INSERT INTO guia_produtos (tipo, loja, id_produto, dados, visto_em) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tipo, loja, id_produto) DO UPDATE SET dados = excluded.dados, visto_em = excluded.visto_em`,
      )
      .run(tipo, o.loja, o.idProduto, JSON.stringify(o), agora.getTime());
  }

  /** Produtos de um tipo vistos nos últimos `dias`, do mais recente para o mais antigo. */
  produtosDoGuia(tipo: string, dias: number, limite: number, agora: Date): Array<{ oferta: Oferta; vistoEm: number }> {
    const linhas = this.db
      .prepare(`SELECT dados, visto_em FROM guia_produtos WHERE tipo = ? AND visto_em >= ? ORDER BY visto_em DESC LIMIT ?`)
      .all(tipo, agora.getTime() - dias * 86_400_000, limite) as Array<{ dados: string; visto_em: number }>;
    return linhas.map((l) => ({ oferta: JSON.parse(l.dados) as Oferta, vistoEm: l.visto_em }));
  }

  /** Tipos de guia que têm produtos recentes, com a contagem. */
  tiposComProdutos(dias: number, agora: Date): Array<{ tipo: string; total: number }> {
    return this.db
      .prepare(`SELECT tipo, COUNT(*) AS total FROM guia_produtos WHERE visto_em >= ? GROUP BY tipo ORDER BY total DESC, tipo ASC`)
      .all(agora.getTime() - dias * 86_400_000) as Array<{ tipo: string; total: number }>;
  }

  salvarGuia(g: { arquivo: string; tipo: string; titulo: string; dados: string; atualizadoEm: number }): void {
    this.db
      .prepare(
        `INSERT INTO guias (arquivo, tipo, titulo, dados, atualizado_em) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (arquivo) DO UPDATE SET tipo = excluded.tipo, titulo = excluded.titulo, dados = excluded.dados, atualizado_em = excluded.atualizado_em`,
      )
      .run(g.arquivo, g.tipo, g.titulo, g.dados, g.atualizadoEm);
  }

  /** Guias publicados (a última versão boa de cada um). Eles não saem do ar por falta de produtos novos. */
  guiasSalvos(): Array<{ arquivo: string; tipo: string; titulo: string; dados: string; atualizadoEm: number }> {
    const linhas = this.db.prepare(`SELECT arquivo, tipo, titulo, dados, atualizado_em FROM guias ORDER BY arquivo ASC`).all() as Array<{ arquivo: string; tipo: string; titulo: string; dados: string; atualizado_em: number }>;
    return linhas.map((l) => ({ arquivo: l.arquivo, tipo: l.tipo, titulo: l.titulo, dados: l.dados, atualizadoEm: l.atualizado_em }));
  }

  /** Texto guardado sob a chave, desde que tenha sido escrito há no máximo `validadeEmDias`. */
  textoSalvo(chave: string, validadeEmDias: number, agora: Date): string | undefined {
    const linha = this.db.prepare(`SELECT texto FROM textos WHERE chave = ? AND criado_em >= ?`).get(chave, agora.getTime() - validadeEmDias * 86_400_000) as { texto: string } | undefined;
    return linha?.texto;
  }

  salvarTexto(chave: string, texto: string, agora: Date): void {
    this.db
      .prepare(`INSERT INTO textos (chave, texto, criado_em) VALUES (?, ?, ?) ON CONFLICT (chave) DO UPDATE SET texto = excluded.texto, criado_em = excluded.criado_em`)
      .run(chave, texto, agora.getTime());
  }

  salvarPost(p: PostSalvo): void {
    this.db
      .prepare(
        `INSERT INTO posts (arquivo, dia, tema, titulo, dados, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (arquivo) DO UPDATE SET dia = excluded.dia, tema = excluded.tema, titulo = excluded.titulo, dados = excluded.dados, atualizado_em = excluded.atualizado_em`,
      )
      .run(p.arquivo, p.dia, p.tema, p.titulo, p.dados, p.atualizadoEm);
  }

  /** Todos os posts no ar, do dia mais novo para o mais antigo; dentro do dia, o post geral vem primeiro. */
  postsSalvos(): PostSalvo[] {
    const linhas = this.db
      .prepare(`SELECT arquivo, dia, tema, titulo, dados, atualizado_em FROM posts ORDER BY dia DESC, (tema = 'todas') DESC, arquivo ASC`)
      .all() as Array<{ arquivo: string; dia: string; tema: string; titulo: string; dados: string; atualizado_em: number }>;
    return linhas.map((l) => ({ arquivo: l.arquivo, dia: l.dia, tema: l.tema, titulo: l.titulo, dados: l.dados, atualizadoEm: l.atualizado_em }));
  }

  /** Apaga os posts de dias anteriores a `dia` (AAAA-MM-DD). Devolve quantos saíram. */
  removerPostsAntesDe(dia: string): number {
    return Number(this.db.prepare(`DELETE FROM posts WHERE dia < ?`).run(dia).changes);
  }

  /**
   * Faxina: apaga o que não é mais usado, para o banco não crescer sem parar.
   * (Histórico de preços de 90 dias, posts do canal de 90 dias, produtos e textos antigos.)
   */
  limpar(agora: Date): void {
    const t = agora.getTime();
    this.db.prepare(`DELETE FROM precos WHERE dia < ?`).run(diasAtras(agora, 90));
    this.db.prepare(`DELETE FROM postados WHERE postado_em < ?`).run(t - 90 * 86_400_000);
    this.db.prepare(`DELETE FROM cupons_postados WHERE postado_em < ?`).run(t - 90 * 86_400_000);
    this.db.prepare(`DELETE FROM whatsapp_saida WHERE criado_em < ?`).run(t - 2 * 86_400_000);
    this.db.prepare(`DELETE FROM social_saida WHERE criado_em < ?`).run(t - 2 * 86_400_000);
    // Publicado vira só um registro (leve) e fica 30 dias, para o robô saber que assunto já usou; o que não saiu perde a validade em 2 dias.
    this.db.prepare(`DELETE FROM instagram_carrosseis WHERE criado_em < ?`).run(t - 30 * 86_400_000);
    this.db.prepare(`DELETE FROM instagram_carrosseis WHERE publicado_em IS NULL AND criado_em < ?`).run(t - 2 * 86_400_000);
    this.db.prepare(`DELETE FROM instagram_reels WHERE criado_em < ?`).run(t - 30 * 86_400_000);
    this.db.prepare(`DELETE FROM instagram_reels WHERE publicado_em IS NULL AND criado_em < ?`).run(t - 2 * 86_400_000);
    this.db.prepare(`DELETE FROM produtos WHERE visto_em < ?`).run(t - 7 * 86_400_000);
    this.db.prepare(`DELETE FROM guia_produtos WHERE visto_em < ?`).run(t - 30 * 86_400_000);
    this.db.prepare(`DELETE FROM textos WHERE criado_em < ? AND chave LIKE 'produto:%'`).run(t - 30 * 86_400_000);
    this.db.prepare(`DELETE FROM textos WHERE criado_em < ? AND chave NOT LIKE 'produto:%'`).run(t - 3 * 86_400_000);
    this.db.exec('VACUUM');
  }

  fechar(): void {
    this.db.close();
  }
}
