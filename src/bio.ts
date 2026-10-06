import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Banco } from './db.ts';
import type { Config } from './config.ts';
import type { OfertaAvaliada } from './types.ts';
import { formatarPreco } from './mensagem.ts';

/** Quantas horas para trás a página "link da bio" olha, e quantas ofertas mostra no máximo. */
export const HORAS_DA_BIO = 48;
/** Quantas ofertas a página guarda (para a busca achar mais) e quantas aparecem antes de alguém digitar. */
export const MAXIMO_NA_BIO = 60;
export const MOSTRAR_NA_BIO = 12;

const NOME_DA_LOJA: Record<string, string> = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', amazon: 'Amazon' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Sem acento e em minúsculas, para a busca achar "tênis" digitando "tenis". */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function https(url: string | undefined): string | undefined {
  return url && /^https:\/\//i.test(url) ? url : undefined;
}

/** Ofertas postadas nas últimas horas, sem repetir produto, as mais recentes primeiro. */
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
  // As mais recentes primeiro (a lista já chega do mais novo para o mais antigo): a página muda a cada rodada e mostra o que acabou de sair.
  return lista.slice(0, MAXIMO_NA_BIO);
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
    <a class="botao telegram" href="${esc(telegram)}" target="_blank" rel="noopener">Entrar no canal do Telegram</a>
    <p class="chamada-mini">Grátis. Você pode sair quando quiser.</p>
  </section>`
    : '';
  const chamadaFinal = telegram
    ? `<a class="botao telegram fim" href="${esc(telegram)}" target="_blank" rel="noopener">Quero receber as ofertas no Telegram</a>`
    : '';
  const botoes: string[] = [];
  if (blog) botoes.push(`<a class="botao blog" href="${esc(blog)}">Ver o blog com guias de compra</a>`);

  const cartoes = ofertas
    .map((o, i) => {
      const img = https(o.imagem);
      const loja = NOME_DA_LOJA[o.loja] ?? o.loja;
      const de = o.precoOriginal && o.precoOriginal > o.preco ? `<s>${esc(formatarPreco(o.precoOriginal))}</s> ` : '';
      const desc = o.desconto && o.desconto > 0 ? `<span class="selo">-${Math.round(o.desconto)}%</span>` : '';
      const frete = o.freteGratis ? '<span class="selo verde">Frete grátis</span>' : '';
      const busca = semAcento(`${o.titulo} ${loja}`);
      return `<li class="oferta${i >= MOSTRAR_NA_BIO ? ' extra' : ''}" data-b="${esc(busca)}">
  ${img ? `<img src="${esc(img)}" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="semfoto"></div>'}
  <div class="info">
    <p class="titulo">${esc(o.titulo.length > 80 ? `${o.titulo.slice(0, 77).trimEnd()}…` : o.titulo)}</p>
    <p class="preco">${de}<strong>${esc(formatarPreco(o.preco))}</strong> ${desc} ${frete}</p>
    <a class="ver" href="${esc(o.link)}" target="_blank" rel="sponsored nofollow noopener">Ver oferta ${o.loja === 'mercadolivre' ? 'no' : 'na'} ${esc(loja)}</a>
  </div>
</li>`;
    })
    .join('\n');

  // Busca no próprio aparelho: sem servidor e sem JavaScript de terceiros. Sem JavaScript a caixa nem aparece e a lista segue normal.
  const buscador = `<div class="busca" id="busca" hidden>
    <label for="q">Procurando uma promoção específica?</label>
    <input id="q" type="search" placeholder="Digite o produto (ex.: air fryer, fone, tênis)" autocomplete="off" enterkeyhint="search">
    <p class="busca-info" id="info" aria-live="polite"></p>
  </div>`;
  const semResultado = `<div class="semresultado escondido" id="nada">Não achei esse produto nas ofertas de agora.${blog ? ` Veja os <a href="${esc(blog)}">guias do blog</a>` : ''}${telegram ? ` ou entre no <a href="${esc(telegram)}" target="_blank" rel="noopener">canal do Telegram</a>: avisamos quando aparecer.` : '.'}</div>`;
  const vazio ='<p class="vazio">As ofertas de hoje estão chegando. Volte em alguns minutos.</p>';
  const atualizado = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(agora).replace(',', ' às');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>${esc(nome)}: ofertas de hoje</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--tx:#111827;--mut:#5b6474;--bd:#e4e7ee;--cor:#d6336c;--cor2:#b5214f;--ok:#0b7a52;--okbg:#e6f6ef;--lar:#e8590c;--tg:#229ed9}
