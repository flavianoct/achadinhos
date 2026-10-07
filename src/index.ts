import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { FonteSimulada, OFERTAS_SIMULADAS } from './fontes/simulada.ts';
import { iniciarPainel } from './painel.ts';
import { Robo } from './robo.ts';
import { publicarControle, type DadosDaRodada } from './exportar.ts';
import { gravarPngsDoCarrossel, prepararCarrossel } from './carrossel.ts';
import { publicarNoInstagram } from './instagram.ts';
import { gravarPngs, prepararSocial } from './social.ts';
import { gravarBio } from './bio.ts';
import { PublicadorDeTeste } from './telegram.ts';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Quantas coletas seguidas com falha antes de a rodada ficar vermelha (o GitHub avisa por e-mail). */
const FALHAS_PARA_ALERTAR = 3;

function abrirNoNavegador(url: string): void {
  const [comando, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  execFile(comando as string, args as string[], { windowsHide: true }, () => undefined);
}

/** Demonstração: ofertas inventadas, nada é enviado e nada mexe no seu .env nem no seu banco. */
function criarRoboDeDemonstracao(): Robo {
  const robo = new Robo({
    caminhoEnv: '.env.demonstracao',
    modeloEnv: '',
    caminhoBanco: ':memory:',
    envBase: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: 'demonstracao',
      TELEGRAM_CHAT_ID: '@canal_de_demonstracao',
      SHOPEE_APP_ID: 'demonstracao',
      SHOPEE_SECRET: 'demonstracao',
      MINUTOS_ENTRE_POSTS: '1',
      HORA_INICIO: '0',
      HORA_FIM: '24',
      BLOG_ATIVO: '1',
      BLOG_NOME: 'Achadinhos do Dia (demonstração)',
      BLOG_PASTA: 'blog-demonstracao',
    },
    criarFontes: () => [new FonteSimulada()],
    criarPublicador: () => new PublicadorDeTeste(),
  });
  // Histórico de preços inventado, para o gráfico e o selo de "menor preço" aparecerem.
  const agora = Date.now();
  for (const o of OFERTAS_SIMULADAS) {
    for (let dia = 6; dia >= 1; dia--) {
      robo.banco.registrarPreco({ ...o, preco: Math.round(o.preco * (1 + 0.04 * dia + (dia % 2) * 0.03) * 100) / 100 }, new Date(agora - dia * 86_400_000));
    }
  }
  return robo;
}

/**
 * Modo nuvem: uma rodada completa e sai. É o que o GitHub Actions executa a cada meia hora.
 * Coleta as ofertas, posta algumas no Telegram, atualiza o blog e faz a faxina do banco.
 * As chaves vêm dos Secrets do repositório; os ajustes, do arquivo ajustes.env.
 */
