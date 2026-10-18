/**
 * O cadastro dos nichos: de onde cada loja puxa os produtos de cada um. Tudo que o robô busca "por nicho" parte daqui.
 * - Shopee: as categorias da API de afiliados (`productCatId`), que são os números das páginas de categoria da Shopee.
 * - Mercado Livre: as categorias da API (`/highlights` devolve os mais vendidos de cada uma).
 * Para o robô puxar só um nicho, use NICHOS_ATIVOS no ajustes.env (ex.: NICHOS_ATIVOS=pet).
 */
import { CATEGORIAS } from './categoria.ts';

export interface CategoriaDaShopee {
  id: number;
  nome: string;
  nicho: string;
}

/** Categorias da Shopee de cada nicho (nomes em inglês, como a API devolve). Uma categoria pode servir a mais de um nicho. */
export const CATEGORIAS_SHOPEE: Record<string, Array<{ id: number; nome: string }>> = {
  tech: [
    { id: 11059988, nome: 'Mobile & Gadgets' },
    { id: 11059971, nome: 'Audio' },
    { id: 11059977, nome: 'Computers & Accessories' },
    { id: 11059976, nome: 'Cameras & Drones' },
  ],
  casa: [
    { id: 11059984, nome: 'Home Appliances' },
    { id: 11059983, nome: 'Home & Construction' },
  ],
  games: [{ id: 11059980, nome: 'Gaming & Consoles' }],
  beleza: [
    { id: 11059974, nome: 'Beauty' },
    { id: 11059981, nome: 'Health' },
  ],
  moda: [
    { id: 11059998, nome: 'Women Clothes' },
    { id: 11059986, nome: 'Men Clothes' },
    { id: 11059999, nome: 'Women Shoes' },
    { id: 11059987, nome: 'Men Shoes' },
    { id: 11059997, nome: 'Women Bags' },
    { id: 11059985, nome: 'Men Bags' },
    { id: 11059996, nome: 'Watches' },
    { id: 11059978, nome: 'Fashion Accessories' },
  ],
  esporte: [{ id: 11059992, nome: 'Sports & Outdoors' }],
  pet: [{ id: 11059991, nome: 'Pets' }],
  bebe: [
    { id: 11059989, nome: 'Mom & Baby' },
    { id: 11059973, nome: 'Baby & Kids Fashion' },
    { id: 11059982, nome: 'Toys & Hobbies' },
  ],
  ferramentas: [{ id: 11059983, nome: 'Home & Construction' }],
};

/** Categorias do Mercado Livre de cada nicho (IDs da API de categorias do site MLB). */
export const CATEGORIAS_ML: Record<string, string[]> = {
  tech: ['MLB1000', 'MLB1051', 'MLB1648'],
  casa: ['MLB5726', 'MLB1574'],
  games: ['MLB1144'],
  beleza: ['MLB1246'],
  moda: ['MLB1430'],
  esporte: ['MLB1276'],
  pet: ['MLB1071'],
  bebe: ['MLB1384'],
  ferramentas: ['MLB263532'],
};

/** Os nichos que têm categoria nas lojas (todos menos "geral", que é o que não se encaixa em nenhum). */
export const NICHOS_DAS_LOJAS = CATEGORIAS.filter((n) => n !== 'geral');

/** As categorias da Shopee dos nichos dados, na ordem dos nichos, sem repetir categoria (o primeiro nicho que a cita fica com ela). */
export function categoriasShopeeDosNichos(nichos: string[]): CategoriaDaShopee[] {
  const vistos = new Set<number>();
  const lista: CategoriaDaShopee[] = [];
  for (const nicho of nichos) {
    for (const c of CATEGORIAS_SHOPEE[nicho] ?? []) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      lista.push({ ...c, nicho });
    }
  }
  return lista;
}

/** As categorias do Mercado Livre dos nichos dados, sem repetir. */
export function categoriasMlDosNichos(nichos: string[]): string[] {
  return [...new Set(nichos.flatMap((n) => CATEGORIAS_ML[n] ?? []))];
}
