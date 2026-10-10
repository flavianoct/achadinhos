import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Robo } from './robo.ts';
import type { Loja } from './types.ts';

interface Campo {
  chave: string;
  rotulo: string;
  grupo: string;
  tipo: 'texto' | 'numero' | 'simnao' | 'segredo' | 'opcao';
  padrao: string;
  ajuda?: string;
  opcoes?: Array<{ valor: string; rotulo: string }>;
}

/** Tudo o que dá para ajustar pelo painel. A ordem aqui é a ordem na tela. */
export const CAMPOS: Campo[] = [
  { grupo: 'Telegram', chave: 'TELEGRAM_BOT_TOKEN', rotulo: 'Token do bot', tipo: 'segredo', padrao: '', ajuda: 'Criado no @BotFather.' },
  { grupo: 'Telegram', chave: 'TELEGRAM_CHAT_ID', rotulo: 'Canal', tipo: 'texto', padrao: '', ajuda: '@nomedocanal ou o ID numérico. O bot precisa ser administrador.' },

  { grupo: 'Shopee', chave: 'SHOPEE_ATIVO', rotulo: 'Usar a Shopee', tipo: 'simnao', padrao: '1' },
  { grupo: 'Shopee', chave: 'SHOPEE_APP_ID', rotulo: 'App ID', tipo: 'texto', padrao: '' },
  { grupo: 'Shopee', chave: 'SHOPEE_SECRET', rotulo: 'Secret', tipo: 'segredo', padrao: '' },
  { grupo: 'Shopee', chave: 'SHOPEE_PALAVRAS', rotulo: 'Buscas extras', tipo: 'texto', padrao: '', ajuda: 'Separadas por vírgula. Ex.: fone bluetooth, air fryer' },
  { grupo: 'Shopee', chave: 'SHOPEE_PAGINAS', rotulo: 'Páginas por rodada', tipo: 'numero', padrao: '2', ajuda: '50 ofertas por página.' },

  { grupo: 'Mercado Livre', chave: 'ML_ATIVO', rotulo: 'Usar o Mercado Livre', tipo: 'simnao', padrao: '0' },
  { grupo: 'Mercado Livre', chave: 'ML_MATT_WORD', rotulo: 'matt_word', tipo: 'texto', padrao: '', ajuda: 'Copie da URL de um link de afiliado gerado no painel do Mercado Livre.' },
  { grupo: 'Mercado Livre', chave: 'ML_MATT_TOOL', rotulo: 'matt_tool', tipo: 'texto', padrao: '' },
  { grupo: 'Mercado Livre', chave: 'ML_PAGINAS', rotulo: 'Páginas de ofertas por rodada', tipo: 'numero', padrao: '3', ajuda: 'Cerca de 48 produtos por página.' },
  { grupo: 'Mercado Livre', chave: 'ML_PAGINAS_DE_CATEGORIA', rotulo: 'Páginas que vão para categorias', tipo: 'numero', padrao: '2', ajuda: 'Do total acima, quantas leem ofertas de uma categoria em rodízio (0 = só a vitrine geral).' },
  { grupo: 'Mercado Livre', chave: 'ML_API_CATEGORIAS_POR_RODADA', rotulo: 'Categorias lidas pela API por rodada', tipo: 'numero', padrao: '6', ajuda: 'A API lê as categorias abaixo e as subcategorias delas em rodízio; cada uma traz até 20 mais vendidos (2 pedidos por produto).' },
  { grupo: 'Mercado Livre', chave: 'ML_CATEGORIAS', rotulo: 'Categorias do rodízio', tipo: 'texto', padrao: 'MLB1000,MLB1051,MLB1648,MLB5726,MLB1574,MLB1144,MLB1246,MLB1276', ajuda: 'IDs MLB separados por vírgula.' },

  { grupo: 'Amazon', chave: 'AMAZON_ATIVO', rotulo: 'Usar a Amazon', tipo: 'simnao', padrao: '0', ajuda: 'Ainda não coleta sozinha (depende da Creators API).' },

  { grupo: 'Filtro de ofertas', chave: 'DESCONTO_MINIMO', rotulo: 'Desconto mínimo (%)', tipo: 'numero', padrao: '25' },
  { grupo: 'Filtro de ofertas', chave: 'QUEDA_MINIMA', rotulo: 'Queda mínima no histórico (%)', tipo: 'numero', padrao: '10', ajuda: 'Também aprova a oferta, mesmo sem desconto anunciado.' },
  { grupo: 'Filtro de ofertas', chave: 'PRECO_MINIMO', rotulo: 'Preço mínimo (R$)', tipo: 'numero', padrao: '15' },
  { grupo: 'Filtro de ofertas', chave: 'PRECO_MAXIMO', rotulo: 'Preço máximo (R$)', tipo: 'numero', padrao: '5000' },
  { grupo: 'Filtro de ofertas', chave: 'NOTA_MINIMA', rotulo: 'Nota mínima (0 a 5)', tipo: 'numero', padrao: '4.5' },
  { grupo: 'Filtro de ofertas', chave: 'VENDAS_MINIMAS', rotulo: 'Vendas mínimas', tipo: 'numero', padrao: '50' },
  { grupo: 'Filtro de ofertas', chave: 'PALAVRAS_BLOQUEADAS', rotulo: 'Palavras bloqueadas', tipo: 'texto', padrao: 'réplica,replica,usado,recondicionado,erótico', ajuda: 'Separadas por vírgula.' },
  { grupo: 'Filtro de ofertas', chave: 'DIAS_SEM_REPETIR', rotulo: 'Dias sem repetir o produto', tipo: 'numero', padrao: '7' },

  { grupo: 'Ritmo', chave: 'MINUTOS_ENTRE_COLETAS', rotulo: 'Minutos entre coletas', tipo: 'numero', padrao: '30' },
  { grupo: 'Ritmo', chave: 'MINUTOS_ENTRE_POSTS', rotulo: 'Minutos entre posts', tipo: 'numero', padrao: '12' },
  { grupo: 'Ritmo', chave: 'HORA_INICIO', rotulo: 'Começa a postar às (hora)', tipo: 'numero', padrao: '8' },
  { grupo: 'Ritmo', chave: 'HORA_FIM', rotulo: 'Para de postar às (hora)', tipo: 'numero', padrao: '23' },
  { grupo: 'Ritmo', chave: 'MAX_POSTS_POR_DIA', rotulo: 'Máximo de posts por dia', tipo: 'numero', padrao: '60' },
  { grupo: 'Ritmo', chave: 'POSTS_POR_RODADA', rotulo: 'Posts por rodada (modo nuvem)', tipo: 'numero', padrao: '2' },

  { grupo: 'Nichos e canais', chave: 'ROTAS_TELEGRAM', rotulo: 'Canal do Telegram por nicho', tipo: 'texto', padrao: '', ajuda: 'nicho=canal, separados por vírgula. Ex.: tech=@canaltech,moda=@canalmoda. Nichos: tech, games, moda, casa, esporte, beleza, bebe, pet, ferramentas, geral.' },
  { grupo: 'Nichos e canais', chave: 'ROTAS_TAMBEM_NO_GERAL', rotulo: 'Nicho com canal próprio também sai no geral', tipo: 'simnao', padrao: '0' },
  { grupo: 'Nichos e canais', chave: 'GERAL_NICHOS', rotulo: 'Só estes nichos no canal geral', tipo: 'texto', padrao: '', ajuda: 'Vazio = todos.' },
  { grupo: 'Nichos e canais', chave: 'GERAL_SEM_NICHOS', rotulo: 'Nichos fora do canal geral', tipo: 'texto', padrao: '', ajuda: 'Ex.: bebe,pet' },
  { grupo: 'Nichos e canais', chave: 'NICHO_MAX_POR_DIA', rotulo: 'Limite por dia de cada nicho', tipo: 'numero', padrao: '0', ajuda: '0 = sem limite.' },
  { grupo: 'Nichos e canais', chave: 'NICHO_LIMITES', rotulo: 'Limite próprio de alguns nichos', tipo: 'texto', padrao: '', ajuda: 'Ex.: moda=8,tech=15' },
  { grupo: 'Nichos e canais', chave: 'NICHO_PALAVRAS_TECH', rotulo: 'Palavras extras: Eletrônicos', tipo: 'texto', padrao: '', ajuda: 'Separadas por vírgula; "-palavra" tira a palavra do nicho.' },
  { grupo: 'Nichos e canais', chave: 'NICHO_PALAVRAS_MODA', rotulo: 'Palavras extras: Moda', tipo: 'texto', padrao: '' },
  { grupo: 'Nichos e canais', chave: 'NICHO_PALAVRAS_CASA', rotulo: 'Palavras extras: Casa & Cozinha', tipo: 'texto', padrao: '' },
  { grupo: 'Nichos e canais', chave: 'NICHO_PALAVRAS_BELEZA', rotulo: 'Palavras extras: Beleza', tipo: 'texto', padrao: '' },
  { grupo: 'Nichos e canais', chave: 'NICHO_PALAVRAS_ESPORTE', rotulo: 'Palavras extras: Esportes', tipo: 'texto', padrao: '' },

  { grupo: 'WhatsApp', chave: 'WHATSAPP_ATIVO', rotulo: 'Preparar mensagens de WhatsApp', tipo: 'simnao', padrao: '1' },
  { grupo: 'WhatsApp', chave: 'WHATSAPP_DESTINOS', rotulo: 'Canais e grupos gerais', tipo: 'texto', padrao: '', ajuda: 'Links https do WhatsApp separados por vírgula. Seguem o filtro do canal geral.' },
  { grupo: 'WhatsApp', chave: 'WHATSAPP_ROTAS', rotulo: 'Canais e grupos por nicho', tipo: 'texto', padrao: '', ajuda: 'nicho=link, separados por vírgula. Ex.: moda=https://chat.whatsapp.com/XXXX' },

  { grupo: 'Cupons e campanhas', chave: 'CUPONS_ATIVO', rotulo: 'Postar cupons do cupons.json', tipo: 'simnao', padrao: '1' },
  { grupo: 'Cupons e campanhas', chave: 'CUPONS_POR_DIA', rotulo: 'Cupons por dia', tipo: 'numero', padrao: '3' },
  { grupo: 'Cupons e campanhas', chave: 'CUPONS_REPETIR_DIAS', rotulo: 'Repetir cupom depois de (dias)', tipo: 'numero', padrao: '3' },
  { grupo: 'Cupons e campanhas', chave: 'CAMPANHAS_POR_DIA', rotulo: 'Campanhas da Shopee por dia', tipo: 'numero', padrao: '0', ajuda: '0 desliga.' },
  { grupo: 'Cupons e campanhas', chave: 'CAMPANHAS_REPETIR_DIAS', rotulo: 'Repetir campanha depois de (dias)', tipo: 'numero', padrao: '7' },
  { grupo: 'Cupons e campanhas', chave: 'VENDAS_ATIVO', rotulo: 'Ler vendas e comissão da Shopee', tipo: 'simnao', padrao: '1' },
  { grupo: 'Cupons e campanhas', chave: 'VENDAS_HORAS', rotulo: 'Ler vendas a cada (horas)', tipo: 'numero', padrao: '3' },
  { grupo: 'Cupons e campanhas', chave: 'VENDAS_DIAS', rotulo: 'Vendas dos últimos (dias)', tipo: 'numero', padrao: '30' },

  { grupo: 'Blog', chave: 'BLOG_ATIVO', rotulo: 'Gerar o blog automaticamente', tipo: 'simnao', padrao: '0' },
  { grupo: 'Blog', chave: 'BLOG_NOME', rotulo: 'Nome do blog', tipo: 'texto', padrao: 'Mata Preço' },
  { grupo: 'Blog', chave: 'BLOG_URL', rotulo: 'Endereço público', tipo: 'texto', padrao: '', ajuda: 'Ex.: https://seuusuario.github.io/achadinhos. Preencha depois de publicar.' },
  { grupo: 'Blog', chave: 'BLOG_HORAS', rotulo: 'Refazer a cada (horas)', tipo: 'numero', padrao: '6' },
  { grupo: 'Blog', chave: 'BLOG_IA', rotulo: 'Quem escreve os posts', tipo: 'opcao', padrao: 'nenhuma', opcoes: [{ valor: 'nenhuma', rotulo: 'Texto padrão (sem IA)' }, { valor: 'ollama', rotulo: 'IA local e gratuita (Ollama)' }, { valor: 'github', rotulo: 'IA gratuita do GitHub (precisa de token)' }, { valor: 'gemini', rotulo: 'IA gratuita do Google Gemini (precisa de chave)' }], ajuda: 'Com a IA, ela escreve a abertura, um parágrafo por produto e o fechamento.' },
  { grupo: 'Blog', chave: 'OLLAMA_MODELO', rotulo: 'Modelo do Ollama', tipo: 'texto', padrao: '', ajuda: 'Em branco = usa o primeiro modelo instalado. Veja os seus com: ollama list' },
  { grupo: 'Blog', chave: 'GITHUB_TOKEN', rotulo: 'Token do GitHub (só para a IA do GitHub)', tipo: 'segredo', padrao: '', ajuda: 'Token pessoal com a permissão "models". No modo nuvem não precisa: o GitHub fornece.' },
  { grupo: 'Blog', chave: 'BLOG_DIAS_NO_AR', rotulo: 'Dias que um post fica no ar', tipo: 'numero', padrao: '60' },
  { grupo: 'Blog', chave: 'BLOG_TELEGRAM', rotulo: 'Link do canal do Telegram no blog', tipo: 'texto', padrao: '', ajuda: 'Vazio = usa o canal do Telegram, se tiver @nome.' },
  { grupo: 'Blog', chave: 'BLOG_WHATSAPP', rotulo: 'Link do canal do WhatsApp no blog', tipo: 'texto', padrao: '' },
  { grupo: 'Blog', chave: 'BLOG_INSTAGRAM', rotulo: 'Perfil do Instagram no blog', tipo: 'texto', padrao: '', ajuda: '@perfil ou o endereço.' },
  { grupo: 'Blog', chave: 'GEMINI_MODELO', rotulo: 'Modelo do Gemini', tipo: 'texto', padrao: '' },
  { grupo: 'Blog', chave: 'GITHUB_MODELO', rotulo: 'Modelo da IA do GitHub', tipo: 'texto', padrao: 'openai/gpt-4o-mini' },
  { grupo: 'Blog', chave: 'BLOG_PUBLICAR', rotulo: 'Publicar', tipo: 'opcao', padrao: 'nao', opcoes: [{ valor: 'nao', rotulo: 'Não publicar (só gerar a pasta)' }, { valor: 'git', rotulo: 'Enviar com Git (GitHub Pages)' }] },

  { grupo: 'Instagram', chave: 'INSTAGRAM_ATIVO', rotulo: 'Publicar no Instagram', tipo: 'simnao', padrao: '0', ajuda: 'Conta profissional; token e ID ficam nos Secrets.' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_FEED_POR_DIA', rotulo: 'Posts no feed por dia', tipo: 'numero', padrao: '3' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_STORIES_POR_DIA', rotulo: 'Stories por dia', tipo: 'numero', padrao: '6' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_REELS_POR_DIA', rotulo: 'Reels por dia', tipo: 'numero', padrao: '1' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_INTERVALO_FEED_MIN', rotulo: 'Intervalo entre posts do feed (min)', tipo: 'numero', padrao: '180' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_INTERVALO_STORY_MIN', rotulo: 'Intervalo entre Stories (min)', tipo: 'numero', padrao: '60' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_HORARIOS_FEED', rotulo: 'Horários do feed', tipo: 'texto', padrao: '', ajuda: 'Horas separadas por vírgula. Ex.: 12,18,21' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_HORARIOS_STORIES', rotulo: 'Horários dos Stories', tipo: 'texto', padrao: '' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_HORARIOS_REELS', rotulo: 'Horários dos Reels', tipo: 'texto', padrao: '' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_NOTA_MINIMA', rotulo: 'Nota mínima no Instagram', tipo: 'numero', padrao: '4.6' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_VENDAS_MINIMAS', rotulo: 'Vendas mínimas no Instagram', tipo: 'numero', padrao: '300' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_PALAVRAS_BLOQUEADAS', rotulo: 'Palavras bloqueadas no Instagram', tipo: 'texto', padrao: 'generico,paralelo,similar,replica,imitacao,sem marca' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_CARROSSEL_POR_DIA', rotulo: 'Carrossel do dia (0 desliga)', tipo: 'numero', padrao: '1' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_CARROSSEL_ITENS', rotulo: 'Produtos no carrossel', tipo: 'numero', padrao: '5' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_CARROSSEL_TETOS', rotulo: 'Tetos de preço do carrossel', tipo: 'texto', padrao: '50,100,200' },
  { grupo: 'Instagram', chave: 'INSTAGRAM_DICAS_DIAS', rotulo: 'Dias da dica "Antes de comprar"', tipo: 'texto', padrao: '2,4,6', ajuda: '0 = domingo ... 6 = sábado.' },
];

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req: IncomingMessage): Promise<any> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > 200_000) throw new Error('corpo grande demais');
    partes.push(parte as Buffer);
  }
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

