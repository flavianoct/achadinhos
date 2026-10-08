import type { Config } from './config.ts';
import { horaDe, type Banco } from './db.ts';
import { convitePeloInstagram, escaparHtml, montarMensagemWhatsapp } from './mensagem.ts';
import { escolherCampanha, type Campanha, type ItemVendido } from './shopee-extra.ts';
import { chaveDoCupom, escolherCupom, type Cupom } from './cupons.ts';
import { categorizar, contemPalavra, normalizar } from './categoria.ts';
import { avaliar } from './filtro.ts';
import { elegivelParaGuia, tipoDeGuia } from './guias.ts';
import { destinosDaOferta, geralAceita, nichosNoLimite, temWhatsappDoNicho } from './rotas.ts';
import { ErroTelegram, type Publicador } from './telegram.ts';
import type { Fonte, OfertaAvaliada } from './types.ts';

/** Oferta parada na fila por mais tempo que isso é descartada (o preço pode ter mudado). */
const HORAS_NA_FILA = 6;

export interface ResumoDaColeta {
  coletadas: number;
  aprovadas: number;
  reprovadasPorMotivo: Record<string, number>;
  errosPorFonte: Record<string, string>;
}

/** Busca ofertas em todas as lojas, guarda os preços no histórico e enfileira as aprovadas. */
export async function coletar(fontes: Fonte[], banco: Banco, config: Config, agora: Date = new Date()): Promise<ResumoDaColeta> {
  const resumo: ResumoDaColeta = { coletadas: 0, aprovadas: 0, reprovadasPorMotivo: {}, errosPorFonte: {} };

  for (const fonte of fontes) {
    let ofertas;
    try {
      ofertas = await fonte.coletar();
    } catch (e) {
      // Uma loja com problema não derruba as outras.
      resumo.errosPorFonte[fonte.nome] = (e as Error).message;
      banco.registrarSaudeFonte(fonte.nome, (e as Error).message, agora);
      continue;
    }
    // Loja que responde mas devolve zero ofertas também conta como falha (o site pode ter mudado sem dar erro).
    banco.registrarSaudeFonte(fonte.nome, ofertas.length === 0 ? 'respondeu, mas sem nenhuma oferta' : undefined, agora);
    resumo.coletadas += ofertas.length;

    for (const oferta of ofertas) {
      const resultado = avaliar(oferta, banco, config, agora);
      // O preço entra no histórico mesmo quando a oferta é reprovada: é assim que detectamos quedas depois.
      if (Number.isFinite(oferta.preco) && oferta.preco > 0 && oferta.idProduto) banco.registrarPreco(oferta, agora);

      // Os guias "Melhores X" usam todo produto de boa avaliação, mesmo sem desconto grande: guia é sobre qualidade, não só promoção.
      const tipo = tipoDeGuia(oferta.titulo);
      const bloqueada = config.filtro.palavrasBloqueadas.some((p) => contemPalavra(normalizar(oferta.titulo), p));
      if (tipo && !bloqueada && elegivelParaGuia(oferta, config.filtro.notaMinima)) banco.guardarParaGuia(tipo.slug, oferta, agora);

      // Toda oferta boa fica guardada como produto: é disso que o blog monta as listas "Top N".
      if (resultado.oferta) banco.guardarProduto(resultado.oferta, agora);

      if (resultado.aprovada) {
        banco.enfileirar(resultado.oferta, agora);
        resumo.aprovadas++;
      } else {
        const chave = resultado.motivo.split(':')[0];
        resumo.reprovadasPorMotivo[chave] = (resumo.reprovadasPorMotivo[chave] ?? 0) + 1;
      }
    }
  }
  return resumo;
}

export type ResultadoDoPost =
  | { postou: true; oferta: OfertaAvaliada; canais: string[]; avisos: string[] }
  | { postou: false; motivo: 'fora do horário' | 'limite diário' | 'fila vazia' | 'nichos no limite' | 'erro'; detalhe?: string };

