import { existsSync, readFileSync } from 'node:fs';
import { linkAfiliadoAmazon } from './fontes/amazon.ts';

/**
 * Achadinhos da Amazon: produtos escolhidos à mão em amazon.json.
 * Sem a API da Amazon não mostramos preço (o contrato de Associados proíbe preço sem a API oficial):
 * só nome, uma explicação e o link de afiliado.
 */
export interface AchadoDaAmazon {
  asin: string;
  titulo: string;
  subtitulo?: string;
  descricao: string;
  /** Foto do produto (endereço da Amazon, usado direto, sem copiar). */
  imagem?: string;
}

export const TAG_PADRAO_DA_AMAZON = 'topfera-20';

function textoCurto(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** Lê e valida o arquivo. Entrada inválida é ignorada, nunca derruba o blog. */
export function lerAchadosDaAmazon(arquivo: string): AchadoDaAmazon[] {
  if (!existsSync(arquivo)) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return [];
  }
  const lista = Array.isArray(bruto) ? bruto : [];
  const achados: AchadoDaAmazon[] = [];
  for (const x of lista) {
    const o = (x ?? {}) as Record<string, unknown>;
    const asin = typeof o.asin === 'string' && /^[A-Z0-9]{10}$/i.test(o.asin.trim()) ? o.asin.trim().toUpperCase() : undefined;
    const titulo = textoCurto(o.titulo, 120);
    const descricao = textoCurto(o.descricao, 600);
    if (!asin || !titulo || !descricao) continue;
    const imagem = typeof o.imagem === 'string' && /^https:\/\/m\.media-amazon\.com\//.test(o.imagem) ? o.imagem : undefined;
    achados.push({ asin, titulo, subtitulo: textoCurto(o.subtitulo, 120), descricao, imagem });
  }
  return achados;
}

export function linkDoAchado(a: AchadoDaAmazon, tag: string): string {
  return linkAfiliadoAmazon(a.asin, tag || TAG_PADRAO_DA_AMAZON) ?? `https://www.amazon.com.br/dp/${a.asin}`;
}
