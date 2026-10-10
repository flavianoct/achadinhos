import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResultadoDoBlog } from './blog.ts';
import { CATEGORIAS, NICHOS, nomeDoNicho } from './categoria.ts';
import type { Config } from './config.ts';
import { geralAceita } from './rotas.ts';
import type { Banco } from './db.ts';
import type { ResumoDaColeta } from './pipeline.ts';
import type { ResumoDoInstagram } from './instagram.ts';
import { convitesDeHoje } from './convite.ts';
import { atualizarRodape } from './mensagem.ts';
import { conteudoSocialRecente } from './social.ts';

/** Quanto tempo uma mensagem de WhatsApp continua valendo (preço velho não deve ser postado). */
export const HORAS_DO_WHATSAPP = 12;

/** Quantas ofertas postadas o painel guarda para filtrar (os últimos dias; o arquivo continua leve). */
export const MAXIMO_DE_POSTS_NO_PAINEL = 300;

export interface DadosDaRodada {
  coleta?: ResumoDaColeta;
  postados: number;
  parou?: string;
  blog?: ResultadoDoBlog;
  instagram?: ResumoDoInstagram;
}

export interface StatusPublico {
  atualizadoEm: string;
  repo: string;
  blogUrl: string;
  telegramLink: string;
  canais: { telegram: boolean; whatsapp: boolean; blog: boolean; instagram: boolean };
  lojas: { shopee: boolean; mercadolivre: boolean; amazon: boolean };
  fila: number;
  postsHoje: number;
  maxPostsPorDia: number;
  postsPorDia: Array<{ dia: string; posts: number }>;
  whatsappPendentes: number;
  instagram?: { feedHoje: number; storiesHoje: number; avisos: string[] };
  coleta?: { vistas: number; aprovadas: number; erros: Record<string, string> };
  rodada: { postados: number; parou?: string };
  blog?: { guias: number; postsNoAr: number; postsDeHoje: number; textosDeIA: number; modelo?: string; avisos: string[] };
  ajustes: Record<string, string | number>;
  ultimosPosts: Array<{ loja: string; titulo: string; categoria: string; preco: number; postadoEm: number }>;
  /** Visão por nicho: posts, fila, ofertas aprovadas e roteamento de cada categoria. */
  nichos: Nicho[];
  /** Avisos de configuração das rotas (categoria ou canal inválido). */
  avisosDeRotas: string[];
  tambemNoGeral: boolean;
  /** Avisos do robô para o dono (ativos e resolvidos recentes). Só aparecem no painel. */
  avisosDoRobo: Array<{ texto: string; nivel: string; desde: number; vistoEm: number; vezes: number; ativo: boolean }>;
}

export interface Nicho {
  chave: string;
  nome: string;
  emoji: string;
  postsHoje: number;
  posts7dias: number;
  naFila: number;
  /** Ofertas aprovadas nas últimas 24 horas. */
  aprovadas24h: number;
  /** Vendas da Shopee nos últimos 7 dias (itens) e comissão em reais. */
  vendas7d: number;
  comissao7d: number;
  /** Tem canal próprio no Telegram? */
  temRota: boolean;
  /** O filtro do canal geral aceita este nicho? */
  noGeral: boolean;
  /** Só mostra o canal quando é público (@nome); ID numérico não aparece no arquivo público. */
  canal?: string;
}

/** Junta, por categoria, o que o painel mostra. Categorias sem nenhum número ficam de fora, menos as que têm rota. */
export function montarNichos(banco: Banco, config: Config, agora: Date): Nicho[] {
  const hoje = new Map(banco.postsPorCategoria(1, agora).map((c) => [c.categoria, c.posts]));
  const semana = new Map(banco.postsPorCategoria(7, agora).map((c) => [c.categoria, c.posts]));
  const fila = new Map(banco.filaPorCategoria().map((c) => [c.categoria, c.total]));
  const aprovadas = new Map(banco.categoriasRecentes(24, agora).map((c) => [c.categoria, c.total]));
  const vendas = new Map(banco.vendasPorCategoria(7, agora).map((c) => [c.categoria, c]));
  const conhecidas = new Set<string>([...CATEGORIAS, ...hoje.keys(), ...semana.keys(), ...fila.keys(), ...aprovadas.keys(), ...vendas.keys()]);
  return [...conhecidas]
    .map((chave): Nicho => {
      const rota = config.rotas.porCategoria[chave];
      return {
        chave,
        nome: nomeDoNicho(chave),
        emoji: NICHOS[chave]?.emoji ?? '🛍️',
        postsHoje: hoje.get(chave) ?? 0,
        posts7dias: semana.get(chave) ?? 0,
        naFila: fila.get(chave) ?? 0,
        aprovadas24h: aprovadas.get(chave) ?? 0,
        vendas7d: vendas.get(chave)?.vendas ?? 0,
        comissao7d: vendas.get(chave)?.comissao ?? 0,
        temRota: Boolean(rota),
        noGeral: geralAceita(chave, config),
        canal: rota?.startsWith('@') ? rota : undefined,
      };
    })
    .filter((n) => n.postsHoje || n.posts7dias || n.naFila || n.aprovadas24h || n.vendas7d || n.temRota)
    .sort((a, b) => b.posts7dias - a.posts7dias || b.aprovadas24h - a.aprovadas24h || a.nome.localeCompare(b.nome));
}