/** Só aceita pedidos feitos a partir do próprio painel, neste computador. */
function pedidoConfiavel(req: IncomingMessage, porta: number): boolean {
  const hosts = [`localhost:${porta}`, `127.0.0.1:${porta}`];
  if (!hosts.includes(req.headers.host ?? '')) return false;
  const origem = req.headers.origin;
  if (origem && !hosts.some((h) => origem === `http://${h}`)) return false;
  if (req.method === 'POST') {
    // Cabeçalho próprio + JSON: um site qualquer aberto no navegador não consegue mandar isto para cá.
    if (req.headers['x-painel'] !== '1') return false;
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return false;
  }
  return true;
}

function configParaTela(robo: Robo) {
  return CAMPOS.map((c) => {
    const bruto = (robo.env[c.chave] ?? '').trim();
    // Segredos nunca voltam para a tela: só informamos se estão preenchidos.
    return c.tipo === 'segredo' ? { ...c, valor: '', preenchido: bruto !== '' } : { ...c, valor: bruto || c.padrao, preenchido: bruto !== '' };
  });
}

function servirBlog(robo: Robo, caminho: string, res: ServerResponse): void {
  const raiz = resolve(robo.config.blog.pasta);
  const relativo = decodeURIComponent(caminho.replace(/^\/blog\/?/, '')) || 'index.html';
  const arquivo = resolve(join(raiz, normalize(relativo)));
  if ((arquivo !== raiz && !arquivo.startsWith(raiz + sep)) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('O blog ainda não foi gerado. Use o botão "Gerar blog agora" no painel.');
    return;
  }
  res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(arquivo));
}

