import { existsSync, readFileSync } from 'node:fs';
import { gerarBlog, modelosDoOllama, pedirAoGemini, pedirAoGitHub, type ResultadoDoBlog } from './blog.ts';
import { lerArquivoEnv, lerConfig, problemasDeConfig, problemasDoBlog, salvarNoEnv, type Config, type Env } from './config.ts';
import { Banco, horaDe } from './db.ts';
import { FonteAmazon } from './fontes/amazon.ts';
import { FonteMercadoLivre } from './fontes/mercadolivre.ts';
import { FonteMercadoLivreApi } from './fontes/mercadolivre-api.ts';
import { FonteShopee } from './fontes/shopee.ts';
import { convitesDeHoje } from './convite.ts';
import { chaveDoCupom, lerCupons } from './cupons.ts';
import { garimparCupons, type ResultadoDoGarimpo } from './garimpo-cupons.ts';
import { buscarCampanhas, buscarVendas } from './shopee-extra.ts';
import { atualizarVendas, coletar, postarCampanha, postarProxima, postarProximoCupom, type Descartes, type ResultadoDaCampanha, type ResultadoDoCupom, type ResultadoDoPost, type ResumoDaColeta } from './pipeline.ts';
import { Telegram, type Publicador } from './telegram.ts';
import type { Fonte, Loja } from './types.ts';

export interface LinhaDeChecagem {
  ok: boolean;
  texto: string;
}

export interface OpcoesDoRobo {
  caminhoEnv?: string;
  caminhoBanco?: string;
  /** Arquivo usado como ponto de partida quando o .env ainda não existe. */
  modeloEnv?: string;
  /** Variáveis de ambiente de base; o arquivo .env tem prioridade sobre elas. */
  envBase?: Env;
  /** Trocáveis nos testes. */
  criarFontes?: (config: Config) => Fonte[];
  criarPublicador?: (config: Config) => Publicador & { checar?: (destino?: string) => Promise<string> };
  silencioso?: boolean;
  /** Troca o garimpo de cupons (os testes não vão à internet). */
  garimparCupons?: (config: Config, agora: Date) => Promise<ResultadoDoGarimpo>;
}

function fontesReais(config: Config): Fonte[] {
  const fontes: Fonte[] = [];
  if (config.shopee.ativo) fontes.push(new FonteShopee(config.shopee));
  if (config.ml.ativo) {
    const api = config.ml.clientId && config.ml.clientSecret ? new FonteMercadoLivreApi({ clientId: config.ml.clientId, clientSecret: config.ml.clientSecret, mattWord: config.ml.mattWord, mattTool: config.ml.mattTool, categorias: config.ml.categorias, porRodada: config.ml.apiCategoriasPorRodada }) : undefined;
    fontes.push(new FonteMercadoLivre({ ...config.ml, reserva: api, tema: config.filtro.tema }));
  }
  if (config.amazon.ativo) fontes.push(new FonteAmazon());
  return fontes;
}

/** O robô em si: guarda o estado, respeita o ritmo e expõe as ações usadas pelo painel. */
export class Robo {
  config!: Config;
  env: Env = {};
  banco: Banco;
  pausado = false;
  /** Preenchido quando o .env tem um valor que não dá para ler (ex.: letra onde devia ser número). */
  erroDeConfig?: string;
  temArquivoEnv = false;
  ultimaColeta?: { em: number; resumo: ResumoDaColeta };
  ultimoBlog?: { em: number; resultado: ResultadoDoBlog };
  registro: string[] = [];
  /** Ofertas que a regra de parecidos tirou da fila desde que o robô começou (a rodada na nuvem é uma só). */
  descartes: Descartes = { parecidosComPostados: 0, perdeuParaMelhorVendedor: 0 };

  private opcoes: OpcoesDoRobo;
  private fontes: Fonte[] = [];
  private publicador?: Publicador & { checar?: (destino?: string) => Promise<string> };
  private coletaEm = 0;
  private postEm = 0;
  private blogEm = 0;
  private trava: Promise<unknown> = Promise.resolve();
  private blogRodando?: Promise<ResultadoDoBlog>;

  constructor(opcoes: OpcoesDoRobo = {}) {
    this.opcoes = opcoes;
    this.banco = new Banco(opcoes.caminhoBanco ?? 'dados.db');
    this.recarregar();
  }

