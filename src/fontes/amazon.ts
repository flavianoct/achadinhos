import type { Fonte, Oferta } from '../types.ts';

/**
 * Amazon: fase 2.
 *
 * O link de afiliado é simples (basta a sua tag), e já está pronto abaixo.
 * A coleta automática de ofertas depende da Creators API da Amazon, que só é liberada
 * para contas de Associados com vendas qualificadas recentes. Enquanto a conta não
 * existir e não tiver esse acesso, esta fonte não coleta nada.
 */

const ASIN = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})(?:[/?]|$)/i;

export function extrairAsin(urlOuAsin: string): string | undefined {
  const s = urlOuAsin.trim();
  if (/^[A-Z0-9]{10}$/i.test(s)) return s.toUpperCase();
  return ASIN.exec(s)?.[1]?.toUpperCase();
}

/** Link limpo da Amazon Brasil com a sua tag de afiliado. */
export function linkAfiliadoAmazon(urlOuAsin: string, tag: string): string | undefined {
  const asin = extrairAsin(urlOuAsin);
  if (!asin || !tag) return undefined;
  return `https://www.amazon.com.br/dp/${asin}?tag=${encodeURIComponent(tag)}`;
}

export class FonteAmazon implements Fonte {
  nome = 'amazon' as const;
  private avisou = false;

  async coletar(): Promise<Oferta[]> {
    if (!this.avisou) {
      console.log('[amazon] coleta automática ainda não disponível (fase 2, depende do acesso à Creators API).');
      this.avisou = true;
    }
    return [];
  }
}
