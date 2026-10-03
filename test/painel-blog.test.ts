import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gerarBlog, graficoDePreco, limparTextoDeIA, modelosDoOllama, publicarComGit, tamanhoDoTop } from '../src/blog.ts';
import { lerArquivoEnv, lerConfig, salvarNoEnv } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { iniciarPainel } from '../src/painel.ts';
import { Robo } from '../src/robo.ts';
import type { Publicador } from '../src/telegram.ts';
import type { Fonte, Oferta, OfertaAvaliada } from '../src/types.ts';

const AGORA = new Date('2026-10-03T18:00:00Z'); // 15h em Brasília
const pasta = () => mkdtempSync(join(tmpdir(), 'achadinhos-'));

function produto(n: number, extra: Partial<OfertaAvaliada> = {}): OfertaAvaliada {
  return { loja: 'shopee', idProduto: `P${n}`, titulo: `Produto ${n}`, preco: 100 + n, desconto: 30, link: `https://loja.exemplo/p/${n}`, categoria: 'tech', pontos: 100 - n, ...extra };
}

function bancoCom(produtos: OfertaAvaliada[]): Banco {
  const banco = new Banco(':memory:');
  for (const p of produtos) banco.guardarProduto(p, AGORA);
  return banco;
}

// ───────────── arquivo .env ─────────────

test('env: salvar preserva comentários, troca no lugar, acrescenta e protege valores com #', () => {
  const dir = pasta();
  const arq = join(dir, '.env');
  writeFileSync(arq, '# comentário\r\nDESCONTO_MINIMO=25\r\n\r\n# outro\r\nSHOPEE_SECRET=antigo\r\n');
  salvarNoEnv({ DESCONTO_MINIMO: '40', SHOPEE_PALAVRAS: 'fone #1, air fryer', BLOG_NOME: "Achados d'Ouro" }, arq);

  const texto = readFileSync(arq, 'utf8');
  assert.ok(texto.startsWith('# comentário\r\nDESCONTO_MINIMO=40\r\n'), 'mantém comentário, ordem e fim de linha do Windows');
  assert.ok(texto.includes('SHOPEE_SECRET=antigo'));
  assert.deepEqual(lerArquivoEnv(arq), { DESCONTO_MINIMO: '40', SHOPEE_SECRET: 'antigo', SHOPEE_PALAVRAS: 'fone #1, air fryer', BLOG_NOME: "Achados d'Ouro" });

  assert.throws(() => salvarNoEnv({ BLOG_NOME: 'a\nB=1' }, arq), /quebra de linha/);
  assert.throws(() => salvarNoEnv({ 'x y': '1' }, arq), /inválido/);
  assert.equal(lerArquivoEnv(join(dir, 'nao-existe')), undefined);
});

test('env: sem .env, o primeiro salvamento parte do modelo', () => {
  const dir = pasta();
  writeFileSync(join(dir, 'modelo'), '# Telegram\nTELEGRAM_CHAT_ID=\nHORA_INICIO=8\n');
  salvarNoEnv({ TELEGRAM_CHAT_ID: '@canal' }, join(dir, '.env'), join(dir, 'modelo'));
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), '# Telegram\nTELEGRAM_CHAT_ID=@canal\nHORA_INICIO=8\n');
});

// ───────────── robô ─────────────

class PublicadorFalso implements Publicador {
  enviados: string[] = [];
  async publicar(o: OfertaAvaliada): Promise<void> {
    this.enviados.push(o.idProduto);
  }
}

function roboDeTeste(env: Record<string, string>, ofertas: Oferta[] = []) {
  const dir = pasta();
  const pub = new PublicadorFalso();
  let coletas = 0;
  const fonte: Fonte = { nome: 'shopee', coletar: async () => { coletas++; return ofertas; } };
  const robo = new Robo({
    caminhoEnv: join(dir, '.env'),
    modeloEnv: '',
    caminhoBanco: ':memory:',
    envBase: { BLOG_PASTA: join(dir, 'blog'), ...env },
    criarFontes: () => [fonte],
    criarPublicador: () => pub,
    silencioso: true,
  });
  return { robo, pub, dir, coletas: () => coletas };
}

