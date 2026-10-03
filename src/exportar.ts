import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResultadoDoBlog } from './blog.ts';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';
import type { ResumoDaColeta } from './pipeline.ts';
import type { ResumoDoInstagram } from './instagram.ts';
import { conteudoSocialRecente } from './social.ts';

/** Quanto tempo uma mensagem de WhatsApp continua valendo (preço velho não deve ser postado). */
export const HORAS_DO_WHATSAPP = 12;

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
  ultimosPosts: Array<{ loja: string; titulo: string; preco: number; postadoEm: number }>;
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
    ultimosPosts: banco.ultimosPosts(15).map((p) => ({ loja: p.loja, titulo: p.titulo, preco: p.preco, postadoEm: p.postadoEm })),
  };
}

/**
 * Grava na pasta do blog o que o painel e o enviador do WhatsApp leem:
 * status.json, whatsapp.json e painel.html. Tudo público e sem segredos.
 */
export function publicarControle(banco: Banco, config: Config, dados: DadosDaRodada, agora: Date, repo = process.env.GITHUB_REPOSITORY ?? ''): void {
  const pasta = config.blog.pasta;
  mkdirSync(pasta, { recursive: true });
  const status = montarStatus(banco, config, dados, agora, repo);
  const mensagens = config.whatsapp.ativo
    ? banco.mensagensDoWhatsapp(HORAS_DO_WHATSAPP, agora).map((m) => ({ id: m.chave, criadoEm: m.criadoEm, loja: m.loja, texto: m.texto, imagem: m.imagem, link: m.link }))
    : [];
  writeFileSync(join(pasta, 'status.json'), JSON.stringify(status, null, 2), 'utf8');
  writeFileSync(join(pasta, 'whatsapp.json'), JSON.stringify({ atualizadoEm: agora.toISOString(), mensagens }, null, 2), 'utf8');
  writeFileSync(join(pasta, 'social.json'), JSON.stringify({ atualizadoEm: agora.toISOString(), itens: conteudoSocialRecente(banco, config, agora) }), 'utf8');
  writeFileSync(join(pasta, 'painel.html'), PAGINA_DO_PAINEL, 'utf8');
}

