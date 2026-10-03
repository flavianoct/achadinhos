import { execFile } from 'node:child_process';
import { FonteSimulada, OFERTAS_SIMULADAS } from './fontes/simulada.ts';
import { iniciarPainel } from './painel.ts';
import { Robo } from './robo.ts';
import { PublicadorDeTeste } from './telegram.ts';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
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
