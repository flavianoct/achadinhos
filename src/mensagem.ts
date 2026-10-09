import type { Config } from './config.ts';
import type { OfertaAvaliada } from './types.ts';

const NOME_DA_LOJA: Record<string, string> = {
  shopee: 'Shopee',
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
};

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarPreco(valor: number): string {
  // O Intl usa espaço não separável depois de "R$"; trocamos por espaço comum.
  return reais.format(valor).replace(/ /g, ' ');
}

export function formatarVendas(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} mi`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`;
  return String(n);
}

/** O Telegram interpreta HTML; estes caracteres precisam ser escapados. */
export function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function encurtar(s: string, max: number): string {
  const limpo = s.replace(/\s+/g, ' ').trim();
  return limpo.length <= max ? limpo : `${limpo.slice(0, max - 1).trimEnd()}…`;
}

/** Texto do post (HTML do Telegram). Cabe no limite de 1024 caracteres da legenda de foto. */
export function montarMensagem(o: OfertaAvaliada): string {
  const linhas: string[] = [];
  linhas.push(`🔥 <b>${escaparHtml(encurtar(o.titulo, 140))}</b>`);
  linhas.push('');

  if (o.precoOriginal && o.precoOriginal > o.preco) {
    linhas.push(`<s>De ${formatarPreco(o.precoOriginal)}</s>`);
  }
  const selo = o.desconto && o.desconto > 0 ? ` (-${Math.round(o.desconto)}%)` : '';
  linhas.push(`💰 <b>Por ${formatarPreco(o.preco)}</b>${selo}`);

  if (o.menorPrecoEmDias) linhas.push(`📉 Menor preço em ${o.menorPrecoEmDias} dias`);
  if (o.freteGratis) linhas.push('🚚 Frete grátis');

  const social: string[] = [];
  if (o.nota && o.nota > 0) social.push(`⭐ ${o.nota.toFixed(1).replace('.', ',')}`);
  if (o.vendas && o.vendas > 0) social.push(`${formatarVendas(o.vendas)} vendidos`);
  if (social.length) linhas.push(social.join(' · '));

  linhas.push(`🏬 ${NOME_DA_LOJA[o.loja] ?? o.loja}`);
  linhas.push('');
  linhas.push(`👉 ${escaparHtml(o.link)}`);
  linhas.push('');
  linhas.push(`#${o.categoria} · <i>preço pode mudar a qualquer momento</i>`);
  return linhas.join('\n');
}

/**
 * Texto do WhatsApp: formatação própria (*negrito*, ~riscado~, _itálico_) e o link solto,
 * porque o WhatsApp não tem botão como o Telegram.
 */
/**
 * Rodapé discreto das ofertas do WhatsApp: leva quem está no grupo ou no canal para o Telegram e o Instagram, se quiser seguir também.
 * Duas linhas curtas, depois do link da oferta (a prévia do link continua sendo a do produto). Vazio se nenhum dos dois estiver configurado.
 */
export function rodapeDoWhatsapp(config: Config): string {
  if (!config.whatsapp.rodape) return '';
  const curto = (l: string) => l.replace(/^https:\/\/(www\.)?/, '');
  const linhas: string[] = [];
  if (config.blog.telegramLink) linhas.push(`✈️ Telegram: ${curto(config.blog.telegramLink)}`);
  if (config.blog.instagramLink) linhas.push(`📸 Instagram: ${curto(config.blog.instagramLink)}`);
  return linhas.length ? `Quer seguir também?\n${linhas.join('\n')}` : '';
}

/**
 * Troca o rodapé de uma mensagem já guardada pelo rodapé atual (a mensagem guarda os links do dia em que foi criada).
 * Assim, se o @ do Instagram ou o canal do Telegram mudar, o que ainda está na fila do WhatsApp sai com o link novo.
 */
export function atualizarRodape(texto: string, config: Config): string {
  const i = texto.indexOf('\n\nQuer seguir também?\n');
  if (i < 0) return texto;
  const rodape = rodapeDoWhatsapp(config);
  return rodape ? `${texto.slice(0, i)}\n\n${rodape}` : texto.slice(0, i);
}

/** `rodape` é o texto extra no fim (veja rodapeDoWhatsapp); vazio = a mensagem não muda. */
export function montarMensagemWhatsapp(o: OfertaAvaliada, rodape = ''): string {
  const linhas: string[] = [];
  linhas.push(`🔥 *${encurtar(o.titulo, 140).replace(/[*_~]/g, '')}*`);
  linhas.push('');
  if (o.precoOriginal && o.precoOriginal > o.preco) linhas.push(`~De ${formatarPreco(o.precoOriginal)}~`);
  const selo = o.desconto && o.desconto > 0 ? ` (-${Math.round(o.desconto)}%)` : '';
  linhas.push(`💰 *Por ${formatarPreco(o.preco)}*${selo}`);
  if (o.menorPrecoEmDias) linhas.push(`📉 Menor preço em ${o.menorPrecoEmDias} dias`);
  if (o.freteGratis) linhas.push('🚚 Frete grátis');
  const social: string[] = [];
  if (o.nota && o.nota > 0) social.push(`⭐ ${o.nota.toFixed(1).replace('.', ',')}`);
  if (o.vendas && o.vendas > 0) social.push(`${formatarVendas(o.vendas)} vendidos`);
  if (social.length) linhas.push(social.join(' · '));
  linhas.push(`🏬 ${NOME_DA_LOJA[o.loja] ?? o.loja}`);
  linhas.push('');
  linhas.push(`👉 ${o.link}`);
  linhas.push('');
  linhas.push('_Preço pode mudar a qualquer momento._');
  if (rodape) linhas.push('', rodape);
  return linhas.join('\n');
}
