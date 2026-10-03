import type { Fonte, Oferta } from '../types.ts';

const link = (n: number) => `https://exemplo.invalid/oferta/${n}`;

/** Ofertas inventadas, só para ver o robô, o painel e o blog funcionando sem nenhuma chave. Os links não existem. */
export const OFERTAS_SIMULADAS: Oferta[] = [
  { loja: 'shopee', idProduto: 'T1', titulo: 'Fone de Ouvido Bluetooth TWS com Cancelamento de Ruído', preco: 89.9, desconto: 55, link: link(1), nota: 4.8, vendas: 12400, comissao: 0.1, nomeLoja: 'Loja Exemplo' },
  { loja: 'shopee', idProduto: 'T2', titulo: 'Air Fryer 4L Antiaderente 1500W', preco: 279.0, desconto: 38, link: link(2), nota: 4.9, vendas: 3100, comissao: 0.07 },
  { loja: 'shopee', idProduto: 'T3', titulo: 'Capinha de celular genérica', preco: 9.9, desconto: 70, link: link(3), nota: 4.7, vendas: 900 },
  { loja: 'shopee', idProduto: 'T4', titulo: 'Relógio Réplica Luxo Masculino', preco: 120.0, desconto: 60, link: link(4), nota: 4.6, vendas: 800 },
  { loja: 'shopee', idProduto: 'T5', titulo: 'Kit 10 Meias Esportivas', preco: 39.9, desconto: 12, link: link(5), nota: 4.8, vendas: 5000 },
  { loja: 'shopee', idProduto: 'T6', titulo: 'Liquidificador 1200W 12 Velocidades', preco: 149.9, desconto: 40, link: link(6), nota: 3.9, vendas: 2000 },
  { loja: 'mercadolivre', idProduto: 'MLB0001', titulo: 'SSD 1TB NVMe M.2 Leitura 3500MB/s', preco: 399.0, precoOriginal: 599.0, link: link(7), freteGratis: true },
  { loja: 'mercadolivre', idProduto: 'MLB0002', titulo: 'Controle Sem Fio Xbox Series Preto', preco: 349.0, precoOriginal: 499.0, link: link(8), freteGratis: true },
  { loja: 'shopee', idProduto: 'T7', titulo: 'Smartwatch à Prova d’Água com Monitor Cardíaco', preco: 129.9, desconto: 48, link: link(9), nota: 4.7, vendas: 8700, comissao: 0.08 },
  { loja: 'shopee', idProduto: 'T8', titulo: 'Carregador Turbo 33W USB-C com Cabo', preco: 34.9, desconto: 42, link: link(10), nota: 4.8, vendas: 21000, comissao: 0.06 },
  { loja: 'mercadolivre', idProduto: 'MLB0003', titulo: 'Mouse Gamer RGB 7200 DPI', preco: 59.9, precoOriginal: 99.9, link: link(11), freteGratis: false },
  { loja: 'shopee', idProduto: 'T9', titulo: 'Jogo de Panelas Antiaderente 5 Peças', preco: 189.9, desconto: 35, link: link(12), nota: 4.8, vendas: 1900, comissao: 0.07 },
  { loja: 'shopee', idProduto: 'T10', titulo: 'Cafeteira Elétrica 18 Xícaras', preco: 99.9, desconto: 30, link: link(13), nota: 4.7, vendas: 2400 },
  { loja: 'mercadolivre', idProduto: 'MLB0004', titulo: 'Aspirador de Pó Vertical 2 em 1 1100W', preco: 159.0, precoOriginal: 249.0, link: link(14), freteGratis: true },
  { loja: 'shopee', idProduto: 'T11', titulo: 'Kit Skincare Sérum Vitamina C + Hidratante Facial', preco: 49.9, desconto: 45, link: link(15), nota: 4.9, vendas: 6300, comissao: 0.12 },
  { loja: 'shopee', idProduto: 'T12', titulo: 'Tênis Esportivo Masculino Leve para Caminhada', preco: 119.9, desconto: 40, link: link(16), nota: 4.6, vendas: 4100 },
];

export class FonteSimulada implements Fonte {
  nome = 'simulada' as const;

  async coletar(): Promise<Oferta[]> {
    return OFERTAS_SIMULADAS;
  }
}