/** Só números e rótulos: nada aqui é segredo, porque o arquivo fica público no site. */
export function montarStatus(banco: Banco, config: Config, dados: DadosDaRodada, agora: Date, repo = ''): StatusPublico {
  return {
    atualizadoEm: agora.toISOString(),
    repo,
    blogUrl: config.blog.url,
    telegramLink: config.blog.telegramLink,
    canais: { telegram: Boolean(config.telegram.token && config.telegram.chatId), whatsapp: config.whatsapp.ativo, blog: config.blog.ativo, instagram: config.instagram.ativo },
    lojas: { shopee: config.shopee.ativo, mercadolivre: config.ml.ativo, amazon: config.amazon.ativo },
    fila: banco.tamanhoDaFila(),
    postsHoje: banco.postsNoDia(agora),
    maxPostsPorDia: config.ritmo.maxPostsPorDia,
    postsPorDia: banco.postsPorDia(7, agora),
    whatsappPendentes: banco.mensagensDoWhatsapp(HORAS_DO_WHATSAPP, agora).length,
    instagram: config.instagram.ativo ? { feedHoje: banco.instagramNoDia('feed', agora), storiesHoje: banco.instagramNoDia('story', agora), avisos: dados.instagram?.avisos ?? [] } : undefined,
    coleta: dados.coleta ? { vistas: dados.coleta.coletadas, aprovadas: dados.coleta.aprovadas, erros: dados.coleta.errosPorFonte } : undefined,
    rodada: { postados: dados.postados, parou: dados.parou || undefined },
    blog: dados.blog
      ? {
          guias: dados.blog.guias ?? 0,
          postsNoAr: dados.blog.postsNoAr,
          postsDeHoje: dados.blog.postsDeHoje,
          textosDeIA: dados.blog.textosDeIA,
          modelo: dados.blog.modeloDeIA,
          avisos: dados.blog.avisos,
        }
      : undefined,
    ajustes: {
      'Desconto mínimo (%)': config.filtro.descontoMinimo,
      'Nota mínima': config.filtro.notaMinima,
      'Vendas mínimas': config.filtro.vendasMinimas,
      'Preço mínimo (R$)': config.filtro.precoMinimo,
      'Preço máximo (R$)': config.filtro.precoMaximo,
      'Posts por rodada': config.ritmo.postsPorRodada,
      'Horário de postagem': `${config.ritmo.horaInicio}h às ${config.ritmo.horaFim}h`,
      'Limite por dia': config.ritmo.maxPostsPorDia,
      'Páginas do Mercado Livre': config.ml.paginas,
      'IA do blog': config.blog.ia === 'gemini' ? `gemini (${config.blog.geminiModelo})` : config.blog.ia,
    },
    ultimosPosts: banco.ultimosPosts(MAXIMO_DE_POSTS_NO_PAINEL).map((p) => ({ loja: p.loja, titulo: p.titulo.slice(0, 120), categoria: p.categoria, preco: p.preco, postadoEm: p.postadoEm })),
    nichos: montarNichos(banco, config, agora),
    avisosDeRotas: [...config.rotas.avisos, ...config.whatsapp.avisos],
    tambemNoGeral: config.rotas.tambemNoGeral,
    avisosDoRobo: banco.avisosDoRobo(agora).map((a) => ({ texto: a.texto, nivel: a.nivel, desde: a.desde, vistoEm: a.vistoEm, vezes: a.vezes, ativo: a.ativo })),
  };
}

/**
 * O que o enviador do WhatsApp lê: destinos gerais (sem `nichos`, seguem o filtro do geral em `geral`),
 * destinos de nicho (com `nichos`) e as mensagens com a categoria de cada uma.
 */
export function montarWhatsapp(config: Config, mensagens: unknown[], agora: Date) {
  const tipo = (link: string) => (link.includes('/channel/') ? 'canal' : 'grupo');
  const destinos: Array<{ tipo: string; link: string; nichos?: string[] }> = [];
  if (config.whatsapp.ativo) {
    for (const link of config.whatsapp.destinos) destinos.push({ tipo: tipo(link), link });
    for (const r of config.whatsapp.rotas) {
      const ja = destinos.find((d) => d.link === r.link && d.nichos);
      if (ja) ja.nichos!.push(r.nicho);
      else destinos.push({ tipo: tipo(r.link), link: r.link, nichos: [r.nicho] });
    }
  }
  return { atualizadoEm: agora.toISOString(), geral: { nichos: config.rotas.geralNichos, sem: config.rotas.geralSem }, destinos, mensagens };
}

/**
 * Grava na pasta do blog o que o painel e o enviador do WhatsApp leem:
 * status.json, whatsapp.json e painel.html. Tudo público e sem segredos.
 */
export function publicarControle(banco: Banco, config: Config, dados: DadosDaRodada, agora: Date, repo = process.env.GITHUB_REPOSITORY ?? ''): void {
  const pasta = config.blog.pasta;
  mkdirSync(pasta, { recursive: true });
  const status = montarStatus(banco, config, dados, agora, repo);
  const convites = config.whatsapp.ativo ? convitesDeHoje(config, agora).filter((c) => c.textoWhatsapp) : [];
  const mensagens = config.whatsapp.ativo
    ? [
        ...banco.mensagensDoWhatsapp(HORAS_DO_WHATSAPP, agora).map((m) => ({ id: m.chave, criadoEm: m.criadoEm, loja: m.loja, categoria: m.categoria, texto: atualizarRodape(m.texto, config), imagem: m.imagem, link: m.link })),
        // Os convites para o canal do Telegram (horários sorteados do dia): o enviador manda só texto, uma única vez cada (o id é fixo por convite).
        ...convites.map((c) => ({ id: c.id, criadoEm: c.criadoEm, loja: 'convite', categoria: undefined, texto: c.textoWhatsapp, imagem: undefined, link: '' })),
      ]
    : [];
  writeFileSync(join(pasta, 'status.json'), JSON.stringify(status, null, 2), 'utf8');
  writeFileSync(join(pasta, 'whatsapp.json'), JSON.stringify(montarWhatsapp(config, mensagens, agora), null, 2), 'utf8');
  writeFileSync(join(pasta, 'social.json'), JSON.stringify({ atualizadoEm: agora.toISOString(), itens: conteudoSocialRecente(banco, config, agora) }), 'utf8');
  writeFileSync(join(pasta, 'painel.html'), PAGINA_DO_PAINEL, 'utf8');
  writeFileSync(join(pasta, 'configurar.html'), paginaDeConfigurar(), 'utf8');
}

