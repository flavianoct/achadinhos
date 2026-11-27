// Espelho: o enviador escuta grupos de ofertas do WhatsApp em que o número já está, separa as mensagens que têm UM produto do
// Mercado Livre com preço claro e as publica na branch "espelho" do GitHub (espelho.json + fotos). O robô na nuvem lê dali,
// descobre o produto, troca pelo NOSSO código de afiliado e posta pelo fluxo normal. Aqui só entra lógica pura (testável sem WhatsApp).
import { createHash } from 'node:crypto';

/** O texto de uma mensagem do WhatsApp (texto simples, legenda de foto ou de vídeo). */
export function textoDaMensagem(msg) {
  const m = msg?.message;
  if (!m) return '';
  const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.documentWithCaptionMessage?.message ?? m;
  return String(inner.conversation ?? inner.extendedTextMessage?.text ?? inner.imageMessage?.caption ?? inner.videoMessage?.caption ?? '');
}

/** A mensagem traz foto? (a foto do produto vem junto com a legenda na maioria dos grupos de oferta). */
export const temFoto = (msg) => {
  const m = msg?.message;
  const inner = m?.ephemeralMessage?.message ?? m?.viewOnceMessage?.message ?? m?.documentWithCaptionMessage?.message ?? m;
  return Boolean(inner?.imageMessage);
};

const LIMPA_PONTA = /[)\]>.,;:!?"'*_~]+$/;

/** Links de produto do Mercado Livre no texto (curtos meli.la e /sec/, ou direto do produto). Busca e listas de categoria ficam de fora. */
export function linksDoML(texto) {
  const achados = [];
  for (const bruto of String(texto).match(/https?:\/\/[^\s<>]+/gi) ?? []) {
    const url = bruto.replace(LIMPA_PONTA, '');
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let ok = false;
    if (host === 'meli.la') ok = u.pathname.length > 2;
    else if (host === 'mercadolivre.com') ok = u.pathname.startsWith('/sec/');
    else if (host === 'mercadolivre.com.br' || host === 'produto.mercadolivre.com.br') ok = /\/p\/MLB\d{5,}|MLB-?\d{6,}/i.test(u.pathname + u.search);
    if (ok && !achados.includes(url)) achados.push(url);
  }
  return achados;
}

const REAIS = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g;
const paraNumero = (t) => Number(t.replace(/\./g, '').replace(',', '.'));

/**
 * O preço da oferta e o "de", se houver. Parcelas ("10x de R$ 89,90") não contam. "de R$ X por R$ Y" e "~R$ X~ R$ Y" dão os dois;
 * um preço só vale; vários preços sem esse padrão são ambíguos e a mensagem é descartada (undefined).
 */
export function precosDaMensagem(texto) {
  const t = String(texto).replace(/\d+\s*x\s*(?:de\s*)?R\$\s*[\d.,]+/gi, ' ');
  const dePor = /\bde:?\s*~?\s*R\$\s*([\d.,]+)\s*~?\s*(?:por|\bpor:?)\s*:?\s*R\$\s*([\d.,]+)/i.exec(t);
  if (dePor) {
    const de = paraNumero(dePor[1]);
    const por = paraNumero(dePor[2]);
    if (Number.isFinite(por) && por > 0) return { preco: por, precoOriginal: Number.isFinite(de) && de > por ? de : undefined };
  }
  const riscado = /~\s*R\$\s*([\d.,]+)\s*~[^R]{0,25}R\$\s*([\d.,]+)/.exec(t);
  if (riscado) {
    const de = paraNumero(riscado[1]);
    const por = paraNumero(riscado[2]);
    if (Number.isFinite(por) && por > 0) return { preco: por, precoOriginal: Number.isFinite(de) && de > por ? de : undefined };
  }
  const valores = [...new Set([...t.matchAll(REAIS)].map((m) => paraNumero(m[1])).filter((n) => Number.isFinite(n) && n > 0))];
  if (valores.length === 1) return { preco: valores[0] };
  return undefined;
}