/** Posta a melhor oferta da fila, respeitando horário e limite diário. */
export async function postarProxima(publicador: Publicador, banco: Banco, config: Config, agora: Date = new Date()): Promise<ResultadoDoPost> {
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return { postou: false, motivo: 'fora do horário' };
  if (banco.postsNoDia(agora) >= config.ritmo.maxPostsPorDia) return { postou: false, motivo: 'limite diário' };

  banco.limparFilaAntiga(HORAS_NA_FILA, agora);
  // Oferta de um nicho que não tem canal próprio e que o filtro do canal geral recusa não vai a lugar nenhum:
  // sai da fila e a próxima é tentada.
  let oferta: OfertaAvaliada | undefined;
  let destinos: string[] = [];
  const cheios = nichosNoLimite(banco.postsPorCategoria(1, agora), config);
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    oferta = banco.melhorDaFila(banco.ultimaLojaPostada(), cheios);
    if (!oferta) break;
    destinos = destinosDaOferta(oferta.categoria, config);
    // Sem canal no Telegram, mas com grupo ou canal de WhatsApp do nicho: vai só para o WhatsApp.
    if (destinos.length || temWhatsappDoNicho(oferta.categoria, config)) break;
    banco.removerDaFila(oferta.loja, oferta.idProduto);
    oferta = undefined;
  }
  if (!oferta) return { postou: false, motivo: cheios.length && banco.tamanhoDaFila() > 0 ? 'nichos no limite' : 'fila vazia' };

  // Roteamento por nicho: o canal da categoria da oferta; sem rota, o canal geral (se o filtro dele aceitar).
  const geral = config.telegram.chatId;
  const canais: string[] = [];
  const avisos: string[] = [];
  for (const destino of destinos) {
    try {
      await publicador.publicar(oferta, destino);
      canais.push(destino);
    } catch (e) {
      const permanente = e instanceof ErroTelegram && e.permanente;
      if (permanente && destino !== geral && !canais.includes(geral) && geralAceita(oferta.categoria, config)) {
        // O canal do nicho recusou (bot sem permissão, canal apagado): a oferta não se perde, vai para o canal geral.
        avisos.push(`canal ${destino} recusou (${(e as Error).message}); enviada ao canal geral`);
        try {
          await publicador.publicar(oferta, geral);
          canais.push(geral);
          continue;
        } catch (e2) {
          if (e2 instanceof ErroTelegram && e2.permanente) banco.removerDaFila(oferta.loja, oferta.idProduto);
          return { postou: false, motivo: 'erro', detalhe: (e2 as Error).message };
        }
      }
      // Erro definitivo (post inválido): tira da fila para não travar. Erro de rede: fica para a próxima.
      if (permanente) banco.removerDaFila(oferta.loja, oferta.idProduto);
      if (canais.length === 0) return { postou: false, motivo: 'erro', detalhe: (e as Error).message };
      avisos.push(`canal ${destino} falhou (${(e as Error).message}) depois de postar em ${canais.join(', ')}`);
    }
  }

  banco.registrarPost(oferta, agora, canais[0] ?? 'whatsapp');
  // A mesma oferta que saiu no Telegram também vira mensagem de WhatsApp (o enviador do PC é quem posta e escolhe os
  // grupos e canais pelo nicho dela).
  if (config.whatsapp.ativo) banco.guardarParaWhatsapp(oferta, montarMensagemWhatsapp(oferta, convitePeloInstagram(config)), agora);
  if (config.social.ativo) banco.guardarParaSocial(oferta, agora);
  banco.removerDaFila(oferta.loja, oferta.idProduto);
  return { postou: true, oferta, canais, avisos };
}

export type ResultadoDoCupom =
  | { postou: true; cupom: Cupom }
  | { postou: false; motivo: 'desligado' | 'fora do horário' | 'limite diário' | 'sem cupom' | 'erro'; detalhe?: string };

