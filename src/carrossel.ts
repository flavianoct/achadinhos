import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { diaDe, horaDe, type Banco } from './db.ts';
import { passaNoFiltroDoInstagram } from './instagram.ts';
import { svgDaCapaDoCarrossel, temaDaCategoria } from './moldes.ts';
import { arquivosDoCarrossel, baixarImagemComoDataUri, montarSvgDoSlide, renderizarPng, type DadosDoCarrossel, type Fetch } from './social.ts';
import type { OfertaAvaliada } from './types.ts';

const DIA_MS = 86_400_000;

/**
 * Escolhe os produtos do carrossel "Top N até R$ X". O teto de preço gira entre os dias (50, 100, 200...),
 * e só entram produtos que passam no filtro de qualidade do Instagram, com foto. Evita encher o carrossel de um
 * tipo só (no máximo 2 por categoria, a menos que faltem produtos). Se o teto do dia não tem produtos
 * suficientes, tenta o seguinte. `produtos` já vem do melhor para o pior.
 */
export function escolherParaCarrossel(produtos: OfertaAvaliada[], config: Config, agora: Date): { teto: number; ordem: OfertaAvaliada[] } | undefined {
  const ig = config.instagram;
  const n = ig.carrosselItens;
  if (ig.carrosselTetos.length === 0) return undefined;
  const volta = Math.floor(agora.getTime() / DIA_MS);
  for (let k = 0; k < ig.carrosselTetos.length; k++) {
    const teto = ig.carrosselTetos[(volta + k) % ig.carrosselTetos.length]!;
    const faixa = produtos.filter((o) => o.preco <= teto && /^https:\/\//i.test(o.link) && /^https:\/\//i.test(o.imagem ?? '') && passaNoFiltroDoInstagram(o, ig));
    if (faixa.length < n) continue;
    const porCategoria = new Map<string, number>();
    const variados = faixa.filter((o) => {
      const usados = porCategoria.get(o.categoria) ?? 0;
      if (usados >= 2) return false;
      porCategoria.set(o.categoria, usados + 1);
      return true;
    });
    // A ordem de tentativa: primeiro os variados, depois o resto (caso alguma foto falhe ou faltem categorias).
    const ordem = [...variados, ...faixa.filter((o) => !variados.includes(o))];
    return { teto, ordem };
  }
  return undefined;
}

/**
 * Cria o carrossel do dia (um só por dia), se o Instagram e o carrossel estiverem ligados e houver produtos bons.
 * As fotos ficam guardadas junto, para as imagens serem refeitas a cada rodada. Devolve true se criou um.
 */
export async function prepararCarrossel(banco: Banco, config: Config, agora: Date, fetchFn: Fetch = fetch): Promise<boolean> {
  const ig = config.instagram;
  if (!config.social.ativo || !ig.ativo || ig.carrosselPorDia <= 0) return false;
  if (banco.carrosselCriadoNoDia(agora)) return false;
  const hora = horaDe(agora);
  if (hora < config.ritmo.horaInicio || hora >= config.ritmo.horaFim) return false;

  const escolha = escolherParaCarrossel(banco.melhoresProdutos({ horas: 36, limite: 150 }, agora), config, agora);
  if (!escolha) return false;
  const itens: DadosDoCarrossel['itens'] = [];
  // No máximo 2n tentativas de foto: uma foto que não baixa só passa para o próximo produto.
  for (const oferta of escolha.ordem.slice(0, ig.carrosselItens * 2)) {
    if (itens.length >= ig.carrosselItens) break;
    const imagem = await baixarImagemComoDataUri(oferta.imagem, fetchFn);
    if (imagem) itens.push({ oferta, imagem });
  }
  if (itens.length < ig.carrosselItens) return false;

  const titulo = `Top ${itens.length} até R$ ${escolha.teto}`;
  const dados: DadosDoCarrossel = { titulo, teto: escolha.teto, itens };
  banco.salvarCarrossel(`carrossel-${diaDe(agora)}-${escolha.teto}`, titulo, JSON.stringify(dados), agora);
  return true;
}

/**
 * Grava em blog/social/ os PNGs do carrossel que está esperando para ser publicado (capa e um por produto).
 * Como o site é refeito inteiro a cada rodada, isso roda toda vez. Devolve quantos PNGs saíram.
 */
export async function gravarPngsDoCarrossel(banco: Banco, config: Config, agora: Date): Promise<number> {
  if (!config.social.ativo || !config.instagram.ativo) return 0;
  const pendente = banco.carrosselPendente(agora);
  if (!pendente) return 0;
  const dados = JSON.parse(pendente.dados) as DadosDoCarrossel;
  const pasta = join(config.blog.pasta, 'social');
  mkdirSync(pasta, { recursive: true });
  const nomes = arquivosDoCarrossel(pendente.chave, dados.itens.length);
  const capa = svgDaCapaDoCarrossel({ total: dados.itens.length, teto: dados.teto, fotos: dados.itens.map((i) => i.imagem), tema: temaDaCategoria('geral') });
  const svgs = [capa, ...dados.itens.map((it, i) => montarSvgDoSlide(it.oferta, it.imagem, i + 1, dados.itens.length))];
  let gravados = 0;
  for (let i = 0; i < svgs.length; i++) {
    const png = await renderizarPng(svgs[i]!, 1080);
    if (!png) return gravados; // sem o conversor de imagens não há o que gravar
    writeFileSync(join(pasta, nomes[i]!), png);
    gravados++;
  }
  return gravados;
}