/** Página de configuração com seletores (src/configurar.html), com a lista de nichos embutida. */
export function paginaDeConfigurar(): string {
  const nichos = CATEGORIAS.map((chave) => ({ chave, nome: NICHOS[chave]!.nome, emoji: NICHOS[chave]!.emoji }));
  // JSON dentro de <script>: "<" escapado para nenhum texto fechar a tag.
  const json = JSON.stringify(nichos).replace(/</g, '\\u003c');
  return readFileSync(new URL('./configurar.html', import.meta.url), 'utf8').replace('/*NICHOS*/[]', json);
}

export const PAGINA_DO_PAINEL = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Painel do Mata Preço</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20200%20200%22%3E%3Cg%20transform%3D%22translate(0%200)%20scale(1)%22%3E%3Crect%20width%3D%22200%22%20height%3D%22200%22%20rx%3D%2244%22%20fill%3D%22%23E10600%22%2F%3E%3Cg%20transform%3D%22translate(22%2022)%20scale(.78)%22%3E%3Cg%20transform%3D%22rotate(-18%20100%20100)%22%3E%3Cpath%20d%3D%22M26%20100%20L74%2050%20H164%20Q176%2050%20176%2062%20V138%20Q176%20150%20164%20150%20H74%20Z%22%20fill%3D%22%23ffffff%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%2210%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%2270%22%20cy%3D%22100%22%20r%3D%2210%22%20fill%3D%22%23E10600%22%2F%3E%3C%2Fg%3E%3Cpath%20d%3D%22M128%2010%20L82%20106%20H112%20L90%20190%20L154%2084%20H122%20L146%2010%20Z%22%20fill%3D%22%23FFD60A%22%20stroke%3D%22%23E10600%22%20stroke-width%3D%2210%22%20stroke-linejoin%3D%22round%22%20paint-order%3D%22stroke%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800;1,900&family=Barlow:wght@400;500;600;700;800&display=swap">
<style>
.mp-barra{display:flex;align-items:center;gap:6px;background:#0E0E10;color:#fff;border-radius:14px;padding:8px 16px;margin-bottom:16px;font-size:28px}.mp-barra small{margin-left:auto;font:700 11px/1 Barlow,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;background:#FFD60A;color:#0E0E10;padding:6px 9px 5px 11px;border-radius:6px}.marca-nome{font-family:"Barlow Condensed","Arial Narrow",Impact,sans-serif;font-style:italic;font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:1;white-space:nowrap}.risco{position:relative;display:inline-block;color:#FFD60A}.risco::after{content:"";position:absolute;left:-4%;right:-4%;top:46%;height:.09em;background:#E10600;border-radius:.05em;transform:rotate(-5deg);box-shadow:0 0 0 .03em #0E0E10}
:root{--fundo:#0E0E10;--bg:#f5f6f8;--card:#fff;--tx:#1b1f27;--mut:#667085;--bd:#e4e7ec;--ok:#12805c;--okbg:#e3f5ee;--av:#a15c07;--avbg:#fdf0d9;--er:#b42318;--erbg:#fde7e4;--ac:#E10600;--acbg:#fde7e6}
@media(prefers-color-scheme:dark){:root{--bg:#0E0E10;--card:#17171B;--tx:#fff;--mut:#A9A9B3;--bd:#2A2A31;--ok:#4cc79a;--okbg:#12362b;--av:#FFD60A;--avbg:#3a2c0e;--er:#ff8a7e;--erbg:#3d1714;--ac:#FF3B30;--acbg:#2A1110}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 Barlow,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:18px}
h1{font-size:22px;margin:0}h2{font-size:16px;margin:26px 0 10px}
.sub{color:var(--mut);font-size:13px}
.pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600}
.ok{background:var(--okbg);color:var(--ok)}.av{background:var(--avbg);color:var(--av)}.er{background:var(--erbg);color:var(--er)}.of{background:var(--bd);color:var(--mut)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:14px 16px}
.n{font-size:28px;font-weight:700;line-height:1.1}.l{color:var(--mut);font-size:13px;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.btns{display:flex;flex-wrap:wrap;gap:8px}
a.b,button.b{background:var(--ac);color:#fff;border:0;border-radius:8px;padding:8px 14px;font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
a.b.s,button.b.s{background:var(--acbg);color:var(--ac)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--bd);vertical-align:top}th{color:var(--mut);font-weight:600;font-size:12px}
tr:last-child td{border-bottom:0}
.bars{display:flex;align-items:flex-end;gap:8px;height:110px}
.bar{flex:1;text-align:center;font-size:11px;color:var(--mut)}.bar i{display:block;background:var(--ac);border-radius:4px 4px 0 0;min-height:2px;margin-bottom:4px}
.msg{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;margin-bottom:10px}
.msg pre{white-space:pre-wrap;word-break:break-word;font:inherit;margin:0 0 10px}
.aviso{background:var(--avbg);color:var(--av);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:14px}
.erro{background:var(--erbg);color:var(--er);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:14px}
.nota{color:var(--mut);font-size:13px;margin-top:8px}
.social{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:10px}
.sc{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px}
.sc img{width:100%;border-radius:8px;display:block;margin-bottom:10px;background:var(--bd)}
.sc .btns{flex-direction:column}.sc .b{text-align:center}
.personalizar{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;margin:0 0 14px}.personalizar label{display:inline-flex;gap:6px;align-items:center;margin:4px 14px 4px 0;font-size:14px}.personalizar .linha{margin:8px 0}.personalizar h3{font-size:14px;margin:0 0 6px}
.aviso-robo{display:flex;gap:10px;align-items:flex-start;border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:14px}.aviso-robo.erro{background:var(--erbg);color:var(--er)}.aviso-robo.aviso{background:var(--avbg);color:var(--av)}.aviso-robo.ok{background:var(--okbg);color:var(--ok)}.aviso-robo.velho{background:var(--card);color:var(--mut);border:1px solid var(--bd)}.aviso-robo b{display:block}.aviso-robo small{opacity:.85}
.barra-filtros{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}.barra-filtros input,.barra-filtros select{font:inherit;font-size:14px;padding:8px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--card);color:var(--tx)}.barra-filtros input{flex:1 1 220px;min-width:160px}
.duas{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:12px;margin-top:12px}@media(max-width:700px){.duas{grid-template-columns:1fr}}
.rosca-box{display:flex;flex-direction:column;align-items:center;gap:12px}
.rosca{position:relative;width:150px;height:150px;border-radius:50%;background:var(--bd)}
.rosca::after{content:'';position:absolute;inset:30px;background:var(--card);border-radius:50%}
.leg{width:100%;font-size:13px}.leg div{display:flex;align-items:center;gap:6px;padding:1px 0}.leg i{width:10px;height:10px;border-radius:3px;flex:none}.leg span{margin-left:auto;color:var(--mut)}
.filtros{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.filtros button{background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:99px;padding:4px 12px;font:inherit;font-size:13px;cursor:pointer}.filtros button.on{background:var(--ac);color:#fff;border-color:var(--ac)}
#nicho-destaques .n{font-size:20px;overflow-wrap:anywhere}
@media(max-width:600px){table{display:block;overflow-x:auto}}
.mini{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--bd);min-width:60px}.mini i{display:block;height:100%}
</style>
</head>
<body>
<main>
<div class="mp-barra"><svg class="logo" viewBox="0 0 200 200" width="40" height="40" aria-hidden="true"><g transform="rotate(-18 100 100)"><path d="M26 100 L74 50 H164 Q176 50 176 62 V138 Q176 150 164 150 H74 Z" fill="#E10600" stroke="#E10600" stroke-width="10" stroke-linejoin="round"/><circle cx="70" cy="100" r="10" fill="#0E0E10"/></g><path d="M128 10 L82 106 H112 L90 190 L154 84 H122 L146 10 Z" fill="#FFD60A" stroke="#0E0E10" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/></svg><span class="marca-nome">Mata <span class="risco">Preço</span></span><small>Painel</small></div>
<header><div><h1>Painel do robô</h1><div class="sub" id="atualizado">Carregando…</div></div><span class="btns"><button class="b s" id="p-abrir" type="button">⚙ Personalizar</button><span id="saude" class="pill of">…</span></span></header>
<div class="personalizar" id="p-painel" hidden>
<h3>Seções que aparecem</h3><div class="linha" id="p-secoes"></div>
<div class="linha"><label>Ofertas por tela <select id="p-linhas"><option>25</option><option selected>50</option><option>100</option></select></label><label><input type="checkbox" id="p-lembrar" checked> Lembrar meus filtros</label><label>Filtro inicial de período <select id="p-per0"><option value="">Tudo que está guardado</option><option value="hoje">Hoje</option><option value="24">Últimas 24 horas</option><option value="168">Últimos 7 dias</option></select></label></div>
<div class="linha btns"><button class="b s" id="p-padrao" type="button">Voltar ao padrão</button><span class="sub">As escolhas ficam salvas neste navegador.</span></div>
</div>
<div id="avisos"></div>
<div class="grid" id="numeros"></div>

<h2>Avisos do robô</h2>
<div id="avisos-robo"></div>

<h2>Canais e lojas</h2>
<div class="chips" id="chips"></div>

<h2>Postagens nos últimos 7 dias</h2>
<div class="card"><div class="bars" id="barras"></div></div>

<h2>Ofertas por nicho</h2>
<div class="grid" id="nicho-destaques"></div>
<div class="duas">
<div class="card"><div class="rosca-box"><div class="rosca" id="rosca" role="img" aria-label="Distribuição dos posts dos últimos 7 dias por nicho"></div><div class="leg" id="legenda"></div></div></div>
<div class="card" style="overflow-x:auto"><table id="nichos"></table></div>
</div>
<div id="avisos-rotas"></div>
<p class="nota">Posts = ofertas disparadas no Telegram. Vendas e comissão vêm do relatório de afiliados da Shopee (lido a cada poucas horas, pedidos cancelados ficam de fora); o Mercado Livre não tem esse relatório por API, então as vendas dele aparecem só no painel de afiliados do próprio Mercado Livre.</p>

<h2>Controles</h2>
<div class="btns" id="controles"></div>
<p class="nota">Estes botões abrem o GitHub, onde o robô de fato roda. Só você (logado) consegue alterar algo. Esta página mostra apenas números e textos já públicos, nunca senhas.</p>

<h2>Ajustes atuais</h2>
<table id="ajustes"></table>

<h2>Ofertas postadas</h2>
<div class="barra-filtros">
<input id="f-q" type="search" placeholder="Buscar produto (sem acento)…" autocomplete="off">
<select id="f-loja"><option value="">Todas as lojas</option></select>
<select id="f-cat"><option value="">Todos os nichos</option></select>
<select id="f-per"><option value="hoje">Hoje</option><option value="24">Últimas 24 horas</option><option value="168">Últimos 7 dias</option><option value="" selected>Tudo que está guardado</option></select>
<select id="f-ord"><option value="data">Mais recentes</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option></select>
<button class="b s" id="f-limpar" type="button">Limpar filtros</button>
</div>
<div class="nota" id="f-cont"></div>
<table id="posts"></table>

<h2>Stories e Reels: conteúdo pronto</h2>
<div class="nota">Para cada oferta postada: a arte do Story (baixe em PNG), a legenda e o roteiro de 15 segundos. Publique no Instagram e no TikTok.</div>
<div class="social" id="social"></div>

<h2>WhatsApp: canais e grupos</h2>
<div class="nota">Onde o enviador posta as ofertas. Para incluir mais um, é só acrescentar o link em <code>WHATSAPP_DESTINOS</code> (separados por vírgula): o enviador pega a mudança em até 10 minutos, sem reiniciar.</div>
<div id="destinos"></div>
<div class="btns" id="zapbotoes"></div>

<h2>WhatsApp: mensagens prontas</h2>
<div class="nota" id="zapnota"></div>
<div id="zap"></div>
</main>
<script>
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const reais=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const quando=ms=>{const m=Math.round((Date.now()-ms)/60000);return m<1?'agora':m<60?'há '+m+' min':m<1440?'há '+Math.round(m/60)+' h':'há '+Math.round(m/1440)+' d'};
const carregar=u=>fetch(u+'?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(u);return r.json()});
async function iniciar(){
  let s,w;
  try{[s,w]=await Promise.all([carregar('status.json'),carregar('whatsapp.json')])}catch(e){document.getElementById('atualizado').textContent='Ainda não há dados: espere a próxima rodada do robô terminar.';return}
  try{so=await carregar('social.json')}catch(e){so={itens:[]}}
const t=new Date(s.atualizadoEm).getTime();
  document.getElementById('atualizado').textContent='Última rodada '+quando(t)+' · '+new Date(t).toLocaleString('pt-BR');
  const idade=(Date.now()-t)/60000;
  const saude=document.getElementById('saude');
  const erros=Object.entries(s.coleta&&s.coleta.erros||{});
  if(erros.length||idade>120){saude.className='pill '+(idade>120?'er':'av');saude.textContent=idade>120?'Robô parado?':'Atenção'}
  else{saude.className='pill ok';saude.textContent='Funcionando'}
  const av=document.getElementById('avisos');
  const duracao=ms=>{const m=Math.max(1,Math.round(ms/60000));return m<60?m+' min':m<1440?Math.round(m/60)+' h':Math.round(m/1440)+' d'};
  /* Avisos para o dono: só aqui no painel (nunca no Telegram, WhatsApp ou blog). */
  const lista=Array.isArray(s.avisosDoRobo)?s.avisosDoRobo:null;
  const avr=document.getElementById('avisos-robo');
  const desenharAviso=(a)=>{const d=el('div','aviso-robo '+(a.ativo?(a.nivel==='erro'?'erro':'aviso'):'velho'));const c=el('div');c.append(el('b','',(a.ativo?(a.nivel==='erro'?'⛔ ':'⚠️ '):'✔ ')+a.texto),el('small','',a.ativo?'desde há '+duracao(Date.now()-a.desde)+(a.vezes>1?' · visto em '+a.vezes+' rodadas':''):'resolvido (visto pela última vez há '+duracao(Date.now()-a.vistoEm)+')'));d.append(c);return d};
  if(lista){
    if(idade>120)avr.append(desenharAviso({ativo:true,nivel:'erro',texto:'A última rodada foi '+quando(t)+'. O normal é a cada 30 minutos. Veja a aba Actions do GitHub.',desde:t,vezes:1}));
    const ativos=lista.filter(a=>a.ativo),resolvidos=lista.filter(a=>!a.ativo);
    if(ativos.some(a=>a.nivel==='erro')){saude.className='pill er';saude.textContent='Atenção: há erros'}
    else if(ativos.length&&saude.textContent==='Funcionando'){saude.className='pill av';saude.textContent='Atenção'}
    ativos.forEach(a=>avr.append(desenharAviso(a)));
    if(!ativos.length&&idade<=120){const ok=el('div','aviso-robo ok');ok.append(el('b','','✔ Nenhum aviso agora. Tudo funcionando.'));avr.append(ok)}
    if(resolvidos.length){const dt=el('details');dt.append(el('summary','sub','Resolvidos nos últimos 7 dias ('+resolvidos.length+')'));resolvidos.forEach(a=>dt.append(desenharAviso(a)));avr.append(dt)}
  }else{
    erros.forEach(([l,m])=>av.append(el('div','erro','Erro em '+l+': '+m)));
    if(idade>120)av.append(el('div','erro','A última rodada foi '+quando(t)+'. O normal é a cada 30 minutos. Veja a aba Actions do GitHub.'));
    ((s.blog&&s.blog.avisos)||[]).forEach(m=>av.append(el('div','aviso',m)));
    ((s.instagram&&s.instagram.avisos)||[]).forEach(m=>av.append(el('div','aviso',m)));
  }
  const nums=[[s.fila,'ofertas na fila'],[s.postsHoje+' / '+s.maxPostsPorDia,'posts hoje'],[s.coleta?s.coleta.aprovadas+' de '+s.coleta.vistas:'-','aprovadas na última coleta'],[s.blog?s.blog.guias:'-','guias no ar'],[s.blog?s.blog.textosDeIA:'-','textos de IA na rodada'],[s.whatsappPendentes,'mensagens de WhatsApp na fila']].concat(s.instagram?[[s.instagram.feedHoje+' + '+s.instagram.storiesHoje,'Instagram hoje (feed + stories)']]:[]);
  const g=document.getElementById('numeros');
  nums.forEach(([n,l])=>{const c=el('div','card');c.append(el('div','n',String(n)),el('div','l',l));g.append(c)});
  const ch=document.getElementById('chips');
  [['Telegram',s.canais.telegram],['WhatsApp',s.canais.whatsapp],['Instagram',s.canais.instagram],['Blog',s.canais.blog],['Mercado Livre',s.lojas.mercadolivre],['Shopee',s.lojas.shopee],['Amazon',s.lojas.amazon]].forEach(([n,on])=>ch.append(el('span','pill '+(on?'ok':'of'),n+': '+(on?'ligado':'desligado'))));
  const max=Math.max(1,...s.postsPorDia.map(d=>d.posts));
  const b=document.getElementById('barras');
  s.postsPorDia.forEach(d=>{const x=el('div','bar');const i=el('i');i.style.height=Math.round(d.posts/max*80)+'px';x.append(i,el('div','',d.posts+''),el('div','',d.dia.slice(8)+'/'+d.dia.slice(5,7)));b.append(x)});

  const nichos=s.nichos||[];
  const CORES=['#2457d6','#12805c','#d97706','#c026d3','#0891b2','#dc2626','#65a30d','#7c3aed','#db2777','#64748b'];
  const cor=chave=>CORES[Math.max(0,nichos.findIndex(n=>n.chave===chave))%CORES.length];
  const tot7=nichos.reduce((a,n)=>a+n.posts7dias,0);
  const dest=document.getElementById('nicho-destaques');
  const topHoje=nichos.slice().sort((a,b)=>b.postsHoje-a.postsHoje)[0];
  const topFila=nichos.slice().sort((a,b)=>b.naFila-a.naFila)[0];
  [[topHoje&&topHoje.postsHoje?topHoje.emoji+' '+topHoje.nome:'-','nicho que mais disparou hoje'+(topHoje&&topHoje.postsHoje?' ('+topHoje.postsHoje+' posts)':'')],
   [topFila&&topFila.naFila?topFila.emoji+' '+topFila.nome:'-','maior fila de espera'+(topFila&&topFila.naFila?' ('+topFila.naFila+' ofertas)':'')],
   (()=>{const v=nichos.slice().sort((a,b)=>b.comissao7d-a.comissao7d)[0];return [v&&v.comissao7d?v.emoji+' '+v.nome:'-',v&&v.comissao7d?'nicho que mais rendeu em 7 dias ('+reais(v.comissao7d)+' de comissão na Shopee)':'nicho que mais rendeu (ainda sem vendas lidas da Shopee)']})(),
   [nichos.filter(n=>n.temRota).length+' de '+nichos.length,'nichos com canal próprio']].forEach(([n,l])=>{const c=el('div','card');c.append(el('div','n',n),el('div','l',l));dest.append(c)});
  let ang=0;const fatias=[];
  nichos.filter(n=>n.posts7dias>0).forEach(n=>{const f=n.posts7dias/tot7*100;fatias.push(cor(n.chave)+' '+ang+'% '+(ang+f)+'%');ang+=f});
  if(fatias.length)document.getElementById('rosca').style.background='conic-gradient('+fatias.join(',')+')';
  const lg=document.getElementById('legenda');
  nichos.filter(n=>n.posts7dias>0).forEach(n=>{const d=el('div');const q=el('i');q.style.background=cor(n.chave);d.append(q,el('b','',n.emoji+' '+n.nome),el('span','',n.posts7dias+' ('+Math.round(n.posts7dias/tot7*100)+'%)'));lg.append(d)});
  if(!tot7)lg.append(el('div','sub','Ainda sem posts nos últimos 7 dias.'));
  const tn=document.getElementById('nichos');
  const hn=el('tr');['Nicho','Hoje','7 dias','Na fila','Aprovadas 24h','Vendas 7d','Comissão 7d','Canal'].forEach(x=>hn.append(el('th','',x)));tn.append(hn);
  nichos.forEach(n=>{const r=el('tr');r.append(el('td','',n.emoji+' '+n.nome),el('td','',String(n.postsHoje)),el('td','',String(n.posts7dias)),el('td','',String(n.naFila)),el('td','',String(n.aprovadas24h)),el('td','',String(n.vendas7d)),el('td','',n.comissao7d?reais(n.comissao7d):'-'),el('td','',(n.temRota?(n.canal||'canal próprio'):'')+(n.noGeral&&(!n.temRota||s.tambemNoGeral)?(n.temRota?' + geral':'canal geral'):(n.temRota?'':'não enviado'))));tn.append(r)});
  if(!nichos.length){const r=el('tr');r.append(el('td','','Ainda sem ofertas por nicho: aparece depois da próxima rodada.'));tn.append(r)}
  const ar=document.getElementById('avisos-rotas');
  (s.avisosDeRotas||[]).forEach(m=>ar.append(el('div','aviso',m)));
  const c=document.getElementById('controles');
  if(s.repo){
    const base='https://github.com/'+s.repo;
    [['Configurar (seletores)','configurar.html',''],['Rodar agora',base+'/actions/workflows/robo.yml','s'],['Editar ajustes',base+'/edit/main/ajustes.env','s'],['Ver rodadas',base+'/actions','s'],['Chaves (Secrets)',base+'/settings/secrets/actions','s']].forEach(([n,u,k])=>{const a=el('a','b '+k,n);a.href=u;a.target='_blank';a.rel='noopener';c.append(a)});
  }
  if(s.blogUrl){const a=el('a','b s','Abrir o blog');a.href=s.blogUrl;a.target='_blank';c.append(a)}
  if(s.telegramLink){const a=el('a','b s','Abrir o canal do Telegram');a.href=s.telegramLink;a.target='_blank';c.append(a)}
  const aj=document.getElementById('ajustes');
  Object.entries(s.ajustes).forEach(([k,v])=>{const r=el('tr');r.append(el('td','',k),el('td','',String(v)));aj.append(r)});
  const PADRAO={ocultas:[],linhas:50,lembrar:true,per0:'',filtros:{}};
  const lerPrefs=()=>{try{return Object.assign({},PADRAO,JSON.parse(localStorage.getItem('painel-prefs')||'{}'))}catch(e){return Object.assign({},PADRAO)}};
  const gravarPrefs=()=>{try{localStorage.setItem('painel-prefs',JSON.stringify(prefs))}catch(e){}};
  const prefs=lerPrefs();
  const po=document.getElementById('posts');
  const NOMES={tech:'Tecnologia',casa:'Casa e Cozinha',games:'Games',beleza:'Beleza',moda:'Moda',esporte:'Esporte e Fitness',pet:'Pet',bebe:'Bebê e Infantil',ferramentas:'Ferramentas',geral:'Variedades'};
  const LOJAS={mercadolivre:'Mercado Livre',shopee:'Shopee',amazon:'Amazon'};
  const nomeDe=ch=>{const n=nichos.find(x=>x.chave===ch);return n?n.emoji+' '+n.nome:(NOMES[ch]||ch)};
  const semAcento=x=>String(x).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
  const diaBR=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  const fq=document.getElementById('f-q'),fl=document.getElementById('f-loja'),fc=document.getElementById('f-cat'),fp=document.getElementById('f-per'),fo=document.getElementById('f-ord');
  [...new Set(s.ultimosPosts.map(p=>p.loja))].sort().forEach(l=>{const o=el('option','',LOJAS[l]||l);o.value=l;fl.append(o)});
  [...new Set(s.ultimosPosts.map(p=>p.categoria).filter(Boolean))].sort((a,b)=>nomeDe(a).localeCompare(nomeDe(b),'pt-BR')).forEach(c=>{const o=el('option','',nomeDe(c));o.value=c;fc.append(o)});
  function desenharPosts(){
    const termos=semAcento(fq.value).split(/\\s+/).filter(Boolean),agora=Date.now(),hoje=diaBR(agora),per=fp.value;
    let lista=s.ultimosPosts.filter(p=>(!fl.value||p.loja===fl.value)&&(!fc.value||p.categoria===fc.value)&&termos.every(t=>semAcento(p.titulo).includes(t))&&(per===''||(per==='hoje'?diaBR(p.postadoEm)===hoje:agora-p.postadoEm<=Number(per)*3600000)));
    if(fo.value==='menor')lista=lista.slice().sort((a,b)=>a.preco-b.preco);
    else if(fo.value==='maior')lista=lista.slice().sort((a,b)=>b.preco-a.preco);
    po.replaceChildren();
    const th=el('tr');['Quando','Loja','Nicho','Produto','Preço'].forEach(h=>th.append(el('th','',h)));po.append(th);
    lista.slice(0,prefs.linhas).forEach(p=>{const r=el('tr');r.append(el('td','',quando(p.postadoEm)),el('td','',LOJAS[p.loja]||p.loja),el('td','',nomeDe(p.categoria)||'-'),el('td','',p.titulo.slice(0,90)),el('td','',reais(p.preco)));po.append(r)});
    if(!lista.length){const r=el('tr');r.append(el('td','',s.ultimosPosts.length?'Nenhuma oferta com esses filtros.':'Nenhum post ainda.'));po.append(r)}
    if(prefs.lembrar){prefs.filtros={q:fq.value,loja:fl.value,cat:fc.value,per:fp.value,ord:fo.value};gravarPrefs()}
    document.getElementById('f-cont').textContent=lista.length+' de '+s.ultimosPosts.length+' ofertas'+(lista.length>prefs.linhas?' (mostrando as '+prefs.linhas+' primeiras; mude em Personalizar)':'');
  }
  [fq,fl,fc,fp,fo].forEach(c=>c.addEventListener(c===fq?'input':'change',desenharPosts));
  document.getElementById('f-limpar').onclick=()=>{fq.value='';fl.value='';fc.value='';fp.value=prefs.per0;fo.value='data';desenharPosts()};
  const f0=prefs.lembrar?prefs.filtros:{};
  fq.value=f0.q||'';if([...fl.options].some(o=>o.value===f0.loja))fl.value=f0.loja;if([...fc.options].some(o=>o.value===f0.cat))fc.value=f0.cat;fp.value=f0.per!==undefined?f0.per:prefs.per0;fo.value=f0.ord||'data';
  desenharPosts();
  /* Personalizar: seções (cada título h2 e o que vem até o próximo), linhas por tela e filtros lembrados. */
  const blocos=[...document.querySelectorAll('main > h2')].map(h=>{const itens=[h];let n=h.nextElementSibling;while(n&&n.tagName!=='H2'){itens.push(n);n=n.nextElementSibling}return{titulo:h.textContent,itens}});
  const aplicarSecoes=()=>blocos.forEach(b=>b.itens.forEach(i=>{i.hidden=prefs.ocultas.includes(b.titulo)}));
  const secoes=document.getElementById('p-secoes'),pl=document.getElementById('p-linhas'),pr=document.getElementById('p-lembrar'),p0=document.getElementById('p-per0');
  blocos.forEach(b=>{const lb=el('label');const ck=document.createElement('input');ck.type='checkbox';ck.checked=!prefs.ocultas.includes(b.titulo);ck.onchange=()=>{prefs.ocultas=ck.checked?prefs.ocultas.filter(t=>t!==b.titulo):[...prefs.ocultas,b.titulo];gravarPrefs();aplicarSecoes()};lb.append(ck,document.createTextNode(b.titulo));secoes.append(lb)});
  pl.value=String(prefs.linhas);pr.checked=prefs.lembrar;p0.value=prefs.per0;
  pl.onchange=()=>{prefs.linhas=Number(pl.value);gravarPrefs();desenharPosts()};
  pr.onchange=()=>{prefs.lembrar=pr.checked;if(!pr.checked)prefs.filtros={};gravarPrefs();desenharPosts()};
  p0.onchange=()=>{prefs.per0=p0.value;gravarPrefs()};
  document.getElementById('p-padrao').onclick=()=>{try{localStorage.removeItem('painel-prefs')}catch(e){}location.reload()};
  document.getElementById('p-abrir').onclick=()=>{const p=document.getElementById('p-painel');p.hidden=!p.hidden};
  aplicarSecoes();
  const dz=document.getElementById('destinos');
  (w.destinos||[]).forEach(d=>{const l=el('div','msg');const t=el('div','',(d.tipo==='canal'?'Canal':'Grupo')+(d.nichos&&d.nichos.length?' de '+d.nichos.map(nomeDe).join(', '):' geral')+': ');const a=el('a','',d.link);a.href=d.link;a.target='_blank';a.rel='noopener';t.append(a);l.append(t,el('div','sub',d.tipo==='canal'?'Recebe o texto da oferta com o link e a foto em miniatura (o canal não aceita imagem enviada).':'Recebe a arte da oferta como imagem, com a legenda e o link. O número do enviador precisa ser membro do grupo.'));dz.append(l)});
  if(!(w.destinos||[]).length)dz.append(el('div','sub','Nenhum destino configurado. Acrescente o link de um canal ou grupo em WHATSAPP_DESTINOS.'));
  if(s.repo){const ed=el('a','b','Editar canais e grupos (ajustes.env)');ed.href='https://github.com/'+s.repo+'/edit/main/ajustes.env';ed.target='_blank';ed.rel='noopener';document.getElementById('zapbotoes').append(ed)}
  document.getElementById('zapnota').textContent=s.canais.whatsapp?'O enviador do seu PC busca estas mensagens sozinho. Aqui você também pode copiar uma e mandar na mão, se preferir.':'WhatsApp desligado (WHATSAPP_ATIVO=0).';
  const sc=document.getElementById('social');
const copiar=(btn,txt,rot)=>btn.onclick=()=>navigator.clipboard.writeText(txt).then(()=>{btn.textContent='Copiado!';setTimeout(()=>btn.textContent=rot,1500)});
so.itens.forEach(it=>{
const d=el('div','sc');
const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(it.svg);
const im=el('img');im.src=url;im.alt='Arte do Story';im.loading='lazy';
const bt=el('div','btns');
const png=el('button','b','Baixar Story (PNG)');
png.onclick=()=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=1080;c.height=1920;c.getContext('2d').drawImage(i,0,0,1080,1920);c.toBlob(bl=>{const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download='story-'+it.id.replace(/[^a-z0-9]/gi,'-')+'.png';a.click()},'image/png')};i.src=url};
const lg=el('button','b s','Copiar legenda');copiar(lg,it.legenda,'Copiar legenda');
const ro=el('button','b s','Copiar roteiro do vídeo');copiar(ro,it.roteiro,'Copiar roteiro do vídeo');
bt.append(png,lg,ro);d.append(im,el('div','sub',quando(it.criadoEm)),bt);sc.append(d)});
if(!so.itens.length)sc.append(el('div','sub','Nenhum conteúdo ainda: aparece depois da próxima postagem.'));
const z=document.getElementById('zap');
  w.mensagens.slice().reverse().slice(0,10).forEach(m=>{
    const d=el('div','msg');d.append(el('pre','',m.texto));
    const bt=el('div','btns');
    const cp=el('button','b s','Copiar texto');cp.onclick=()=>navigator.clipboard.writeText(m.texto).then(()=>{cp.textContent='Copiado!';setTimeout(()=>cp.textContent='Copiar texto',1500)});
    const a=el('a','b','Abrir no WhatsApp');a.href='https://wa.me/?text='+encodeURIComponent(m.texto);a.target='_blank';a.rel='noopener';
    bt.append(cp,a,el('span','sub',quando(m.criadoEm)));d.append(bt);z.append(d)});
  if(!w.mensagens.length)z.append(el('div','sub','Nenhuma mensagem pendente.'));
}
iniciar();
</script>
</body>
</html>
`;
