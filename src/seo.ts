import { createHash } from 'node:crypto';
import type { Config } from './config.ts';
import type { Banco } from './db.ts';

/**
 * Ajuda para os buscadores e as IAs acharem o blog: `llms.txt` (um resumo do site em Markdown, feito para as IAs lerem) e o IndexNow
 * (avisa o Bing e outros buscadores, que alimentam o ChatGPT Search e o Copilot, quando uma página nasce ou muda).
 */
export interface PaginaDoMapa {
  url: string;
  /** Quando a página mudou (ms). */
  alteradoEm: number;
}

/** A chave do IndexNow: fixa para o site (derivada do endereço), pública por definição (o arquivo dela fica no site). */
export function chaveDoIndexNow(urlDoBlog: string): string {
  return createHash('sha256').update(`indexnow:${urlDoBlog}`).digest('hex').slice(0, 32);
}

interface ItemDoResumo {
  titulo: string;
  url: string;
  nota?: string;
}

/** O `llms.txt`: o que é o site, as páginas principais (guias e ofertas do dia) e como o conteúdo é feito, em Markdown. */
export function llmsTxt(config: Config, guias: ItemDoResumo[], posts: ItemDoResumo[]): string {
  const b = config.blog;
  const linha = (i: ItemDoResumo) => `- [${i.titulo.replace(/[\[\]]/g, '')}](${i.url})${i.nota ? `: ${i.nota}` : ''}`;
  const partes = [
    `# ${b.nome}`,
    '',
    `> ${b.nome} é um blog brasileiro de ofertas e guias de compra. Um robô confere os preços das lojas (Shopee, Mercado Livre e Amazon) todos os dias, guarda o histórico de preço de 30 dias e só destaca o que está de fato mais barato. Os textos dos guias comparam produtos por nota, vendas e preço e dizem o que olhar antes de comprar. Os links de compra são de afiliado (o preço para quem compra é o mesmo).`,
    '',
    '## Como usar este conteúdo',
    '- Os preços mudam o tempo todo: cite sempre a data de atualização da página.',
    '- Cada guia "Melhores X" traz um comparativo, as escolhas do dia e perguntas frequentes.',
    '- Citar com link para a página de origem é bem-vindo.',
    '',
    '## Guias de compra',
    ...(guias.length ? guias.map(linha) : ['- (em breve)']),
    '',
    '## Ofertas do dia',
    ...(posts.length ? posts.map(linha) : ['- (em breve)']),
    '',
    '## Sobre',
    `- [Como escolhemos os produtos](${b.url}/sobre.html)`,
    `- [Todas as ofertas, por data](${b.url}/arquivo.html)`,
    `- [Feed RSS](${b.url}/feed.xml)`,
    '',
  ];
  return partes.join('\n');
}

const DIAS_SEM_REAVISAR = 0;

/** As páginas que mudaram desde o último aviso ao IndexNow (a chave guarda o carimbo da última versão avisada). */
export function paginasParaAvisar(banco: Banco, paginas: PaginaDoMapa[], agora: Date): PaginaDoMapa[] {
  return paginas.filter((p) => banco.textoSalvo(`indexnow:${p.url}`, 30 + DIAS_SEM_REAVISAR, agora) !== String(p.alteradoEm));
}

export interface ResumoDoIndexNow {
  avisadas: number;
  avisos: string[];
}

/**
 * Avisa o IndexNow das páginas novas ou alteradas (no máximo 100 por rodada, as mais recentes primeiro). Sem endereço público do blog
 * não faz nada. Um erro vira aviso e as páginas são tentadas de novo na próxima rodada.
 */
export async function avisarIndexNow(banco: Banco, config: Config, paginas: PaginaDoMapa[], agora: Date, fetchFn: typeof fetch = fetch): Promise<ResumoDoIndexNow> {
  const resumo: ResumoDoIndexNow = { avisadas: 0, avisos: [] };
  if (!/^https:\/\//.test(config.blog.url) || !config.blog.indexnow) return resumo;
  const novas = paginasParaAvisar(banco, paginas, agora)
    .sort((a, b) => b.alteradoEm - a.alteradoEm)
    .slice(0, 100);
  if (novas.length === 0) return resumo;
  const chave = chaveDoIndexNow(config.blog.url);
  try {
    const r = await fetchFn('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(config.blog.url).host, key: chave, keyLocation: `${config.blog.url}/${chave}.txt`, urlList: novas.map((p) => p.url) }),
      signal: AbortSignal.timeout(20_000),
    });
    // 200 e 202 = aceito. 422/403 = chave ou endereço recusado (o arquivo da chave ainda não está no ar: tenta na próxima rodada).
    if (r.status !== 200 && r.status !== 202) {
      resumo.avisos.push(`IndexNow recusou (${r.status}); tento de novo na próxima rodada.`);
      return resumo;
    }
    for (const p of novas) banco.salvarTexto(`indexnow:${p.url}`, String(p.alteradoEm), agora);
    resumo.avisadas = novas.length;
  } catch (e) {
    resumo.avisos.push(`IndexNow sem resposta: ${(e as Error).message}`);
  }
  return resumo;
}
