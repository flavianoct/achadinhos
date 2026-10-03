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
      CREATE TABLE IF NOT EXISTS textos (
        chave TEXT PRIMARY KEY,
        texto TEXT NOT NULL,
        criado_em INTEGER NOT NULL
      );
    `);
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
  historico(loja: Loja, idProduto: string, dias: number, agora: Date): { menor?: number; diasComDado: number; desde?: string } {
    const linha = this.db
      .prepare(
        `SELECT MIN(preco) AS menor, COUNT(*) AS n, MIN(dia) AS desde FROM precos
         WHERE loja = ? AND id_produto = ? AND dia >= ? AND dia < ?`,
      )
      .get(loja, idProduto, diasAtras(agora, dias), diaDe(agora)) as { menor: number | null; n: number; desde: string | null };
    return { menor: linha.menor ?? undefined, diasComDado: linha.n, desde: linha.desde ?? undefined };
  }

  ultimoPost(loja: Loja, idProduto: string): { preco: number; postadoEm: number } | undefined {
    const linha = this.db
      .prepare(`SELECT preco, postado_em FROM postados WHERE loja = ? AND id_produto = ? ORDER BY postado_em DESC LIMIT 1`)
      .get(loja, idProduto) as { preco: number; postado_em: number } | undefined;
    return linha ? { preco: linha.preco, postadoEm: linha.postado_em } : undefined;
  }

  registrarPost(o: OfertaAvaliada, agora: Date): void {
    this.db
      .prepare(`INSERT INTO postados (loja, id_produto, titulo, categoria, preco, dia, postado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(o.loja, o.idProduto, o.titulo, o.categoria, o.preco, diaDe(agora), agora.getTime());
  }

  postsNoDia(agora: Date): number {
    const linha = this.db.prepare(`SELECT COUNT(*) AS n FROM postados WHERE dia = ?`).get(diaDe(agora)) as { n: number };
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

  /** Melhor oferta da fila (maior pontuação), sem removê-la. */
  melhorDaFila(): OfertaAvaliada | undefined {
    const linha = this.db.prepare(`SELECT dados FROM fila ORDER BY pontos DESC, criado_em ASC LIMIT 1`).get() as { dados: string } | undefined;
    return linha ? (JSON.parse(linha.dados) as OfertaAvaliada) : undefined;
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
    this.db.prepare(`DELETE FROM produtos WHERE visto_em < ?`).run(t - 7 * 86_400_000);
    this.db.prepare(`DELETE FROM textos WHERE criado_em < ? AND chave LIKE 'produto:%'`).run(t - 30 * 86_400_000);
    this.db.prepare(`DELETE FROM textos WHERE criado_em < ? AND chave NOT LIKE 'produto:%'`).run(t - 3 * 86_400_000);
    this.db.exec('VACUUM');
  }

  fechar(): void {
    this.db.close();
  }
}