const CHAVES = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '@c', SHOPEE_APP_ID: 'a', SHOPEE_SECRET: 's' };
const oferta = (id: string, desconto: number): Oferta => ({ loja: 'shopee', idProduto: id, titulo: `Fone ${id}`, preco: 100, desconto, link: `https://s/${id}`, nota: 4.8, vendas: 500 });

test('robô: sem chaves não coleta nem posta; pausado também não', async () => {
  const semChaves = roboDeTeste({}, [oferta('A', 50)]);
  assert.equal(semChaves.robo.estado(AGORA).situacao, 'configurar');
  await semChaves.robo.tick(AGORA);
  assert.equal(semChaves.coletas(), 0);

  const pausado = roboDeTeste(CHAVES, [oferta('A', 50)]);
  pausado.robo.pausado = true;
  await pausado.robo.tick(AGORA);
  assert.equal(pausado.coletas(), 0);
  assert.equal(pausado.robo.estado(AGORA).situacao, 'pausado');
});

test('robô: respeita os intervalos de coleta e de post', async () => {
  const { robo, pub, coletas } = roboDeTeste({ ...CHAVES, MINUTOS_ENTRE_COLETAS: '30', MINUTOS_ENTRE_POSTS: '10' }, [oferta('A', 50), oferta('B', 40), oferta('C', 30)]);
  const em = (min: number) => new Date(AGORA.getTime() + min * 60_000);

  await robo.tick(em(0));
  assert.equal(coletas(), 1);
  assert.deepEqual(pub.enviados, ['A']);
  await robo.tick(em(5)); // cedo demais para tudo
  assert.equal(coletas(), 1);
  assert.deepEqual(pub.enviados, ['A']);
  await robo.tick(em(10));
  assert.deepEqual(pub.enviados, ['A', 'B']);
  await robo.tick(em(30));
  assert.equal(coletas(), 2);
  assert.deepEqual(pub.enviados, ['A', 'B', 'C']);

  const e = robo.estado(em(31));
  assert.equal(e.situacao, 'rodando');
  assert.equal(e.postsHoje, 3);
  assert.equal(e.fila, 0);
  assert.equal(e.proximaColetaEm, em(60).getTime());
});

test('robô: "postar agora" ignora o horário; o relógio normal respeita', async () => {
  const { robo, pub } = roboDeTeste(CHAVES, [oferta('A', 50), oferta('B', 40)]);
  const madrugada = new Date('2026-10-03T06:00:00Z'); // 3h em Brasília
  await robo.tick(madrugada);
  assert.deepEqual(pub.enviados, []);
  assert.equal((await robo.postarAgora(madrugada, true)).postou, true);
  assert.deepEqual(pub.enviados, ['A']);
});

test('robô: configuração inválida não é gravada; válida vale na hora; linha vazia não apaga valor do ambiente', () => {
  const { robo, dir } = roboDeTeste(CHAVES);
  assert.throws(() => robo.salvarConfig({ DESCONTO_MINIMO: 'abc' }), /DESCONTO_MINIMO/);
  assert.equal(existsSync(join(dir, '.env')), false);

  robo.salvarConfig({ DESCONTO_MINIMO: '40', SHOPEE_SECRET: '' });
  assert.equal(robo.config.filtro.descontoMinimo, 40);
  assert.equal(robo.config.shopee.secret, 's');
  assert.deepEqual(robo.problemas(), []);

  // Valor inválido escrito à mão no arquivo: o robô avisa em vez de quebrar.
  writeFileSync(join(dir, '.env'), 'HORA_INICIO=oito\n');
  robo.recarregar();
  assert.match(robo.problemas().join(' '), /HORA_INICIO/);
  assert.equal(robo.estado(AGORA).situacao, 'configurar');
});

// ───────────── blog ─────────────