async function executarAcao(robo: Robo, corpo: any): Promise<unknown> {
  switch (corpo.acao) {
    case 'pausar':
      robo.pausado = true;
      robo.log('pausado pelo painel');
      return { ok: true };
    case 'retomar':
      robo.pausado = false;
      robo.log('retomado pelo painel');
      return { ok: true };
    case 'coletar':
      return { ok: true, resumo: await robo.coletarAgora() };
    case 'postar': {
      const r = await robo.postarAgora(new Date(), true);
      return r.postou ? { ok: true, mensagem: `Postado: ${r.oferta.titulo.slice(0, 60)}` } : { ok: false, mensagem: r.motivo === 'erro' ? r.detalhe : `Nada postado: ${r.motivo}` };
    }
    case 'checar':
      return { ok: true, linhas: await robo.checar() };
    case 'blog': {
      const r = await robo.gerarBlogAgora();
      return { ok: r.gerou, resultado: r };
    }
    case 'remover':
      robo.removerDaFila(String(corpo.loja) as Loja, String(corpo.idProduto));
      return { ok: true };
    default:
      throw new Error('ação desconhecida');
  }
}

/** Sobe o painel em http://localhost:PORTA. Só responde a este computador. */
export function iniciarPainel(robo: Robo, porta: number): Promise<Server> {
  const pagina = readFileSync(new URL('./painel.html', import.meta.url), 'utf8');
  let portaReal = porta;

  const servidor = createServer(async (req, res) => {
    try {
      if (!pedidoConfiavel(req, portaReal)) return json(res, 403, { erro: 'pedido recusado' });
      const caminho = new URL(req.url ?? '/', 'http://localhost').pathname;

      if (req.method === 'GET' && caminho === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(pagina);
      }
      if (req.method === 'GET' && caminho === '/api/estado') return json(res, 200, robo.estado());
      if (req.method === 'GET' && caminho === '/api/config') return json(res, 200, { campos: configParaTela(robo) });
      if (req.method === 'GET' && caminho === '/blog') {
        res.writeHead(302, { location: '/blog/' });
        return res.end();
      }
      if (req.method === 'GET' && caminho.startsWith('/blog/')) return servirBlog(robo, caminho, res);

      if (req.method === 'POST' && caminho === '/api/config') {
        const corpo = await lerCorpo(req);
        const alteracoes: Record<string, string> = {};
        for (const [chave, valor] of Object.entries(corpo.valores ?? {})) {
          const campo = CAMPOS.find((c) => c.chave === chave);
          if (!campo || typeof valor !== 'string') continue;
          if (campo.tipo === 'segredo' && valor.trim() === '') continue; // em branco = manter o que já está salvo
          alteracoes[chave] = valor.trim();
        }
        try {
          if (Object.keys(alteracoes).length) robo.salvarConfig(alteracoes);
        } catch (e) {
          return json(res, 400, { erro: (e as Error).message });
        }
        return json(res, 200, { ok: true, problemas: robo.problemas() });
      }
      if (req.method === 'POST' && caminho === '/api/acao') {
        try {
          return json(res, 200, await executarAcao(robo, await lerCorpo(req)));
        } catch (e) {
          return json(res, 400, { erro: (e as Error).message });
        }
      }
      json(res, 404, { erro: 'não encontrado' });
    } catch (e) {
      json(res, 500, { erro: (e as Error).message });
    }
  });

  return new Promise((resolver, rejeitar) => {
    servidor.once('error', (e: NodeJS.ErrnoException) => {
      rejeitar(e.code === 'EADDRINUSE' ? new Error(`A porta ${porta} já está em uso. O robô já está aberto em outra janela? (ou mude PAINEL_PORTA no .env)`) : e);
    });
    servidor.listen(porta, '127.0.0.1', () => {
      const endereco = servidor.address();
      if (endereco && typeof endereco === 'object') portaReal = endereco.port;
      resolver(servidor);
    });
  });
}