async function modoNuvem(): Promise<void> {
  const robo = new Robo({ caminhoEnv: 'ajustes.env', modeloEnv: '' });
  const rodada: DadosDaRodada = { postados: 0 };
  const resumo: string[] = ['## Rodada do robô', ''];
  const dizer = (linha: string) => {
    resumo.push(linha);
    console.log(linha.replace(/^- /, ''));
  };

  const problemas = robo.problemas();
  if (problemas.length) {
    dizer('**O robô ainda não pode rodar.** Falta cadastrar em Settings → Secrets and variables → Actions:');
    for (const p of problemas) dizer(`- ${p}`);
    process.exitCode = 1;
  } else {
    const coleta = await robo.coletarAgora();
    rodada.coleta = coleta;
    dizer(`- Coleta: ${coleta.coletadas} ofertas vistas, ${coleta.aprovadas} aprovadas.`);
    for (const [fonte, erro] of Object.entries(coleta.errosPorFonte)) dizer(`- **Erro em ${fonte}:** ${erro}`);
    // Se nenhuma loja respondeu, a rodada termina em vermelho para chamar atenção, mas o blog e o banco seguem.
    const fontesComErro = Object.keys(coleta.errosPorFonte).length;
    if (fontesComErro > 0 && coleta.coletadas === 0) process.exitCode = 1;
    // Uma loja quebrada em silêncio (as outras seguem postando) vira alerta depois de 3 coletas seguidas.
    for (const f of robo.banco.fontesComFalhas(FALHAS_PARA_ALERTAR)) {
      dizer(`- **ALERTA: ${f.fonte} falhou ${f.falhas} coletas seguidas.** Último erro: ${f.erro}`);
      process.exitCode = 1;
    }

    let postados = 0;
    let motivoDaParada = '';
    for (let i = 0; i < robo.config.ritmo.postsPorRodada; i++) {
      if (i > 0) await pausa(3000);
      const r = await robo.postarAgora();
      if (!r.postou) {
        motivoDaParada = r.motivo === 'erro' ? `erro: ${r.detalhe}` : r.motivo;
        if (r.motivo === 'erro') process.exitCode = 1;
        break;
      }
      postados++;
    }
    rodada.postados = postados;
    rodada.parou = motivoDaParada;
    dizer(`- Telegram: ${postados} ofertas postadas${motivoDaParada ? ` (parou por: ${motivoDaParada})` : ''}. Na fila: ${robo.banco.tamanhoDaFila()}.`);

    // Cupons do Mercado Livre e da Amazon, cadastrados em cupons.json (no máximo CUPONS_POR_DIA por dia).
    if (robo.config.cupons.ativo) {
      const cupom = await robo.postarCupomAgora();
      for (const aviso of cupom.avisos) dizer(`- **Aviso nos cupons:** ${aviso}`);
      if (cupom.resultado.postou) dizer(`- Cupom postado: ${cupom.resultado.cupom.titulo}`);
      else if (cupom.resultado.motivo === 'erro') dizer(`- **Erro ao postar cupom:** ${cupom.resultado.detalhe}`);
    }
  }

  // O blog é gravado mesmo sem chaves: assim o site existe desde a primeira execução.
  if (robo.config.blog.ativo) {
    const blog = await robo.gerarBlogAgora();
    rodada.blog = blog;
    dizer(`- Blog: ${blog.guias ?? 0} guias, ${blog.postsDeHoje} posts de hoje, ${blog.postsNoAr} no ar${blog.textosDeIA ? `, ${blog.textosDeIA} textos novos da IA (${blog.modeloDeIA})` : ''}.`);
    for (const aviso of blog.avisos) dizer(`- Aviso do blog: ${aviso}`);
    if (robo.config.blog.url) dizer(`- Endereço: ${robo.config.blog.url}`);
  }

  // Painel, status e fila do WhatsApp vão para a pasta do blog e sobem junto com o site.
  try {
    const artes = await prepararSocial(robo.banco, robo.config, new Date());
    const pngs = await gravarPngs(robo.banco, robo.config, new Date());
    if (pngs.semConversor) dizer('- Aviso: faltou instalar o conversor de imagens (@resvg/resvg-js); o Instagram não terá imagens.');
    // Carrossel do dia ("Top 5 até R$ X"): criado numa rodada, com as imagens no ar na seguinte, quando é publicado.
    if (await prepararCarrossel(robo.banco, robo.config, new Date())) dizer('- Instagram: carrossel do dia preparado; sai na próxima rodada, quando as imagens estiverem no ar.');
    await gravarPngsDoCarrossel(robo.banco, robo.config, new Date());
    const ig = await publicarNoInstagram(robo.banco, robo.config, new Date());
    if (robo.config.instagram.ativo) dizer(`- Instagram: ${ig.feed} posts de feed e ${ig.stories} stories publicados.`);
    for (const a of ig.avisos) dizer(`- Aviso do Instagram: ${a}`);
    rodada.instagram = ig;
    publicarControle(robo.banco, robo.config, rodada, new Date());
    const naBio = gravarBio(robo.banco, robo.config, new Date());
    if (robo.config.blog.url) dizer(`- Página do link da bio: ${robo.config.blog.url}/bio.html (${naBio} ofertas).`);
    if (artes) dizer(`- Redes sociais: ${artes} artes de Story novas.`);
    if (robo.config.whatsapp.ativo) dizer(`- WhatsApp: ${robo.banco.mensagensDoWhatsapp(12, new Date()).length} mensagens na fila do enviador.`);
  } catch (e) {
    dizer(`- Aviso: não consegui gravar o painel (${(e as Error).message}).`);
  }

  robo.banco.limpar(new Date());
  robo.fechar();
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resumo.join('\n')}\n`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--nuvem')) return modoNuvem();
  if (args.has('--shopee-schema')) {
    const { descreverApiShopee } = await import('./descobrir.ts');
    const appId = (process.env.SHOPEE_APP_ID ?? '').trim();
    const secret = (process.env.SHOPEE_SECRET ?? '').trim();
    if (!appId || !secret) {
      console.log('Cadastre SHOPEE_APP_ID e SHOPEE_SECRET (Settings → Secrets and variables → Actions).');
      process.exitCode = 1;
      return;
    }
    const relatorio = await descreverApiShopee(appId, secret);
    console.log(relatorio);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${relatorio}\n`);
    return;
  }
  const demonstracao = args.has('--teste');
  const robo = demonstracao ? criarRoboDeDemonstracao() : new Robo();

  if (args.has('--checar')) {
    const linhas = await robo.checar();
    for (const l of linhas) console.log(`${l.ok ? '✓' : '✗'} ${l.texto}`);
    const tudoCerto = linhas.length > 0 && linhas.every((l) => l.ok);
    console.log(tudoCerto ? '\nTudo certo. Pode rodar: npm start' : '\nCorrija os itens marcados com ✗ e rode de novo.');
    process.exitCode = tudoCerto ? 0 : 1;
    robo.fechar();
    return;
  }

  if (args.has('--uma-vez') || args.has('--blog')) {
    const problemas = robo.problemas();
    if (problemas.length && args.has('--uma-vez')) {
      console.log('Não dá para rodar ainda:');
      for (const p of problemas) console.log(`  - ${p}`);
      process.exitCode = 1;
    } else if (args.has('--uma-vez')) {
      await robo.coletarAgora();
      const r = await robo.postarAgora();
      if (!r.postou && r.motivo !== 'erro') robo.log(`sem post agora: ${r.motivo}`);
    } else {
      await robo.gerarBlogAgora();
    }
    robo.fechar();
    return;
  }

  const servidor = await iniciarPainel(robo, robo.config.painel.porta);
  const url = `http://localhost:${robo.config.painel.porta}`;
  if (demonstracao) console.log('DEMONSTRAÇÃO: ofertas inventadas, nenhum post é enviado de verdade.\n');
  robo.log(`Painel aberto em ${url} — deixe esta janela aberta. Ctrl+C para parar.`);
  const problemas = robo.problemas();
  if (problemas.length) {
    robo.log('O robô ainda não está postando. Abra o painel, vá em Configurações e preencha:');
    for (const p of problemas) robo.log(`  - ${p}`);
  }
  if (args.has('--abrir')) abrirNoNavegador(url);

  let rodando = true;
  process.on('SIGINT', () => {
    robo.log('Encerrando...');
    rodando = false;
  });

  while (rodando) {
    try {
      await robo.tick();
    } catch (e) {
      // Nenhum erro inesperado deve parar o robô.
      robo.log(`ERRO inesperado: ${(e as Error).stack ?? e}`);
    }
    for (let i = 0; i < 5 && rodando; i++) await pausa(1000);
  }
  servidor.close();
  robo.fechar();
}

main().catch((e) => {
  console.error(`Falha ao iniciar: ${(e as Error).message}`);
  process.exitCode = 1;
});