test('blog: tamanho do top e limpeza do texto de IA', () => {
  assert.deepEqual([0, 2, 3, 4, 5, 9, 10, 37].map(tamanhoDoTop), [0, 0, 3, 3, 5, 5, 10, 10]);
  assert.equal(limparTextoDeIA('curto'), undefined);
  assert.equal(limparTextoDeIA('Esta seleção reúne fones e carregadores por apenas R$ 49,90 hoje mesmo.'), undefined);
  assert.equal(limparTextoDeIA('Esta seleção reúne fones e carregadores com 50% de desconto garantido.'), undefined);
  assert.equal(limparTextoDeIA('<think>hmm</think> "**Esta seleção** reúne fones e carregadores para o dia a dia."'), 'Esta seleção reúne fones e carregadores para o dia a dia.');
  const longo = limparTextoDeIA(`${'Frase boa sobre os produtos da lista de hoje. '.repeat(20)}`)!;
  assert.ok(longo.length <= 521 && longo.endsWith('.'));
});

test('blog: gráfico só aparece com 3 dias ou mais de histórico', () => {
  assert.equal(graficoDePreco([{ dia: 'a', preco: 1 }, { dia: 'b', preco: 2 }]), '');
  const svg = graficoDePreco([{ dia: 'a', preco: 100 }, { dia: 'b', preco: 80 }, { dia: 'c', preco: 90 }]);
  assert.match(svg, /<polyline points="3\.0,3\.0 66\.0,33\.0 129\.0,18\.0"/);
  assert.match(svg, /Histórico de 3 dias: de R\$ 80,00 a R\$ 100,00/);
  assert.match(graficoDePreco([1, 2, 3].map((d) => ({ dia: String(d), preco: 50 }))), /points="3\.0,18\.0 /); // preço parado: linha no meio, sem divisão por zero
});

test('blog: gera páginas Top N, escapa HTML, marca links como patrocinados e descarta link inseguro', async () => {
  const dir = pasta();
  const config = lerConfig({ BLOG_PASTA: dir, BLOG_NOME: 'Meu <Blog>', BLOG_URL: 'https://exemplo.github.io/achados/', TELEGRAM_CHAT_ID: '@meucanal' });
  const produtos = [
    ...Array.from({ length: 6 }, (_, i) => produto(i + 1)),
    ...Array.from({ length: 3 }, (_, i) => produto(i + 10, { categoria: 'casa', loja: 'mercadolivre', precoOriginal: 300, freteGratis: true, menorPrecoEmDias: 12 })),
    produto(20, { categoria: 'pet' }),
    produto(21, { categoria: 'pet' }),
    produto(30, { titulo: '<script>alert("x")</script> & "aspas"', pontos: 999 }),
    produto(31, { link: 'javascript:alert(1)', pontos: 998 }),
  ];
  const banco = bancoCom(produtos);
  for (const d of [3, 2, 1]) banco.registrarPreco({ ...produto(1), preco: 150 + d }, new Date(AGORA.getTime() - d * 86_400_000));
  writeFileSync(join(dir, 'ofertas-antiga.html'), 'página velha');

  const r = await gerarBlog(banco, config, AGORA);

  assert.equal(r.gerou, true);
  assert.deepEqual(r.paginas, ['index.html', 'ofertas-tech.html', 'ofertas-casa.html']); // pet tem só 2: não vira página
  assert.equal(existsSync(join(dir, 'ofertas-antiga.html')), false, 'página de categoria sem ofertas é removida');
  for (const arquivo of ['estilo.css', '.nojekyll', 'sitemap.xml', 'robots.txt']) assert.ok(existsSync(join(dir, arquivo)), arquivo);

  const inicio = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(inicio, /<h1>Top 10 ofertas de hoje<\/h1>/);
  assert.equal((inicio.match(/<li class="cartao">/g) ?? []).length, 10);
  assert.ok(!inicio.includes('<script>alert'), 'título malicioso não vira tag');
  assert.ok(inicio.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;aspas&quot;'));
  assert.ok(!inicio.includes('javascript:'), 'link que não é https fica de fora');
  assert.equal((inicio.match(/rel="sponsored nofollow noopener"/g) ?? []).length, 10);
  assert.ok(inicio.includes('<title>Top 10 ofertas de hoje (03/10/2026) | Meu &lt;Blog&gt;</title>'));
  assert.ok(inicio.includes('<link rel="canonical" href="https://exemplo.github.io/achados/">'));
  assert.ok(inicio.includes('href="https://t.me/meucanal"'));
  assert.ok(inicio.includes('programas de afiliados'));
  assert.ok(inicio.includes('<svg'), 'produto com histórico ganha gráfico');
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(inicio)![1]);
  assert.equal(ld['@type'], 'ItemList');
  assert.equal(ld.itemListElement.length, 10);
  assert.equal(ld.itemListElement[0].name, '<script>alert("x")</script> & "aspas"');

  const casa = readFileSync(join(dir, 'ofertas-casa.html'), 'utf8');
  assert.match(casa, /<h1>Top 3 ofertas de Casa e Cozinha hoje<\/h1>/);
  assert.ok(casa.includes('<s>R$ 300,00</s>') && casa.includes('Frete grátis') && casa.includes('Menor preço em 12 dias') && casa.includes('Ver oferta na Mercado Livre'));
  assert.ok(casa.includes('<a href="index.html">Todas</a>') && casa.includes('<a href="ofertas-casa.html" aria-current="page">'), 'links relativos entre as páginas');

  const mapa = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
  assert.ok(mapa.includes('<loc>https://exemplo.github.io/achados/</loc>') && mapa.includes('<loc>https://exemplo.github.io/achados/ofertas-casa.html</loc>'));
});

test('blog: com menos de 3 ofertas recentes, mantém o blog anterior', async () => {
  const dir = pasta();
  writeFileSync(join(dir, 'index.html'), 'blog de ontem');
  const banco = bancoCom([produto(1), produto(2)]);
  banco.guardarProduto(produto(3), new Date(AGORA.getTime() - 48 * 3_600_000)); // visto há 2 dias: vencido
  const r = await gerarBlog(banco, lerConfig({ BLOG_PASTA: dir }), AGORA);
  assert.equal(r.gerou, false);
  assert.match(r.avisos[0], /mínimo de 3/);
  assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), 'blog de ontem');
});