@media(prefers-color-scheme:dark){:root{--bg:#0b0d12;--card:#141821;--tx:#eef0f5;--mut:#9aa3b3;--bd:#232837;--cor:#f06595;--cor2:#ff8fb3;--ok:#4cd694;--okbg:#10281e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:28px 16px 48px}
.marca{text-align:center;margin:0 0 18px}.logo{width:64px;height:64px;color:var(--cor);display:block;margin:0 auto 10px}
h1{font-size:24px;letter-spacing:-.02em;margin:0 0 4px}.sub{color:var(--mut);font-size:14px;margin:0}
.botao{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;font-weight:800;font-size:17px;padding:16px;border-radius:14px;margin:0 0 10px;box-shadow:0 6px 18px rgba(16,24,40,.12)}
.botao.telegram{background:var(--tg);color:#fff}
.botao.blog{background:var(--cor);color:#fff}
.chamada{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:16px;margin:0 0 18px}
.chamada-titulo{font-size:17px;font-weight:800;line-height:1.25;margin:0 0 4px;text-align:center}.chamada-texto{font-size:14px;color:var(--mut);margin:0 0 14px;text-align:center}.chamada-mini{font-size:12px;color:var(--mut);margin:0;text-align:center}
.chamada .botao{margin-bottom:8px}
h2{font-size:17px;margin:26px 0 10px}
ul{list-style:none;margin:0;padding:0}
.oferta{display:flex;gap:12px;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:12px;margin:0 0 10px}
.oferta img,.semfoto{width:96px;height:96px;object-fit:contain;background:#fff;border-radius:12px;flex:none}
.semfoto{background:var(--bd)}
.info{min-width:0;flex:1}.titulo{margin:0 0 4px;font-size:14px;font-weight:600}
.preco{margin:0 0 8px;font-size:15px}.preco strong{font-size:20px}.preco s{color:var(--mut);font-size:13px}
.selo{display:inline-block;background:var(--cor);color:#fff;font-size:12px;font-weight:700;padding:1px 7px;border-radius:99px}
.selo.verde{background:var(--okbg);color:var(--ok)}
.ver{display:block;text-align:center;background:var(--lar);color:#fff;text-decoration:none;font-weight:700;padding:11px 10px;border-radius:10px}
.fim{margin-top:20px}
.busca{margin:0 0 14px}.busca label{display:block;font-weight:700;margin:0 0 6px}.busca input{width:100%;font:inherit;padding:13px 14px;border-radius:12px;border:2px solid var(--bd);background:var(--card);color:var(--tx)}.busca input:focus{outline:none;border-color:var(--cor)}.busca-info{font-size:13px;color:var(--mut);margin:6px 2px 0;min-height:1.2em}
.extra{display:none}.achou .extra{display:flex}.escondido,.achou .escondido{display:none}
.semresultado{background:var(--card);border:1px dashed var(--bd);border-radius:14px;padding:14px;text-align:center;color:var(--mut);font-size:14px}.semresultado.escondido{display:none}.semresultado a{color:var(--cor2);font-weight:700}
.vazio{text-align:center;color:var(--mut)}
.nota{color:var(--mut);font-size:12px;text-align:center;margin-top:22px}
</style>
</head>
<body>
<main>
  <header class="marca">
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M8 17l8-8h8v8l-8 8z" fill="#fff"/><circle cx="20.5" cy="11.5" r="2" fill="currentColor"/></svg>
    <h1>${esc(nome)}</h1>
    <p class="sub">Ofertas conferidas, com o preço do momento</p>
  </header>
  ${chamada}
  ${botoes.join('\n  ')}
  <h2>Ofertas em destaque</h2>
  ${cartoes ? buscador : ''}
  ${cartoes ? `<ul id="lista">\n${cartoes}\n</ul>` : vazio}
  ${cartoes ? semResultado : ''}
  ${chamadaFinal}
  <p class="nota">Publi: os links são de afiliado e o site pode ganhar uma comissão, sem custo extra para você. Preços e estoque podem mudar a qualquer momento. Atualizado em ${esc(atualizado)}.</p>
</main>
<script>
(function(){
  var q=document.getElementById('q'),lista=document.getElementById('lista'),box=document.getElementById('busca');
  if(!q||!lista)return;
  box.hidden=false;
  var info=document.getElementById('info'),nada=document.getElementById('nada'),itens=[].slice.call(lista.children);
  function limpar(s){return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();}
  function filtrar(){
    var termos=limpar(q.value).split(/\\s+/).filter(Boolean),achados=0;
    lista.className=termos.length?'achou':'';
    itens.forEach(function(li){
      var ok=termos.every(function(t){return (li.getAttribute('data-b')||'').indexOf(t)>-1;});
      li.classList.toggle('escondido',!ok);if(ok)achados++;
    });
    nada.classList.toggle('escondido',!(termos.length&&!achados));
    info.textContent=termos.length&&achados?achados+(achados===1?' oferta encontrada':' ofertas encontradas'):'';
  }
  q.addEventListener('input',filtrar);
})();
</script>
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
