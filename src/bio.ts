import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Banco } from './db.ts';
import type { Config } from './config.ts';
import type { OfertaAvaliada } from './types.ts';
import { formatarPreco } from './mensagem.ts';

/** Quantas horas para trás a página "link da bio" olha, e quantas ofertas mostra no máximo. */
export const HORAS_DA_BIO = 48;
export const MAXIMO_NA_BIO = 12;

const NOME_DA_LOJA: Record<string, string> = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function https(url: string | undefined): string | undefined {
  return url && /^https:\/\//i.test(url) ? url : undefined;
}

/** Ofertas postadas nas últimas horas, sem repetir produto, mais bem pontuadas primeiro. */
export function ofertasDaBio(banco: Banco, agora: Date): OfertaAvaliada[] {
  const vistos = new Set<string>();
  const lista: OfertaAvaliada[] = [];
  for (const l of banco.socialRecentes(HORAS_DA_BIO, 200, agora)) {
    let o: OfertaAvaliada;
    try {
      o = JSON.parse(l.dados) as OfertaAvaliada;
    } catch {
      continue;
    }
    const id = `${o.loja}:${o.idProduto}`;
    if (vistos.has(id) || !https(o.link)) continue;
    vistos.add(id);
    lista.push(o);
  }
  return lista.sort((a, b) => b.pontos - a.pontos).slice(0, MAXIMO_NA_BIO);
}