test('blog: a IA escreve abertura, um parágrafo por produto e fechamento; os textos são reaproveitados', async () => {
  const banco = bancoCom(Array.from({ length: 3 }, (_, i) => produto(i + 1, { nota: 4.8, vendas: 12400 })));
  const dir = pasta();
  const config = lerConfig({ BLOG_PASTA: dir, BLOG_IA: 'ollama', OLLAMA_MODELO: 'modelo-x' });
  const pedidos: Array<{ url: string; prompt: string; model: string }> = [];
  const ollama = (async (url: any, init: any) => {
    const corpo = JSON.parse(init.body);
    pedidos.push({ url: String(url), prompt: corpo.prompt, model: corpo.model });
    const tipo = corpo.prompt.includes('introdução') ? 'Abertura' : corpo.prompt.includes('parágrafo final') ? 'Fechamento' : `Análise de ${/Produto: (.*)/.exec(corpo.prompt)![1]}`;
    return new Response(JSON.stringify({ response: `${tipo}: texto escrito pelo modelo para ajudar o leitor a decidir a compra.` }), { status: 200 });
  }) as typeof fetch;

  const r1 = await gerarBlog(banco, config, AGORA, ollama);
  // 2 posts (geral e tech) com abertura e fechamento cada, mais 3 produtos escritos uma única vez.
  assert.equal(r1.textosDeIA, 7);
  assert.equal(r1.modeloDeIA, 'modelo-x');
  assert.ok(pedidos.every((p) => p.url === 'http://localhost:11434/api/generate' && p.model === 'modelo-x'));
  assert.ok(pedidos.every((p) => !/R\$\s?\d|10[123]/.test(p.prompt)), 'o modelo recebe nomes e avaliações, nunca os preços');
  assert.ok(pedidos.some((p) => p.prompt.includes('Avaliação dos compradores: 4,8 de 5') && p.prompt.includes('Unidades vendidas: 12,4 mil')));

  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('<p class="intro">Abertura: texto escrito pelo modelo'));
  assert.equal((html.match(/<p class="analise">Análise de Produto \d: /g) ?? []).length, 3);
  assert.ok(html.includes('<h2>Como escolher</h2><p>Fechamento: texto escrito pelo modelo'));
  assert.ok(html.includes('escritos por inteligência artificial'), 'a página avisa que o texto é de IA');

  // Segunda rodada com os mesmos produtos: nada é pedido de novo.
  const r2 = await gerarBlog(banco, config, AGORA, ollama);
  assert.equal(pedidos.length, 7);
  assert.equal(r2.textosDeIA, 0);
  assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes('Análise de Produto 1: '));

  // Entrou um produto novo: a IA escreve só o que mudou (produto novo + abertura e fechamento dos 2 posts).
  banco.guardarProduto(produto(0, { pontos: 500 }), AGORA);
  const r3 = await gerarBlog(banco, config, AGORA, ollama);
  assert.equal(r3.textosDeIA, 5);

  // Texto de produto vencido (mais de 14 dias) é reescrito.
  const depois = new Date(AGORA.getTime() + 20 * 86_400_000);
  for (let i = 0; i <= 3; i++) banco.guardarProduto(produto(i, i === 0 ? { pontos: 500 } : {}), depois);
  const r4 = await gerarBlog(banco, config, depois, ollama);
  assert.equal(r4.textosDeIA, 7); // os 3 produtos que estão no Top 3, mais abertura e fechamento dos 2 posts
});