  log(msg: string): void {
    const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const linha = `[${hora}] ${msg}`;
    this.registro.push(linha);
    if (this.registro.length > 300) this.registro.splice(0, this.registro.length - 300);
    if (!this.opcoes.silencioso) console.log(linha);
  }

  /** Lê o .env de novo e remonta lojas e Telegram. Chamado ao iniciar e depois de salvar no painel. */
  recarregar(): void {
    const arquivo = lerArquivoEnv(this.opcoes.caminhoEnv ?? '.env');
    this.temArquivoEnv = arquivo !== undefined;
    // O arquivo tem prioridade, mas uma linha vazia ("CHAVE=") não apaga um valor vindo do ambiente.
    const preenchidos = Object.fromEntries(Object.entries(arquivo ?? {}).filter(([, v]) => v.trim() !== ''));
    this.env = { ...(this.opcoes.envBase ?? process.env), ...preenchidos };
    try {
      this.config = lerConfig(this.env);
      this.erroDeConfig = undefined;
    } catch (e) {
      this.erroDeConfig = (e as Error).message;
      if (!this.config) this.config = lerConfig({});
      return;
    }
    this.fontes = (this.opcoes.criarFontes ?? fontesReais)(this.config);
    this.publicador = this.config.telegram.token && this.config.telegram.chatId
      ? (this.opcoes.criarPublicador ?? ((c) => new Telegram(c.telegram.token, c.telegram.chatId)))(this.config)
      : undefined;
  }

  /** O que impede o robô de postar. Vazio = pronto. */
  problemas(): string[] {
    return this.erroDeConfig ? [this.erroDeConfig] : problemasDeConfig(this.config);
  }

  /** Valida e grava alterações de configuração vindas do painel. */
  salvarConfig(alteracoes: Record<string, string>): void {
    lerConfig({ ...this.env, ...alteracoes }); // lança erro se algum valor for inválido, antes de gravar
    salvarNoEnv(alteracoes, this.opcoes.caminhoEnv ?? '.env', this.opcoes.modeloEnv ?? '.env.example');
    this.recarregar();
    this.coletaEm = 0; // novas chaves ou filtros valem já na próxima rodada
    this.log(`configuração salva: ${Object.keys(alteracoes).join(', ')}`);
  }

  /** Garante que coleta, post e blog nunca rodem ao mesmo tempo. */
  private emSerie<T>(fn: () => Promise<T>): Promise<T> {
    const proxima = this.trava.then(fn, fn);
    this.trava = proxima.catch(() => undefined);
    return proxima;
  }

  coletarAgora(agora: Date = new Date()): Promise<ResumoDaColeta> {
    return this.emSerie(async () => {
      this.coletaEm = agora.getTime();
      const resumo = await coletar(this.fontes, this.banco, this.config, agora);
      this.ultimaColeta = { em: agora.getTime(), resumo };
      this.log(`coleta: ${resumo.coletadas} ofertas vistas, ${resumo.aprovadas} aprovadas`);
      for (const [fonte, erro] of Object.entries(resumo.errosPorFonte)) this.log(`ERRO em ${fonte}: ${erro}`);
      return resumo;
    });
  }

  /** `forcar` ignora horário e limite diário (botão "postar agora" do painel). */
  postarAgora(agora: Date = new Date(), forcar = false): Promise<ResultadoDoPost> {
    return this.emSerie(async () => {
      this.postEm = agora.getTime();
      if (!this.publicador) return { postou: false, motivo: 'erro', detalhe: 'Telegram não configurado' } as ResultadoDoPost;
      const config: Config = forcar ? { ...this.config, ritmo: { ...this.config.ritmo, horaInicio: 0, horaFim: 24, maxPostsPorDia: Number.MAX_SAFE_INTEGER } } : this.config;
      const r = await postarProxima(this.publicador, this.banco, config, agora, this.descartes);
      if (r.postou) {
        const destino = Object.keys(this.config.rotas.porCategoria).length ? ` [${r.oferta.categoria} → ${r.canais.join(' + ')}]` : '';
        this.log(`postado: [${r.oferta.loja}] ${r.oferta.titulo.slice(0, 60)}${destino}`);
        for (const aviso of r.avisos) this.log(`AVISO: ${aviso}`);
      }
      else if (r.motivo === 'erro') this.log(`ERRO ao postar: ${r.detalhe}`);
      return r;
    });
  }

