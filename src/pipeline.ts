import type { Config } from './config.ts';
import { horaDe, type Banco } from './db.ts';
import { montarMensagemWhatsapp } from './mensagem.ts';
import { contemPalavra, normalizar } from './categoria.ts';
import { avaliar } from './filtro.ts';
import { elegivelParaGuia, tipoDeGuia } from './guias.ts';
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
  | { postou: true; oferta: OfertaAvaliada }
  | { postou: false; motivo: 'fora do horário' | 'limite diário' | 'fila vazia' | 'erro'; detalhe?: string };

/** Posta a melhor oferta da fila, respeitando horário e limite diário. */
export async function postarProxima(publicador: Publicador, banco: Banco, config: Config, agora: Date = new Date()): Promise<ResultadoDoPost> {
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return { postou: false, motivo: 'fora do horário' };
  if (banco.postsNoDia(agora) >= config.ritmo.maxPostsPorDia) return { postou: false, motivo: 'limite diário' };

  banco.limparFilaAntiga(HORAS_NA_FILA, agora);
  const oferta = banco.melhorDaFila(banco.ultimaLojaPostada());
  if (!oferta) return { postou: false, motivo: 'fila vazia' };

  try {
    await publicador.publicar(oferta);
  } catch (e) {
    // Erro definitivo (post inválido): tira da fila para não travar. Erro de rede: fica para a próxima.
    if (e instanceof ErroTelegram && e.permanente) banco.removerDaFila(oferta.loja, oferta.idProduto);
    return { postou: false, motivo: 'erro', detalhe: (e as Error).message };
  }

  banco.registrarPost(oferta, agora);
  // A mesma oferta que saiu no Telegram também vira mensagem de WhatsApp (o enviador do PC é quem posta).
  if (config.whatsapp.ativo) banco.guardarParaWhatsapp(oferta, montarMensagemWhatsapp(oferta), agora);
  if (config.social.ativo) banco.guardarParaSocial(oferta, agora);
  banco.removerDaFila(oferta.loja, oferta.idProduto);
  return { postou: true, oferta };
}