test('blog: sem modelo configurado usa o primeiro instalado; IA fora do ar ou inventando preço cai no texto padrão', async () => {
  const tags = { models: [{ name: 'nomic-embed-text:latest' }, { name: 'gemma3:4b' }, { name: 'llama3.1:8b' }] };
  const usados: string[] = [];
  const ollama = (resposta: string) => (async (url: any, init: any) => {
    if (String(url).endsWith('/api/tags')) return new Response(JSON.stringify(tags), { status: 200 });
    usados.push(JSON.parse(init.body).model);
    return new Response(JSON.stringify({ response: resposta }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await modelosDoOllama('http://x', ollama('')), ['gemma3:4b', 'llama3.1:8b']);

  const tres = () => bancoCom(Array.from({ length: 3 }, (_, i) => produto(i + 1)));
  const semModelo = (dir: string) => lerConfig({ BLOG_PASTA: dir, BLOG_IA: 'ollama' });

  const r1 = await gerarBlog(tres(), semModelo(pasta()), AGORA, ollama('Um texto honesto sobre os produtos desta lista, sem números inventados.'));
  assert.equal(r1.modeloDeIA, 'gemma3:4b');
  assert.ok(usados.length > 0 && usados.every((m) => m === 'gemma3:4b'));

  const dir2 = pasta();
  const r2 = await gerarBlog(tres(), semModelo(dir2), AGORA, ollama('Aproveite fones por apenas R$ 19,90 e descontos de 70% em toda a lista de hoje.'));
  assert.equal(r2.textosDeIA, 0, 'texto com preço inventado é descartado');
  const html2 = readFileSync(join(dir2, 'index.html'), 'utf8');
  assert.ok(html2.includes('Selecionamos 3 ofertas') && !html2.includes('19,90') && !html2.includes('inteligência artificial'));

  const fora = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
  const r3 = await gerarBlog(tres(), semModelo(pasta()), AGORA, fora);
  assert.equal(r3.gerou, true);
  assert.equal(r3.avisos.filter((a) => /IA indisponível/.test(a)).length, 1, 'avisa uma vez só e não insiste');

  const caiNoMeio = (() => {
    let n = 0;
    return (async (url: any) => {
      if (String(url).endsWith('/api/tags')) return new Response(JSON.stringify(tags), { status: 200 });
      if (++n > 2) throw new Error('timeout');
      return new Response(JSON.stringify({ response: 'Texto válido escrito antes de o modelo parar de responder.' }), { status: 200 });
    }) as typeof fetch;
  })();
  const r4 = await gerarBlog(tres(), semModelo(pasta()), AGORA, caiNoMeio);
  assert.equal(r4.gerou, true);
  assert.equal(r4.textosDeIA, 2);
  assert.equal(r4.avisos.filter((a) => /IA indisponível/.test(a)).length, 1);

  const semNada = (async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as typeof fetch;
  const r5 = await gerarBlog(tres(), semModelo(pasta()), AGORA, semNada);
  assert.match(r5.avisos.join(' '), /nenhum modelo instalado/);
});

test('blog: publica com Git, não repete commit sem mudanças e recusa pasta que não é repositório', async (t) => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
  } catch {
    return t.skip('git não instalado');
  }
  const remoto = pasta();
  const dir = pasta();
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(remoto, 'init', '--bare', '-b', 'main');
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'teste@exemplo.invalid');
  git(dir, 'config', 'user.name', 'Teste');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'remote', 'add', 'origin', remoto);
  writeFileSync(join(dir, 'index.html'), 'v1');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', 'início');
  git(dir, 'push', '-u', 'origin', 'main');

  writeFileSync(join(dir, 'index.html'), 'v2');
  assert.equal(await publicarComGit(dir, 'Atualiza ofertas'), 'publicado');
  assert.match(git(remoto, 'log', '--oneline', 'main'), /Atualiza ofertas/);
  assert.equal(git(remoto, 'show', 'main:index.html'), 'v2');
  assert.equal(await publicarComGit(dir, 'Atualiza ofertas'), 'sem mudanças para publicar');
  await assert.rejects(publicarComGit(pasta(), 'x'), /ainda não é um repositório Git/);
});