  /** A Shopee com as chaves da configuração, se estiver ativa e configurada. */
  private shopee(): FonteShopee | undefined {
    const s = this.config.shopee;
    return s.ativo && s.appId && s.secret ? new FonteShopee(s) : undefined;
  }

  /** Lê as vendas da Shopee (no máximo a cada VENDAS_HORAS horas). Devolve quantos itens leu, ou undefined se não era hora. */
  atualizarVendasAgora(agora: Date = new Date()): Promise<number | undefined> {
    return this.emSerie(async () => {
      const shopee = this.shopee();
      if (!shopee) return undefined;
      const n = await atualizarVendas((dias) => buscarVendas(shopee, dias, agora), this.banco, this.config, agora);
      if (n !== undefined) this.log(`vendas da Shopee: ${n} itens lidos`);
      return n;
    });
  }

  /**
   * Convite para o canal do WhatsApp no canal geral do Telegram: CONVITES_POR_DIA por dia, em horários sorteados, um por rodada no máximo.
   * Cada convite sai uma vez só (fica registrado por dia e número).
   */
  postarConviteAgora(agora: Date = new Date()): Promise<{ postou: boolean; motivo?: string }> {
    return this.emSerie(async () => {
      const devidos = convitesDeHoje(this.config, agora).filter((c) => c.textoTelegram);
      if (!devidos.length) return { postou: false, motivo: 'fora do dia ou da hora do convite' };
      if (!this.publicador?.publicarTexto) return { postou: false, motivo: 'Telegram não configurado' };
      const convite = devidos.find((c) => !this.banco.convitePostado(`telegram:${c.numero}`, c.dia));
      if (!convite) return { postou: false, motivo: 'já postado hoje' };
      try {
        await this.publicador.publicarTexto(convite.textoTelegram);
      } catch (e) {
        this.log(`ERRO ao postar o convite: ${(e as Error).message}`);
        return { postou: false, motivo: (e as Error).message };
      }
      this.banco.marcarConvitePostado(`telegram:${convite.numero}`, convite.dia, agora);
      this.log(`convite para o canal do WhatsApp postado no Telegram (${convite.numero + 1} do dia)`);
      return { postou: true };
    });
  }

  /** Posta uma campanha da Shopee no canal geral (até CAMPANHAS_POR_DIA por dia). */
  postarCampanhaAgora(agora: Date = new Date()): Promise<ResultadoDaCampanha> {
    return this.emSerie(async () => {
      const shopee = this.shopee();
      if (!this.publicador || !shopee) return { postou: false, motivo: 'desligado' } as ResultadoDaCampanha;
      const r = await postarCampanha(this.publicador, () => buscarCampanhas(shopee), this.banco, this.config, agora);
      if (r.postou) this.log(`campanha postada: ${r.campanha.nome.slice(0, 60)}`);
      else if (r.motivo === 'erro') this.log(`ERRO na campanha: ${r.detalhe}`);
      return r;
    });
  }

  /** Lê o cupons.json e posta o próximo cupom vigente (no máximo CUPONS_POR_DIA por dia). Devolve também os avisos do arquivo. */
  postarCupomAgora(agora: Date = new Date()): Promise<{ resultado: ResultadoDoCupom; avisos: string[] }> {
    return this.emSerie(async () => {
      if (!this.publicador) return { resultado: { postou: false, motivo: 'erro', detalhe: 'Telegram não configurado' } as ResultadoDoCupom, avisos: [] };
      const arquivo = this.config.cupons.arquivo;
      const lido = lerCupons(existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '');
      const avisos = [...lido.avisos];
      let cupons = lido.cupons;
      // Garimpo: busca cupons nas páginas públicas (só quando ainda cabe um cupom hoje) e junta aos seus. Os seus vêm primeiro.
      if (this.config.cupons.garimpo && this.banco.cuponsNoDia(agora) < this.config.cupons.porDia) {
        const garimpo = await (this.opcoes.garimparCupons ?? garimparCupons)(this.config, agora);
        avisos.push(...garimpo.avisos);
        const jaTem = new Set(cupons.map((c) => chaveDoCupom(c)));
        cupons = [...cupons, ...garimpo.cupons.filter((c) => !jaTem.has(chaveDoCupom(c)))];
      }
      const resultado = await postarProximoCupom(this.publicador, this.banco, cupons, this.config, agora);
      if (resultado.postou) this.log(`cupom postado: [${resultado.cupom.loja}] ${resultado.cupom.titulo.slice(0, 60)}`);
      else if (resultado.motivo === 'erro') this.log(`ERRO ao postar cupom: ${resultado.detalhe}`);
      return { resultado, avisos };
    });
  }