/** Página para o link da bio do Instagram/TikTok: leve, em coluna única, com botões grandes. */
export function paginaDaBio(ofertas: OfertaAvaliada[], config: Config, agora: Date): string {
  const nome = config.blog.nome;
  const blog = https(config.blog.url ? `${config.blog.url}/` : undefined);
  const telegram = https(config.blog.telegramLink);
  // O canal do Telegram é o destino principal: quem entra recebe cada oferta na hora, sem depender do Instagram.
  const chamada = telegram
    ? `<section class="chamada">
    <p class="chamada-titulo">As melhores ofertas chegam primeiro no Telegram</p>
    <p class="chamada-texto">Entre no canal grátis e receba o aviso na hora. Os preços baixos costumam acabar rápido.</p>
    <a class="telegram" href="${esc(telegram)}" target="_blank" rel="noopener">Entrar no canal do Telegram</a>
    <p class="chamada-mini">Grátis. Você pode sair quando quiser.</p>
  </section>`
    : '';
  const chamadaFinal = telegram
    ? `<a class="telegram final" href="${esc(telegram)}" target="_blank" rel="noopener">Quero receber as ofertas no Telegram</a>`
    : '';
  const botoes: string[] = [];
  if (blog) botoes.push(`<a class="atalho claro" href="${esc(blog)}">Ver o blog com todas as ofertas e guias</a>`);

  const cartoes = ofertas
    .map((o) => {
      const img = https(o.imagem);
      const loja = NOME_DA_LOJA[o.loja] ?? o.loja;
      const de = o.precoOriginal && o.precoOriginal > o.preco ? `<s>${esc(formatarPreco(o.precoOriginal))}</s> ` : '';
      const desc = o.desconto && o.desconto > 0 ? `<span class="selo">-${Math.round(o.desconto)}%</span>` : '';
      const frete = o.freteGratis ? '<span class="selo verde">Frete grátis</span>' : '';
      return `<li class="oferta">
  ${img ? `<img src="${esc(img)}" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="semfoto"></div>'}
  <div class="info">
    <p class="titulo">${esc(o.titulo.length > 80 ? `${o.titulo.slice(0, 77).trimEnd()}…` : o.titulo)}</p>
    <p class="preco">${de}<strong>${esc(formatarPreco(o.preco))}</strong> ${desc} ${frete}</p>
    <a class="ver" href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">Ver oferta na ${esc(loja)}</a>
  </div>
</li>`;
    })
    .join('\n');

  const vazio = '<p class="vazio">As ofertas de hoje estão chegando. Volte em alguns minutos.</p>';
  const atualizado = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(agora).replace(',', ' às');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>${esc(nome)}: ofertas de hoje</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--tx:#1b1f27;--mut:#667085;--bd:#e4e7ec;--ac:#2457d6;--ok:#12805c;--okbg:#e3f5ee;--ro:#e11d48;--lar:#ff5a1f}
@media(prefers-color-scheme:dark){:root{--bg:#0f1218;--card:#181c25;--tx:#eceff4;--mut:#98a2b3;--bd:#2a3040;--ac:#7da2ff;--ok:#4cc79a;--okbg:#12362b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:22px 16px 48px}
h1{font-size:22px;margin:0 0 4px;text-align:center}.sub{text-align:center;color:var(--mut);font-size:14px;margin:0 0 18px}
.atalho{display:block;text-align:center;background:var(--ac);color:#fff;text-decoration:none;font-weight:700;padding:15px 16px;border-radius:14px;margin:0 0 10px}
.chamada{background:var(--ac);color:#fff;border-radius:16px;padding:18px 16px;text-align:center;margin:0 0 6px}
.chamada-titulo{font-size:19px;font-weight:800;line-height:1.25;margin:0 0 6px}.chamada-texto{font-size:14px;margin:0 0 14px;opacity:.95}.chamada-mini{font-size:12px;margin:8px 0 0;opacity:.85}
.telegram{display:block;text-align:center;background:#fff;color:#1d4fd7;text-decoration:none;font-weight:800;font-size:17px;padding:15px 16px;border-radius:12px}
.telegram.final{background:var(--ac);color:#fff;margin:16px 0 10px}
.atalho.claro{background:var(--card);color:var(--ac);border:2px solid var(--ac)}
h2{font-size:17px;margin:26px 0 10px}
ul{list-style:none;margin:0;padding:0}
.oferta{display:flex;gap:12px;background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px;margin:0 0 10px}
.oferta img,.semfoto{width:96px;height:96px;object-fit:contain;background:#fff;border-radius:10px;flex:none}
.semfoto{background:var(--bd)}
.info{min-width:0;flex:1}.titulo{margin:0 0 4px;font-size:14px;font-weight:600}
.preco{margin:0 0 8px;font-size:15px}.preco strong{font-size:20px}.preco s{color:var(--mut);font-size:13px}
.selo{display:inline-block;background:var(--ro);color:#fff;font-size:12px;font-weight:700;padding:1px 7px;border-radius:99px}
.selo.verde{background:var(--okbg);color:var(--ok)}
.ver{display:block;text-align:center;background:var(--lar);color:#fff;text-decoration:none;font-weight:700;padding:11px 10px;border-radius:10px}
.vazio{text-align:center;color:var(--mut)}
.nota{color:var(--mut);font-size:12px;text-align:center;margin-top:22px}
</style>
</head>
<body>
<main>
  <h1>${esc(nome)}</h1>
  <p class="sub">Ofertas de hoje, com o preço do momento</p>
  ${chamada}
  <h2>Ofertas em destaque</h2>
  ${cartoes ? `<ul>\n${cartoes}\n</ul>` : vazio}
  ${chamadaFinal}
  ${botoes.join('\n  ')}
  <p class="nota">Publi: os links são de afiliado e o site pode ganhar uma comissão, sem custo extra para você. Preços e estoque podem mudar a qualquer momento. Atualizado em ${esc(atualizado)}.</p>
</main>
</body>
</html>
`;
}

/** Grava blog/bio.html. Devolve quantas ofertas entraram. */
export function gravarBio(banco: Banco, config: Config, agora: Date): number {
  if (!config.blog.ativo) return 0;
  const ofertas = ofertasDaBio(banco, agora);
  mkdirSync(config.blog.pasta, { recursive: true });
  writeFileSync(join(config.blog.pasta, 'bio.html'), paginaDaBio(ofertas, config, agora), 'utf8');
  return ofertas.length;
}