/** Posta o próximo cupom vigente, respeitando horário e o limite de cupons por dia. */
export async function postarProximoCupom(publicador: Publicador, banco: Banco, cupons: Cupom[], config: Config, agora: Date = new Date()): Promise<ResultadoDoCupom> {
  if (!config.cupons.ativo || !publicador.publicarCupom) return { postou: false, motivo: 'desligado' };
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return { postou: false, motivo: 'fora do horário' };
  if (banco.cuponsNoDia(agora) >= config.cupons.porDia) return { postou: false, motivo: 'limite diário' };
  const cupom = escolherCupom(cupons, (chave) => banco.ultimoPostDeCupom(chave), config.cupons.repetirDias, agora);
  if (!cupom) return { postou: false, motivo: 'sem cupom' };
  try {
    await publicador.publicarCupom(cupom);
  } catch (e) {
    return { postou: false, motivo: 'erro', detalhe: (e as Error).message };
  }
  banco.registrarCupom(chaveDoCupom(cupom), agora);
  return { postou: true, cupom };
}

/**
 * Lê as vendas da Shopee e grava por nicho: o nicho é o que o robô deu ao produto quando o postou ou, se ele não foi
 * postado (a pessoa comprou outra coisa depois do clique), o que o classificador dá pelo nome. Lê no máximo a cada
 * VENDAS_HORAS horas. Devolve quantos itens foram lidos, ou undefined se não era hora.
 */
export async function atualizarVendas(buscar: (dias: number) => Promise<ItemVendido[]>, banco: Banco, config: Config, agora: Date = new Date()): Promise<number | undefined> {
  if (!config.vendas.ativo) return undefined;
  if (banco.textoSalvo('vendas:lidas', config.vendas.horasEntreLeituras / 24, agora)) return undefined;
  const itens = await buscar(config.vendas.dias);
  for (const v of itens) {
    const categoria = banco.categoriaPostada('shopee', v.itemId) ?? categorizar(v.nome);
    banco.guardarVenda({ ...v, loja: 'shopee', categoria });
  }
  banco.salvarTexto('vendas:lidas', agora.toISOString(), agora);
  return itens.length;
}

export function montarMensagemCampanha(c: Campanha): string {
  const linhas = ['🛍️ <b>CAMPANHA SHOPEE</b>', '', `🔥 <b>${escaparHtml(c.nome)}</b>`];
  if (c.fim) {
    const fim = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(c.fim));
    linhas.push(`⏰ Até ${fim}`);
  }
  linhas.push('', 'Ofertas e cupons da própria Shopee, reunidos numa página só.', '', `👉 ${escaparHtml(c.link)}`, '', '<i>Preços e cupons sujeitos à disponibilidade.</i>');
  return linhas.join('\n');
}

export type ResultadoDaCampanha = { postou: true; campanha: Campanha } | { postou: false; motivo: 'desligado' | 'fora do horário' | 'limite diário' | 'sem campanha' | 'erro'; detalhe?: string };

/** Posta no canal geral uma campanha da Shopee em vigor que não saiu nos últimos CAMPANHAS_REPETIR_DIAS dias. */
export async function postarCampanha(publicador: Publicador, buscar: () => Promise<Campanha[]>, banco: Banco, config: Config, agora: Date = new Date()): Promise<ResultadoDaCampanha> {
  if (config.campanhas.porDia <= 0 || !publicador.publicarAviso) return { postou: false, motivo: 'desligado' };
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return { postou: false, motivo: 'fora do horário' };
  if (banco.campanhasNoDia(agora) >= config.campanhas.porDia) return { postou: false, motivo: 'limite diário' };
  try {
    const campanha = escolherCampanha(await buscar(), (id) => banco.ultimoPostDeCampanha(id), config.campanhas.repetirDias, agora);
    if (!campanha) return { postou: false, motivo: 'sem campanha' };
    await publicador.publicarAviso({ texto: montarMensagemCampanha(campanha), botao: '🛍️ Ver a campanha', url: campanha.link, imagem: campanha.imagem }, config.telegram.chatId);
    banco.registrarCampanha(campanha.id, agora);
    return { postou: true, campanha };
  } catch (e) {
    return { postou: false, motivo: 'erro', detalhe: (e as Error).message };
  }
}