  /**
   * Gera (e publica) o blog. Roda em paralelo com coleta e posts, porque a IA pode levar minutos
   * escrevendo; se já houver uma geração em andamento, devolve a mesma em vez de começar outra.
   */
  gerarBlogAgora(agora: Date = new Date()): Promise<ResultadoDoBlog> {
    if (this.blogRodando) return this.blogRodando;
    this.blogEm = agora.getTime();
    const config = this.config;
    this.blogRodando = (async () => {
      try {
        const resultado = await gerarBlog(this.banco, config, agora);
        resultado.avisos.unshift(...problemasDoBlog(config));
        this.ultimoBlog = { em: agora.getTime(), resultado };
        const ia = resultado.textosDeIA ? `, ${resultado.textosDeIA} textos novos de IA (${resultado.modeloDeIA})` : '';
        this.log(resultado.gerou ? `blog: ${resultado.postsDeHoje} posts de hoje, ${resultado.postsNoAr} no ar, ${resultado.produtos} produtos${ia}${resultado.publicacao ? `, ${resultado.publicacao}` : ''}` : 'blog: não gerado');
        for (const aviso of resultado.avisos) this.log(`blog: ${aviso}`);
        return resultado;
      } finally {
        this.blogRodando = undefined;
      }
    })();
    return this.blogRodando;
  }

  removerDaFila(loja: Loja, idProduto: string): void {
    this.banco.removerDaFila(loja, idProduto);
  }

  /** Testa cada chave sem postar nada. */
  async checar(): Promise<LinhaDeChecagem[]> {
    const linhas: LinhaDeChecagem[] = this.problemas().map((p) => ({ ok: false, texto: p }));
    if (this.erroDeConfig) return linhas;

    if (this.publicador?.checar) {
      try {
        linhas.push({ ok: true, texto: `Telegram: ${await this.publicador.checar()}` });
      } catch (e) {
        linhas.push({ ok: false, texto: `Telegram: ${(e as Error).message}` });
      }
      for (const [categoria, canal] of Object.entries(this.config.rotas.porCategoria)) {
        try {
          linhas.push({ ok: true, texto: `Rota ${categoria}: ${await this.publicador.checar(canal)}` });
        } catch (e) {
          linhas.push({ ok: false, texto: `Rota ${categoria}: ${(e as Error).message}` });
        }
      }
    }
    for (const aviso of this.config.rotas.avisos) linhas.push({ ok: false, texto: aviso });
    for (const fonte of this.fontes) {
      if (fonte.nome === 'amazon') continue;
      try {
        const ofertas = await fonte.coletar();
        linhas.push({ ok: ofertas.length > 0, texto: `${fonte.nome}: ${ofertas.length} ofertas recebidas` });
        if (ofertas[0]) linhas.push({ ok: true, texto: `exemplo de ${fonte.nome}: ${ofertas[0].titulo.slice(0, 70)} — ${ofertas[0].link}` });
      } catch (e) {
        linhas.push({ ok: false, texto: `${fonte.nome}: ${(e as Error).message}` });
      }
    }
    if (this.config.blog.ia === 'ollama') {
      try {
        const modelos = await modelosDoOllama(this.config.blog.ollamaUrl);
        const escolhido = this.config.blog.ollamaModelo || modelos[0];
        if (!escolhido) linhas.push({ ok: false, texto: 'IA do blog: o Ollama está aberto, mas sem nenhum modelo instalado (ex.: ollama pull llama3.1).' });
        else if (!modelos.includes(escolhido) && !modelos.includes(`${escolhido}:latest`)) linhas.push({ ok: false, texto: `IA do blog: o modelo "${escolhido}" não está instalado. Instalados: ${modelos.join(', ') || 'nenhum'}.` });
        else linhas.push({ ok: true, texto: `IA do blog: Ollama no ar, usando o modelo ${escolhido}` });
      } catch (e) {
        linhas.push({ ok: false, texto: `IA do blog: não consegui falar com o Ollama (${(e as Error).message}). Ele está aberto?` });
      }
    }
    if (this.config.blog.ia === 'gemini') {
      const { geminiChave, geminiModelo } = this.config.blog;
      if (!geminiChave) linhas.push({ ok: false, texto: 'IA do blog: falta GEMINI_API_KEY (chave grátis em aistudio.google.com).' });
      else {
        try {
          await pedirAoGemini(geminiChave, geminiModelo, 'Responda apenas: ok');
          linhas.push({ ok: true, texto: `IA do blog: Gemini respondendo, modelo ${geminiModelo}` });
        } catch (e) {
          linhas.push({ ok: false, texto: `IA do blog: ${(e as Error).message}` });
        }
      }
    }
    if (this.config.blog.ia === 'github') {
      const { githubToken, githubModelo } = this.config.blog;
      if (!githubToken) linhas.push({ ok: false, texto: 'IA do blog: falta o GITHUB_TOKEN (no GitHub Actions ele vem do próprio workflow).' });
      else {
        try {
          await pedirAoGitHub(githubToken, githubModelo, 'Responda apenas: ok');
          linhas.push({ ok: true, texto: `IA do blog: GitHub Models respondendo, modelo ${githubModelo}` });
        } catch (e) {
          linhas.push({ ok: false, texto: `IA do blog: ${(e as Error).message}` });
        }
      }
    }
    return linhas;
  }

