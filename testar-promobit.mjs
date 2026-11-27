// Teste de verdade da fonte Promobit: roda a mesma coleta que o robô roda e mostra as ofertas que chegariam,
// com foto (conferida), preço e o link final. Não posta nada e não grava nada. Do ML, só abre a vitrine de afiliado do Promobit
// (o destino do link curto) para saber qual é o produto; a página do produto nunca é aberta.
// Os códigos de afiliado aqui são de mentira (MEU_WORD / MEU_TOOL / minhatag-20), só para mostrar onde entram.
import { coletarPromobit } from './src/fontes/promobit.ts';

async function conferirFoto(url) {
  if (!url) return 'sem foto';
  try {
    const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    const tipo = r.headers.get('content-type') ?? '?';
    const tamanho = (await r.arrayBuffer()).byteLength;
    return `${r.status} ${tipo} ${Math.round(tamanho / 1024)} KB`;
  } catch (e) {
    return `erro ${e.message}`;
  }
}

async function rodar(rotulo, afiliados, maximo) {
  const inicio = Date.now();
  const r = await coletarPromobit({ afiliados, maximo });
  console.log(`\n===== ${rotulo}: ${r.lidas} lidas, ${r.ofertas.length} prontas, ${r.semLink} sem link, ${((Date.now() - inicio) / 1000).toFixed(1)} s${r.erro ? ` | erro: ${r.erro}` : ''}`);
  for (const o of r.ofertas) {
    const de = o.precoOriginal ? ` (de R$ ${o.precoOriginal.toFixed(2)}, -${o.desconto}%)` : '';
    console.log(`\n- [${o.loja} ${o.idProduto}] ${o.titulo}\n  R$ ${o.preco.toFixed(2)}${de}\n  foto: ${o.imagem} -> ${await conferirFoto(o.imagem)}\n  link: ${o.link}`);
  }
  return r;
}

const ml = await rodar('Mercado Livre', { mercadolivre: { mattWord: 'MEU_WORD', mattTool: 'MEU_TOOL' } }, 15);
await rodar('Amazon (só teste; no robô fica desligada)', { amazon: { tag: 'minhatag-20' } }, 4);

const problemas = ml.ofertas.filter((o) => !/^https:\/\/[\w.]*mercadolivre\.com\.br\//.test(o.link) || !o.link.includes('matt_word=MEU_WORD') || !o.link.includes('matt_tool=MEU_TOOL') || /matt_word=(?!MEU_WORD)/.test(o.link));
if (!ml.ofertas.length || problemas.length) {
  console.log(`\nFALHOU: ${ml.ofertas.length} ofertas do ML; ${problemas.length} com link errado.`);
  process.exit(1);
}
console.log(`\nOK: ${ml.ofertas.length} ofertas do ML com o link de afiliado certo.`);
