// Carregado com "node --import" nos testes do modo nuvem: troca o fetch por respostas simuladas
// da Shopee, do Telegram e da IA do GitHub, para rodar o programa inteiro sem tocar na internet.
import { appendFileSync } from 'node:fs';

const registro = process.env.REGISTRO_DO_FETCH;
const anotar = (o) => registro && appendFileSync(registro, `${JSON.stringify(o)}\n`);
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (url, init = {}) => {
  const endereco = String(url);
  if (endereco.startsWith('https://open-api.affiliate.shopee.com.br/')) {
    anotar({ servico: 'shopee' });
    if (process.env.SHOPEE_FORA_DO_AR) return json({ errors: [{ message: 'x', extensions: { code: 10030 } }] });
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      itemId: 1000 + i,
      productName: `Fone Bluetooth Modelo ${i + 1}`,
      offerLink: `https://s.shopee.com.br/teste${i + 1}`,
      imageUrl: `https://img.exemplo/p${i + 1}.jpg`,
      priceMin: String(100 + i),
      priceDiscountRate: 60 - i,
      sales: 1000,
      ratingStar: '4.8',
      commissionRate: '0.1',
    }));
    return json({ data: { productOfferV2: { nodes, pageInfo: { hasNextPage: false } } } });
  }
  if (endereco.startsWith('https://api.telegram.org/')) {
    const corpo = JSON.parse(init.body);
    anotar({ servico: 'telegram', metodo: endereco.split('/').pop(), chat: corpo.chat_id, texto: corpo.caption ?? corpo.text });
    return json({ ok: true, result: {} });
  }
  if (endereco.startsWith('https://models.github.ai/')) {
    const corpo = JSON.parse(init.body);
    anotar({ servico: 'ia', auth: init.headers.authorization, modelo: corpo.model, prompt: corpo.messages?.[1]?.content });
    return json({ choices: [{ message: { content: 'Texto da IA de teste, escrito para ajudar o leitor a decidir a compra.' } }] });
  }
  throw new Error(`fetch inesperado nos testes: ${endereco}`);
};