// ───────────── painel ─────────────

test('painel: mostra o estado, esconde segredos, salva configuração e recusa pedidos de fora', async () => {
  const { robo, dir } = roboDeTeste({ ...CHAVES, SHOPEE_SECRET: 'segredo-da-shopee' }, [oferta('A', 50)]);
  const servidor = await iniciarPainel(robo, 0);
  const porta = (servidor.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${porta}`;
  const post = (caminho: string, corpo: unknown, cabecalhos: Record<string, string> = { 'x-painel': '1' }) =>
    fetch(base + caminho, { method: 'POST', headers: { 'content-type': 'application/json', ...cabecalhos }, body: JSON.stringify(corpo) });

  try {
    const pagina = await fetch(base + '/');
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /Achadinhos Bot/);

    const coleta = await (await post('/api/acao', { acao: 'coletar' })).json();
    assert.equal(coleta.resumo.aprovadas, 1);
    const estado = await (await fetch(base + '/api/estado')).json();
    assert.equal(estado.situacao, 'rodando');
    assert.equal(estado.fila, 1);
    assert.equal(estado.filaItens[0].titulo, 'Fone A');

    // Segredos nunca saem do servidor.
    const textoConfig = await (await fetch(base + '/api/config')).text();
    assert.ok(!textoConfig.includes('segredo-da-shopee'));
    const campos = JSON.parse(textoConfig).campos;
    assert.deepEqual(campos.find((c: any) => c.chave === 'SHOPEE_SECRET').preenchido, true);
    assert.ok(!JSON.stringify(estado).includes('segredo-da-shopee'));

    // Pedidos que não vêm do próprio painel.
    assert.equal((await post('/api/acao', { acao: 'pausar' }, {})).status, 403, 'sem o cabeçalho do painel');
    assert.equal((await post('/api/acao', { acao: 'pausar' }, { 'x-painel': '1', origin: 'http://site-malicioso.exemplo' })).status, 403, 'vindo de outro site');
    assert.equal(robo.pausado, false);

    // Ações e configuração.
    assert.equal((await post('/api/acao', { acao: 'pausar' })).status, 200);
    assert.equal(robo.pausado, true);
    assert.equal((await post('/api/acao', { acao: 'inexistente' })).status, 400);
    assert.equal((await post('/api/config', { valores: { DESCONTO_MINIMO: 'abc' } })).status, 400);
    const salvo = await post('/api/config', { valores: { DESCONTO_MINIMO: '45', SHOPEE_SECRET: '', CHAVE_ESTRANHA: 'x' } });
    assert.equal(salvo.status, 200);
    assert.equal(robo.config.filtro.descontoMinimo, 45);
    assert.equal(robo.config.shopee.secret, 'segredo-da-shopee', 'segredo em branco mantém o valor salvo');
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), 'DESCONTO_MINIMO=45\n', 'chave desconhecida e segredo em branco não são gravados');

    // Prévia do blog: só serve arquivos de dentro da pasta do blog.
    assert.equal((await fetch(base + '/blog/')).status, 404, 'antes de gerar');
    assert.equal((await fetch(base + '/blog/%2e%2e%2f.env')).status, 404, 'não sai da pasta do blog');
    assert.equal((await fetch(base + '/blog/..%5c.env')).status, 404);
  } finally {
    servidor.close();
    robo.fechar();
  }
});