export const PAGINA_DO_PAINEL = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Painel do robô</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--tx:#1b1f27;--mut:#667085;--bd:#e4e7ec;--ok:#12805c;--okbg:#e3f5ee;--av:#a15c07;--avbg:#fdf0d9;--er:#b42318;--erbg:#fde7e4;--ac:#2457d6;--acbg:#e8eefc}
@media(prefers-color-scheme:dark){:root{--bg:#0f1218;--card:#181c25;--tx:#eceff4;--mut:#98a2b3;--bd:#2a3040;--ok:#4cc79a;--okbg:#12362b;--av:#f0b44c;--avbg:#3a2c0e;--er:#ff8a7e;--erbg:#3d1714;--ac:#7da2ff;--acbg:#1c2744}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
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
</style>
</head>
<body>
<main>
<header><div><h1>Painel do robô</h1><div class="sub" id="atualizado">Carregando…</div></div><span id="saude" class="pill of">…</span></header>
<div id="avisos"></div>
<div class="grid" id="numeros"></div>

<h2>Canais e lojas</h2>
<div class="chips" id="chips"></div>

<h2>Postagens nos últimos 7 dias</h2>
<div class="card"><div class="bars" id="barras"></div></div>

<h2>Controles</h2>
<div class="btns" id="controles"></div>
<p class="nota">Estes botões abrem o GitHub, onde o robô de fato roda. Só você (logado) consegue alterar algo. Esta página mostra apenas números e textos já públicos, nunca senhas.</p>

<h2>Ajustes atuais</h2>
<table id="ajustes"></table>

<h2>Últimas ofertas postadas</h2>
<table id="posts"></table>

<h2>Stories e Reels: conteúdo pronto</h2>
<div class="nota">Para cada oferta postada: a arte do Story (baixe em PNG), a legenda e o roteiro de 15 segundos. Publique no Instagram e no TikTok.</div>
<div class="social" id="social"></div>

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
  erros.forEach(([l,m])=>av.append(el('div','erro','Erro em '+l+': '+m)));
  if(idade>120)av.append(el('div','erro','A última rodada foi '+quando(t)+'. O normal é a cada 30 minutos. Veja a aba Actions do GitHub.'));
  ((s.blog&&s.blog.avisos)||[]).forEach(m=>av.append(el('div','aviso',m)));
((s.instagram&&s.instagram.avisos)||[]).forEach(m=>av.append(el('div','aviso',m)));
  const nums=[[s.fila,'ofertas na fila'],[s.postsHoje+' / '+s.maxPostsPorDia,'posts hoje'],[s.coleta?s.coleta.aprovadas+' de '+s.coleta.vistas:'-','aprovadas na última coleta'],[s.blog?s.blog.guias:'-','guias no ar'],[s.blog?s.blog.textosDeIA:'-','textos de IA na rodada'],[s.whatsappPendentes,'mensagens de WhatsApp na fila']].concat(s.instagram?[[s.instagram.feedHoje+' + '+s.instagram.storiesHoje,'Instagram hoje (feed + stories)']]:[]);
  const g=document.getElementById('numeros');
  nums.forEach(([n,l])=>{const c=el('div','card');c.append(el('div','n',String(n)),el('div','l',l));g.append(c)});
  const ch=document.getElementById('chips');
  [['Telegram',s.canais.telegram],['WhatsApp',s.canais.whatsapp],['Instagram',s.canais.instagram],['Blog',s.canais.blog],['Mercado Livre',s.lojas.mercadolivre],['Shopee',s.lojas.shopee],['Amazon',s.lojas.amazon]].forEach(([n,on])=>ch.append(el('span','pill '+(on?'ok':'of'),n+': '+(on?'ligado':'desligado'))));
  const max=Math.max(1,...s.postsPorDia.map(d=>d.posts));
  const b=document.getElementById('barras');
  s.postsPorDia.forEach(d=>{const x=el('div','bar');const i=el('i');i.style.height=Math.round(d.posts/max*80)+'px';x.append(i,el('div','',d.posts+''),el('div','',d.dia.slice(8)+'/'+d.dia.slice(5,7)));b.append(x)});
  const c=document.getElementById('controles');
  if(s.repo){
    const base='https://github.com/'+s.repo;
    [['Rodar agora',base+'/actions/workflows/robo.yml',''],['Editar ajustes',base+'/edit/main/ajustes.env','s'],['Ver rodadas',base+'/actions','s'],['Chaves (Secrets)',base+'/settings/secrets/actions','s']].forEach(([n,u,k])=>{const a=el('a','b '+k,n);a.href=u;a.target='_blank';a.rel='noopener';c.append(a)});
  }
  if(s.blogUrl){const a=el('a','b s','Abrir o blog');a.href=s.blogUrl;a.target='_blank';c.append(a)}
  if(s.telegramLink){const a=el('a','b s','Abrir o canal do Telegram');a.href=s.telegramLink;a.target='_blank';c.append(a)}
  const aj=document.getElementById('ajustes');
  Object.entries(s.ajustes).forEach(([k,v])=>{const r=el('tr');r.append(el('td','',k),el('td','',String(v)));aj.append(r)});
  const po=document.getElementById('posts');
  const th=el('tr');['Quando','Loja','Produto','Preço'].forEach(x=>th.append(el('th','',x)));po.append(th);
  s.ultimosPosts.forEach(p=>{const r=el('tr');r.append(el('td','',quando(p.postadoEm)),el('td','',p.loja),el('td','',p.titulo.slice(0,90)),el('td','',reais(p.preco)));po.append(r)});
  if(!s.ultimosPosts.length){const r=el('tr');r.append(el('td','','Nenhum post ainda.'));po.append(r)}
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