  /** Um passo do relógio: faz o que estiver na hora de fazer. Chamado a cada poucos segundos. */
  async tick(agora: Date = new Date()): Promise<void> {
    if (this.pausado || this.problemas().length > 0) return;
    const t = agora.getTime();
    const r = this.config.ritmo;
    if (t - this.coletaEm >= r.minutosEntreColetas * 60_000) await this.coletarAgora(agora);
    if (t - this.postEm >= r.minutosEntrePosts * 60_000) await this.postarAgora(agora);
    if (this.config.blog.ativo && t - this.blogEm >= this.config.blog.horas * 3_600_000) {
      // Não espera: a IA escrevendo o blog não pode atrasar os posts do Telegram.
      this.gerarBlogAgora(agora).catch((e) => this.log(`ERRO no blog: ${(e as Error).message}`));
    }
  }

  /** Tudo o que o painel mostra. */
  estado(agora: Date = new Date()) {
    const r = this.config.ritmo;
    const hora = horaDe(agora);
    const problemas = this.problemas();
    const ativo = !this.pausado && problemas.length === 0;
    return {
      agora: agora.getTime(),
      situacao: problemas.length > 0 ? 'configurar' : this.pausado ? 'pausado' : 'rodando',
      problemas,
      temArquivoEnv: this.temArquivoEnv,
      lojas: this.fontes.map((f) => f.nome),
      canal: this.config.telegram.chatId,
      fila: this.banco.tamanhoDaFila(),
      postsHoje: this.banco.postsNoDia(agora),
      limiteDiario: r.maxPostsPorDia,
      dentroDoHorario: hora >= r.horaInicio && hora < r.horaFim,
      horario: `${r.horaInicio}h às ${r.horaFim}h`,
      proximaColetaEm: ativo ? Math.max(this.coletaEm + r.minutosEntreColetas * 60_000, agora.getTime()) : undefined,
      proximoPostEm: ativo ? Math.max(this.postEm + r.minutosEntrePosts * 60_000, agora.getTime()) : undefined,
      ultimaColeta: this.ultimaColeta,
      filaItens: this.banco.itensDaFila(40).map((o) => ({
        loja: o.loja, idProduto: o.idProduto, titulo: o.titulo, preco: o.preco, desconto: o.desconto, pontos: o.pontos, categoria: o.categoria, link: o.link,
      })),
      posts: this.banco.ultimosPosts(40),
      blog: {
        ativo: this.config.blog.ativo,
        pasta: this.config.blog.pasta,
        url: this.config.blog.url,
        ia: this.config.blog.ia,
        publicar: this.config.blog.publicar,
        gerando: this.blogRodando !== undefined,
        ultimo: this.ultimoBlog,
      },
      registro: this.registro.slice(-120),
    };
  }

  fechar(): void {
    this.banco.fechar();
  }
}