/** O título: a primeira linha com cara de nome de produto (sem link, sem preço, sem só enfeite). */
export function tituloDaMensagem(texto) {
  for (const linha of String(texto).split(/\r?\n/)) {
    if (/https?:\/\//i.test(linha) || /R\$/.test(linha)) continue;
    const limpa = linha
      .replace(/[\p{Extended_Pictographic}‍️]/gu, ' ')
      .replace(/[*_~`>|]+/g, ' ')
      .replace(/^\s*(?:oferta|promo(?:ção|cao)?|achado|imperdível|corre|urgente|black friday)\s*[:!-]*\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const letras = (limpa.match(/\p{L}/gu) ?? []).length;
    if (limpa.length >= 10 && letras >= 8 && letras / limpa.length > 0.6) return limpa.slice(0, 160);
  }
  return undefined;
}

/** Id estável do item: o mesmo link não entra duas vezes. */
export const idDoItem = (link) => createHash('sha1').update(String(link).toLowerCase().replace(/[?#].*$/, '')).digest('hex').slice(0, 16);

/**
 * Transforma o texto de uma mensagem num item do espelho, ou undefined. Regras (conservadoras de propósito, para não postar preço
 * ou produto errado): exatamente UM link de produto do ML, um preço claro e um título.
 */
export function itemDaMensagem(texto, { grupo, agora = Date.now(), palavrasBloqueadas = [] } = {}) {
  const t = String(texto ?? '');
  const baixo = t.toLowerCase();
  if (palavrasBloqueadas.some((p) => p && baixo.includes(String(p).toLowerCase()))) return undefined;
  const links = linksDoML(t);
  if (links.length !== 1) return undefined;
  // Mensagem com link de outras lojas junto é lista de ofertas variadas: não dá para saber o preço de qual.
  const outrosLinks = (t.match(/https?:\/\/[^\s<>]+/gi) ?? []).filter((l) => !links.includes(l.replace(LIMPA_PONTA, '')) && !/whatsapp\.com|wa\.me/i.test(l));
  if (outrosLinks.length) return undefined;
  const precos = precosDaMensagem(t);
  if (!precos) return undefined;
  const titulo = tituloDaMensagem(t);
  if (!titulo) return undefined;
  return { id: idDoItem(links[0]), criadoEm: agora, grupo, titulo, preco: precos.preco, ...(precos.precoOriginal ? { precoOriginal: precos.precoOriginal } : {}), link: links[0] };
}

/** Mantém só os itens recentes (mais novos primeiro) e no máximo `maximo`. */
export function podarItens(itens, agora, idadeMaximaMs = 24 * 3_600_000, maximo = 40) {
  return [...itens].filter((i) => agora - i.criadoEm <= idadeMaximaMs).sort((a, b) => b.criadoEm - a.criadoEm).slice(0, maximo);
}

/**
 * Publica na branch "espelho" do repositório pela API do GitHub (token só com "Contents: leitura e escrita" neste repositório).
 * Cria a branch se não existir, grava as fotos novas, depois o espelho.json, e apaga as fotos que saíram da lista.
 */
export class PublicadorGitHub {
  constructor({ token, repo, branch = 'espelho', fetchFn = fetch, log = () => {} }) {
    Object.assign(this, { token, repo, branch, fetchFn, log });
  }

  async api(metodo, caminho, corpo) {
    const r = await this.fetchFn(`https://api.github.com/repos/${this.repo}${caminho}`, {
      method: metodo,
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', 'user-agent': 'achadinhos-enviador' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const texto = await r.text();
    let dados;
    try {
      dados = texto ? JSON.parse(texto) : undefined;
    } catch {
      dados = undefined;
    }
    return { status: r.status, ok: r.ok, dados };
  }

  async garantirBranch() {
    if ((await this.api('GET', `/git/ref/heads/${this.branch}`)).ok) return;
    const repo = await this.api('GET', '');
    const base = repo.dados?.default_branch ?? 'main';
    const ref = await this.api('GET', `/git/ref/heads/${base}`);
    const sha = ref.dados?.object?.sha;
    if (!sha) throw new Error(`não achei a branch ${base} (${ref.status})`);
    const criada = await this.api('POST', '/git/refs', { ref: `refs/heads/${this.branch}`, sha });
    if (!criada.ok) throw new Error(`não consegui criar a branch ${this.branch} (${criada.status})`);
  }

  async gravar(caminho, conteudoBase64, mensagem) {
    const atual = await this.api('GET', `/contents/${caminho}?ref=${this.branch}`);
    const r = await this.api('PUT', `/contents/${caminho}`, { message: mensagem, content: conteudoBase64, branch: this.branch, ...(atual.ok && atual.dados?.sha ? { sha: atual.dados.sha } : {}) });
    if (!r.ok) throw new Error(`falha ao gravar ${caminho} (${r.status})`);
  }

  /** itens: já podados. fotos: Map id -> Buffer JPEG das fotos ainda não enviadas. Devolve os itens com o endereço da foto. */
  async publicar(itens, fotos = new Map(), agora = Date.now()) {
    await this.garantirBranch();
    const base = `https://raw.githubusercontent.com/${this.repo}/${this.branch}`;
    const finais = [];
    for (const item of itens) {
      const arquivo = `fotos/${item.id}.jpg`;
      if (fotos.has(item.id)) {
        await this.gravar(arquivo, fotos.get(item.id).toString('base64'), 'Foto do espelho');
        item.foto = true;
      }
      finais.push({ ...item, ...(item.foto ? { imagem: `${base}/${arquivo}` } : {}) });
    }
    const json = JSON.stringify({ atualizadoEm: new Date(agora).toISOString(), itens: finais }, null, 2);
    await this.gravar('espelho.json', Buffer.from(json).toString('base64'), 'Espelho de ofertas');
    // Limpeza: fotos de itens que já saíram da lista.
    const lista = await this.api('GET', `/contents/fotos?ref=${this.branch}`);
    if (lista.ok && Array.isArray(lista.dados)) {
      const vivos = new Set(finais.map((i) => `${i.id}.jpg`));
      for (const f of lista.dados) {
        if (vivos.has(f.name)) continue;
        await this.api('DELETE', `/contents/fotos/${f.name}`, { message: 'Foto antiga do espelho', sha: f.sha, branch: this.branch });
      }
    }
    return finais;
  }
}
