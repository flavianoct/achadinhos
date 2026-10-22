import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categorizar, nomeDoNicho, pontuarCategorias } from '../src/categoria.ts';
import { lerConfig, lerRotas } from '../src/config.ts';
import { Banco } from '../src/db.ts';
import { montarNichos } from '../src/exportar.ts';
import { postarProxima } from '../src/pipeline.ts';
import { destinosDaOferta } from '../src/rotas.ts';
import { ErroTelegram, type Publicador } from '../src/telegram.ts';
import type { OfertaAvaliada } from '../src/types.ts';

const AGORA = new Date('2026-10-03T18:00:00Z');
const base = { TELEGRAM_BOT_TOKEN: '1:a', TELEGRAM_CHAT_ID: '@geral_canal', HORA_INICIO: '0', HORA_FIM: '24' };

function oferta(titulo: string, id = 'P1'): OfertaAvaliada {
  return { loja: 'shopee', idProduto: id, titulo, preco: 100, link: 'https://s/x', categoria: categorizar(titulo), pontos: 5 };
}

test('categorias: o que tem mais palavras do nicho vence, e título desconhecido fica em "geral"', () => {
  assert.equal(categorizar('Smartphone Xiaomi Redmi 13 128GB'), 'tech');
  assert.equal(categorizar('Relógio Smartwatch Bluetooth Ligações'), 'tech', 'duas palavras de tech contra uma de moda');
  assert.equal(categorizar('Relógio Masculino Aço Inox'), 'moda');
  assert.equal(categorizar('Tênis Corrida Masculino Amortecimento'), 'esporte', 'corrida (esporte) vale o mesmo que tênis (moda) e esporte vem antes');
  assert.equal(categorizar('Air Fryer 4L Antiaderente'), 'casa');
  assert.equal(categorizar('Whey Protein 900g Chocolate'), 'esporte');
  assert.equal(categorizar('Produto Qualquer Sem Palavra Conhecida'), 'geral');
  assert.equal(categorizar(''), 'geral');
  // Palavra dentro de outra não conta.
  assert.equal(categorizar('Sobremesa Gelada'), 'geral');
  assert.ok(pontuarCategorias('Fone Bluetooth').every((c) => c.pontos > 0));
  assert.equal(nomeDoNicho('tech'), 'Eletrônicos');
  assert.equal(nomeDoNicho('inventada'), 'inventada');
});

test('rotas: lê categoria=canal, ignora o que é inválido e avisa', () => {
  const r = lerRotas('tech=@canal_tech, moda=-1001234567, x=@canal_x, casa=abc, semigual', false);
  assert.deepEqual(r.porCategoria, { tech: '@canal_tech', moda: '-1001234567' });
  assert.equal(r.avisos.length, 3);
  assert.match(r.avisos.join('\n'), /categoria "x" não existe/);
  assert.match(r.avisos.join('\n'), /canal "abc" de "casa"/);
  assert.deepEqual(lerRotas('', false), { porCategoria: {}, tambemNoGeral: false, geralNichos: [], geralSem: [], limitePorDia: 0, limites: {}, geralLimites: {}, minimos: {}, minimoPadrao: 0, avisos: [] });
});

test('rotas: nicho com canal vai só para ele; sem rota vai ao geral; "também no geral" manda aos dois', () => {
  const c = lerConfig({ ...base, ROTAS_TELEGRAM: 'tech=@canal_tech' });
  assert.deepEqual(destinosDaOferta('tech', c), ['@canal_tech']);
  assert.deepEqual(destinosDaOferta('moda', c), ['@geral_canal']);
  assert.deepEqual(destinosDaOferta('tech', lerConfig({ ...base, ROTAS_TELEGRAM: 'tech=@canal_tech', ROTAS_TAMBEM_NO_GERAL: '1' })), ['@canal_tech', '@geral_canal']);
  assert.deepEqual(destinosDaOferta('tech', lerConfig({ ...base, ROTAS_TELEGRAM: 'tech=@geral_canal' })), ['@geral_canal'], 'rota igual ao geral não duplica');
});

test('canal geral: GERAL_NICHOS escolhe o que entra, GERAL_SEM_NICHOS tira; nicho com canal próprio não é afetado', () => {
  const so = lerConfig({ ...base, GERAL_NICHOS: 'tech, casa', ROTAS_TELEGRAM: 'moda=@canal_moda' });
  assert.deepEqual(destinosDaOferta('tech', so), ['@geral_canal']);
  assert.deepEqual(destinosDaOferta('pet', so), [], 'pet não tem canal e o geral não aceita');
  assert.deepEqual(destinosDaOferta('moda', so), ['@canal_moda']);
  const sem = lerConfig({ ...base, GERAL_SEM_NICHOS: 'bebe,pet', ROTAS_TELEGRAM: 'pet=@canal_pet', ROTAS_TAMBEM_NO_GERAL: '1' });
  assert.deepEqual(destinosDaOferta('bebe', sem), []);
  assert.deepEqual(destinosDaOferta('pet', sem), ['@canal_pet'], 'também-no-geral respeita o filtro do geral');
  assert.deepEqual(destinosDaOferta('casa', sem), ['@geral_canal']);
  assert.match(lerConfig({ ...base, GERAL_NICHOS: 'eletronicos' }).rotas.avisos[0], /GERAL_NICHOS: nicho "eletronicos" não existe/);
});

class Falso implements Publicador {
  enviados: Array<{ id: string; destino?: string }> = [];
  recusa = new Map<string, Error>();
  async publicar(o: OfertaAvaliada, destino?: string) {
    const erro = destino ? this.recusa.get(destino) : undefined;
    if (erro) throw erro;
    this.enviados.push({ id: o.idProduto, destino });
  }
}

test('envio: a oferta sai no canal do nicho e o histórico guarda a categoria e o canal', async () => {
  const banco = new Banco(':memory:');
  const c = lerConfig({ ...base, ROTAS_TELEGRAM: 'tech=@canal_tech' });
  const pub = new Falso();
  banco.enfileirar(oferta('Smartphone Xiaomi Redmi 13', 'A'), AGORA);
  const r = await postarProxima(pub, banco, c, AGORA);
  assert.ok(r.postou);
  assert.deepEqual(pub.enviados, [{ id: 'A', destino: '@canal_tech' }]);
  assert.deepEqual(banco.postsPorCategoria(1, AGORA), [{ categoria: 'tech', posts: 1 }]);
  banco.enfileirar(oferta('Camiseta Básica', 'B'), AGORA);
  await postarProxima(pub, banco, c, AGORA);
  assert.deepEqual(pub.enviados[1], { id: 'B', destino: '@geral_canal' });
});

test('envio: canal do nicho que recusa não perde a oferta, ela vai ao geral com aviso; erro de rede espera', async () => {
  const banco = new Banco(':memory:');
  const c = lerConfig({ ...base, ROTAS_TELEGRAM: 'tech=@canal_tech' });
  const pub = new Falso();
  pub.recusa.set('@canal_tech', new ErroTelegram('bot não é admin', true));
  banco.enfileirar(oferta('Smartphone Xiaomi Redmi 13', 'A'), AGORA);
  const r = await postarProxima(pub, banco, c, AGORA);
  assert.ok(r.postou);
  assert.deepEqual(pub.enviados, [{ id: 'A', destino: '@geral_canal' }]);
  assert.match((r as any).avisos[0], /recusou/);

  const rede = new Falso();
  rede.recusa.set('@canal_tech', new ErroTelegram('sem conexão', false));
  banco.enfileirar(oferta('Fone Bluetooth', 'C'), AGORA);
  const r2 = await postarProxima(rede, banco, c, AGORA);
  assert.equal(r2.postou, false);
  assert.equal(banco.tamanhoDaFila(), 1, 'fica na fila para a próxima rodada');
});

test('envio: oferta que não vai para canal nenhum sai da fila e a próxima é postada', async () => {
  const banco = new Banco(':memory:');
  const c = lerConfig({ ...base, GERAL_SEM_NICHOS: 'pet' });
  const pub = new Falso();
  banco.enfileirar({ ...oferta('Ração para Cães 15kg', 'PET'), pontos: 99 }, AGORA);
  banco.enfileirar(oferta('Air Fryer 4L', 'CASA'), AGORA);
  const r = await postarProxima(pub, banco, c, AGORA);
  assert.ok(r.postou);
  assert.deepEqual(pub.enviados, [{ id: 'CASA', destino: '@geral_canal' }]);
  assert.equal(banco.tamanhoDaFila(), 0, 'a de pet foi descartada');
  assert.deepEqual(await postarProxima(pub, banco, c, AGORA), { postou: false, motivo: 'fila vazia' });
});

test('painel: números por nicho juntam posts, fila e rotas', () => {
  const banco = new Banco(':memory:');
  const c = lerConfig({ ...base, ROTAS_TELEGRAM: 'tech=@canal_tech,beleza=-1001234567' });
  const a = oferta('Smartphone Xiaomi Redmi 13', 'A');
  banco.registrarPost(a, AGORA, '@canal_tech');
  banco.registrarPost(oferta('Fone Bluetooth', 'B'), new Date(AGORA.getTime() - 3 * 86_400_000), '@canal_tech');
  banco.guardarProduto(a, AGORA);
  banco.enfileirar(oferta('Camiseta Básica', 'C'), AGORA);
  const n = montarNichos(banco, c, AGORA);
  const tech = n.find((x) => x.chave === 'tech')!;
  assert.deepEqual({ h: tech.postsHoje, s: tech.posts7dias, r: tech.temRota, canal: tech.canal }, { h: 1, s: 2, r: true, canal: '@canal_tech' });
  assert.equal(n.find((x) => x.chave === 'moda')!.naFila, 1);
  const beleza = n.find((x) => x.chave === 'beleza')!;
  assert.equal(beleza.temRota, true);
  assert.equal(beleza.canal, undefined, 'ID numérico não vai para o arquivo público');
  assert.equal(n[0].chave, 'tech', 'ordenado pelo volume da semana');
  assert.ok(!n.some((x) => x.chave === 'pet'), 'nicho sem nada não aparece');
});

test('banco antigo sem a coluna "canal" é atualizado sem perder os posts', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const arquivo = join(mkdtempSync(join(tmpdir(), 'bd-')), 'dados.db');
  const velho = new DatabaseSync(arquivo);
  velho.exec(`CREATE TABLE postados (id INTEGER PRIMARY KEY AUTOINCREMENT, loja TEXT NOT NULL, id_produto TEXT NOT NULL, titulo TEXT NOT NULL, categoria TEXT NOT NULL, preco REAL NOT NULL, dia TEXT NOT NULL, postado_em INTEGER NOT NULL)`);
  velho.prepare(`INSERT INTO postados (loja, id_produto, titulo, categoria, preco, dia, postado_em) VALUES ('shopee','Z','x','casa',10,'2026-10-03',?)`).run(AGORA.getTime());
  velho.close();
  const banco = new Banco(arquivo);
  assert.deepEqual(banco.postsPorCategoria(1, AGORA), [{ categoria: 'casa', posts: 1 }]);
  banco.registrarPost(oferta('Air Fryer', 'N'), AGORA, '@c');
  assert.equal(banco.postsNoDia(AGORA), 2);
  banco.fechar();
});

test('palavras dos nichos: NICHO_PALAVRAS_<NICHO> acrescenta palavras e "-palavra" tira', () => {
  assert.equal(categorizar('Quimono Feminino Estampado'), 'geral');
  assert.equal(categorizar('Relógio Masculino Aço'), 'moda');
  lerConfig({ NICHO_PALAVRAS_MODA: 'quimono, -relogio', NICHO_PALAVRAS_TECH: 'Relógio' });
  try {
    assert.equal(categorizar('Quimono Feminino Estampado'), 'moda');
    assert.equal(categorizar('Relógio Masculino Aço'), 'tech', 'relógio saiu de moda e entrou em tech, com acento ou sem');
  } finally {
    lerConfig({});
  }
  assert.equal(categorizar('Quimono Feminino Estampado'), 'geral', 'sem o ajuste volta ao padrão');
});

test('limite por nicho: nicho no teto do dia fica na fila e a próxima de outro nicho sai', async () => {
  const banco = new Banco(':memory:');
  const c = lerConfig({ ...base, NICHO_MAX_POR_DIA: '5', NICHO_LIMITES: 'tech=1, moda=x, inventado=2' });
  assert.equal(c.rotas.avisos.length, 2);
  const pub = new Falso();
  banco.enfileirar({ ...oferta('Smartphone Xiaomi', 'T1'), pontos: 90 }, AGORA);
  banco.enfileirar({ ...oferta('Fone Bluetooth', 'T2'), pontos: 80 }, AGORA);
  banco.enfileirar({ ...oferta('Air Fryer 4L', 'C1'), pontos: 10 }, AGORA);
  await postarProxima(pub, banco, c, AGORA);
  await postarProxima(pub, banco, c, AGORA);
  assert.deepEqual(pub.enviados.map((e) => e.id), ['T1', 'C1'], 'tech só 1 por dia');
  assert.deepEqual(await postarProxima(pub, banco, c, AGORA), { postou: false, motivo: 'nichos no limite' });
  assert.equal(banco.tamanhoDaFila(), 1, 'T2 continua na fila');
  const amanha = new Date(AGORA.getTime() + 86_400_000);
  banco.enfileirar(oferta('Smartphone Samsung', 'T3'), amanha);
  assert.ok((await postarProxima(pub, banco, c, amanha)).postou, 'no dia seguinte sai');
});

test('whatsapp por nicho: rotas viram destinos com nichos, o filtro do geral vai junto e a mensagem leva a categoria', async () => {
  const { montarWhatsapp } = await import('../src/exportar.ts');
  const c = lerConfig({ ...base, GERAL_SEM_NICHOS: 'pet', WHATSAPP_DESTINOS: 'https://chat.whatsapp.com/GERAL12345', WHATSAPP_ROTAS: 'moda=https://chat.whatsapp.com/MODA123456?s=x, bebe=https://chat.whatsapp.com/MODA123456, tech=http://ruim, xx=https://chat.whatsapp.com/ABCDEFGHIJ' });
  assert.equal(c.whatsapp.avisos.length, 2);
  const w = montarWhatsapp(c, [], AGORA);
  assert.deepEqual(w.geral, { nichos: [], sem: ['pet'] });
  assert.deepEqual(w.destinos, [
    { tipo: 'grupo', link: 'https://chat.whatsapp.com/GERAL12345' },
    { tipo: 'grupo', link: 'https://chat.whatsapp.com/MODA123456', nichos: ['moda', 'bebe'] },
  ]);

  // Pet sem canal no Telegram (o geral recusa), mas com grupo de WhatsApp: vai só para o WhatsApp.
  const banco = new Banco(':memory:');
  const soZap = lerConfig({ ...base, GERAL_SEM_NICHOS: 'pet', WHATSAPP_ROTAS: 'pet=https://chat.whatsapp.com/PETPET1234' });
  const pub = new Falso();
  banco.enfileirar(oferta('Ração para Cães 15kg', 'PET'), AGORA);
  const r = await postarProxima(pub, banco, soZap, AGORA);
  assert.ok(r.postou);
  assert.deepEqual(pub.enviados, [], 'nada no Telegram');
  const msgs = banco.mensagensDoWhatsapp(12, AGORA);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].categoria, 'pet');
});

test('configurar: a página sai com a lista de nichos embutida e o painel tem o link para ela', async () => {
  const { paginaDeConfigurar, PAGINA_DO_PAINEL } = await import('../src/exportar.ts');
  const html = paginaDeConfigurar();
  assert.ok(!html.includes('/*NICHOS*/'));
  assert.match(html, /const NICHOS = \[\{"chave":"tech","nome":"Eletrônicos"/);
  assert.match(PAGINA_DO_PAINEL, /configurar\.html/);
});

// ───────────── cada nicho com a sua configuração ─────────────

const GRUPO_DE_PETS = 'https://chat.whatsapp.com/KJi6FhpMfda0s0phA5W3Y3';

test('nichos: cada nicho tem o seu corte de qualidade, e o nicho pequeno tem corte menor por padrão', async () => {
  const { lerConfig } = await import('../src/config.ts');
  const { pontosMinimosDoNicho } = await import('../src/rotas.ts');
  const c = lerConfig({ PONTOS_MINIMOS: '58' });
  assert.equal(pontosMinimosDoNicho('tech', c), 58, 'nicho grande usa o corte de todos');
  assert.equal(pontosMinimosDoNicho('pet', c), 48);
  assert.equal(pontosMinimosDoNicho('bebe', c), 48);
  assert.equal(pontosMinimosDoNicho('games', c), 52);
  // O dono troca tudo: só o que ele escrever vale (vazio = todos com o corte geral).
  const dono = lerConfig({ PONTOS_MINIMOS: '58', NICHO_PONTOS_MINIMOS: 'pet=40,moda=65' });
  assert.equal(pontosMinimosDoNicho('pet', dono), 40);
  assert.equal(pontosMinimosDoNicho('moda', dono), 65);
  assert.equal(pontosMinimosDoNicho('bebe', dono), 58);
  assert.equal(pontosMinimosDoNicho('pet', lerConfig({ PONTOS_MINIMOS: '58', NICHO_PONTOS_MINIMOS: '' })), 58);
  // Erro de digitação vira aviso, e não derruba nada.
  const ruim = lerConfig({ NICHO_PONTOS_MINIMOS: 'xyz=3,pet=abc,moda=60' });
  assert.equal(ruim.rotas.avisos.filter((a) => a.startsWith('NICHO_PONTOS_MINIMOS')).length, 2);
  assert.equal(ruim.filtro.pontosPorNicho.moda, 60);
});

test('nichos: nicho com canal ou grupo próprio ganha mínimo diário, e o mínimo é distribuído ao longo do dia', async () => {
  const { lerConfig, nichosComDestino } = await import('../src/config.ts');
  const { minimoDoNicho, nichosAbaixoDaMeta, nichoTemDestinoProprio } = await import('../src/rotas.ts');
  const c = lerConfig({ WHATSAPP_ROTAS: `pet=${GRUPO_DE_PETS}`, ROTAS_TELEGRAM: 'tech=@canaltech', HORA_INICIO: '8', HORA_FIM: '22' });
  assert.deepEqual(nichosComDestino(c).sort(), ['pet', 'tech']);
  assert.equal(nichoTemDestinoProprio('pet', c), true);
  assert.equal(nichoTemDestinoProprio('moda', c), false);
  assert.equal(minimoDoNicho('pet', c), 6, 'o padrão vale para quem tem destino próprio');
  assert.equal(minimoDoNicho('moda', c), 0, 'sem destino próprio, sem mínimo');
  const comMinimos = lerConfig({ WHATSAPP_ROTAS: `pet=${GRUPO_DE_PETS}`, NICHO_MINIMOS: 'pet=10,moda=14', HORA_INICIO: '8', HORA_FIM: '22' });
  assert.equal(minimoDoNicho('pet', comMinimos), 10);
  assert.equal(minimoDoNicho('moda', comMinimos), 14);
  // Às 15h já passaram 8 das 14 horas: meta do pet = 6 (10 x 8/14, arredondado para cima), meta da moda = 8.
  assert.deepEqual(nichosAbaixoDaMeta([{ categoria: 'moda', posts: 2 }], comMinimos, 15), ['moda', 'pet'], 'o mais atrasado vem primeiro');
  assert.deepEqual(nichosAbaixoDaMeta([{ categoria: 'moda', posts: 8 }, { categoria: 'pet', posts: 6 }], comMinimos, 15), [], 'meta cumprida');
  // De manhã a meta é pequena: o nicho não gasta o mínimo todo cedo.
  assert.deepEqual(nichosAbaixoDaMeta([{ categoria: 'pet', posts: 1 }], comMinimos, 8), ['moda'], 'às 8h a meta é 1 post: o pet já cumpriu, a moda não');
  assert.deepEqual(nichosAbaixoDaMeta([], comMinimos, 22), ['moda', 'pet'], 'no fim do dia a meta é o mínimo inteiro');
});

test('buscas: todos os nichos entram no rodízio da Shopee, e os nichos com grupo próprio ganham uma busca extra por rodada', async () => {
  const { BUSCAS_POR_NICHO, BUSCAS_PADRAO, buscasIntercaladas, planoDeBuscas } = await import('../src/fontes/shopee.ts');
  assert.deepEqual(Object.keys(BUSCAS_POR_NICHO).sort(), ['bebe', 'beleza', 'casa', 'esporte', 'ferramentas', 'games', 'moda', 'pet', 'tech']);
  assert.deepEqual(buscasIntercaladas(), BUSCAS_PADRAO);
  assert.equal(new Set(BUSCAS_PADRAO).size, BUSCAS_PADRAO.length, 'sem busca repetida');
  // Num ciclo inteiro do rodízio, cada nicho é lido.
  const vistas = new Set<string>();
  for (let turno = 0; turno < Math.ceil(BUSCAS_PADRAO.length / 2); turno++) for (const b of planoDeBuscas([], 2, [], 0, turno)) vistas.add(b);
  for (const [nicho, termos] of Object.entries(BUSCAS_POR_NICHO)) assert.ok(termos.some((t) => vistas.has(t)), `o nicho ${nicho} é lido no ciclo`);
  // Com grupo de pets, todo turno traz uma busca de pet, e os termos de pet giram.
  const dePet = new Set(BUSCAS_POR_NICHO.pet);
  const termosDePet = new Set<string>();
  for (let turno = 0; turno < 12; turno++) {
    const plano = planoDeBuscas([], 2, ['pet'], 1, turno);
    const achados = plano.filter((b) => dePet.has(b));
    assert.ok(achados.length >= 1, `turno ${turno}: tem busca de pet`);
    assert.equal(new Set(plano).size, plano.length, 'sem busca repetida no turno');
    achados.forEach((a) => termosDePet.add(a));
  }
  assert.ok(termosDePet.size >= 4, 'os termos de pet giram');
  assert.ok(BUSCAS_POR_NICHO.pet!.length >= 20, 'pet tem buscas variadas (o grupo posta muito por dia)');
  for (const t of BUSCAS_POR_NICHO.pet!) assert.equal(categorizar(t), 'pet', `a busca "${t}" traz produto de pet`);
  // O dono manda: com SHOPEE_PALAVRAS, só as palavras dele.
  assert.deepEqual(planoDeBuscas(['a', 'b', 'c'], 2, ['pet'], 1, 0), ['a', 'b']);
});

test('mercado livre: as categorias padrão cobrem todos os nichos, inclusive pet, bebê, moda e ferramentas', async () => {
  const { lerConfig } = await import('../src/config.ts');
  const ids = lerConfig({}).ml.categorias;
  for (const [id, nicho] of [['MLB1071', 'pet'], ['MLB1384', 'bebê'], ['MLB1430', 'moda'], ['MLB263532', 'ferramentas']] as const) assert.ok(ids.includes(id), `${nicho} (${id})`);
});

// ───────────── Shopee e Mercado Livre por categoria, organizados por nicho ─────────────

test('nichos: cada nicho tem categorias na Shopee e no Mercado Livre, sem repetir categoria', async () => {
  const { CATEGORIAS_SHOPEE, CATEGORIAS_ML, NICHOS_DAS_LOJAS, categoriasShopeeDosNichos, categoriasMlDosNichos } = await import('../src/nichos.ts');
  for (const n of NICHOS_DAS_LOJAS) {
    assert.ok(CATEGORIAS_SHOPEE[n]?.length, `${n}: tem categoria na Shopee`);
    assert.ok(CATEGORIAS_ML[n]?.length, `${n}: tem categoria no Mercado Livre`);
  }
  assert.deepEqual(categoriasShopeeDosNichos(['pet']).map((c) => c.id), [11059991]);
  const todas = categoriasShopeeDosNichos(NICHOS_DAS_LOJAS);
  assert.equal(new Set(todas.map((c) => c.id)).size, todas.length, 'sem categoria repetida');
  assert.equal(todas.find((c) => c.id === 11059983)!.nicho, 'casa', 'Home & Construction fica com o primeiro nicho que a cita');
  assert.deepEqual(categoriasShopeeDosNichos(['ferramentas']).map((c) => c.id), [11059983], 'sozinho, o nicho ferramentas fica com ela');
  assert.deepEqual(categoriasMlDosNichos(['pet', 'bebe']), ['MLB1071', 'MLB1384']);
  assert.equal(categoriasMlDosNichos(NICHOS_DAS_LOJAS).length, 12);
});

test('nichos: NICHOS_ATIVOS escolhe os nichos que o robô puxa, nas duas lojas', async () => {
  const { lerConfig } = await import('../src/config.ts');
  const todos = lerConfig({});
  assert.deepEqual(todos.filtro.nichosAtivos, []);
  assert.equal(todos.shopee.categorias.length, 22, 'sem restrição, todas as categorias dos nichos');
  assert.equal(todos.ml.categorias.length, 12);
  const pet = lerConfig({ NICHOS_ATIVOS: 'pet' });
  assert.deepEqual(pet.filtro.nichosAtivos, ['pet']);
  assert.deepEqual(pet.shopee.categorias.map((c) => c.id), [11059991]);
  assert.deepEqual(pet.ml.categorias, ['MLB1071']);
  const dois = lerConfig({ NICHOS_ATIVOS: 'Pet, bebe' });
  assert.deepEqual(dois.filtro.nichosAtivos, ['pet', 'bebe']);
  assert.deepEqual(dois.ml.categorias, ['MLB1071', 'MLB1384']);
  // A lista própria do dono para o Mercado Livre manda.
  assert.deepEqual(lerConfig({ NICHOS_ATIVOS: 'pet', ML_CATEGORIAS: 'MLB1000' }).ml.categorias, ['MLB1000']);
  // Nicho que não existe vira aviso e não derruba nada.
  const ruim = lerConfig({ NICHOS_ATIVOS: 'pet,carros' });
  assert.deepEqual(ruim.filtro.nichosAtivos, ['pet']);
  assert.ok(ruim.rotas.avisos.some((a) => a.startsWith('NICHOS_ATIVOS') && a.includes('carros')));
});

test('shopee: o rodízio de categorias visita todos os nichos, e os nichos com grupo próprio ganham uma categoria extra', async () => {
  const { planoDeCategorias } = await import('../src/fontes/shopee.ts');
  const { categoriasShopeeDosNichos, NICHOS_DAS_LOJAS } = await import('../src/nichos.ts');
  const todas = categoriasShopeeDosNichos(NICHOS_DAS_LOJAS);
  const vistas = new Set<number>();
  for (let turno = 0; turno < 8; turno++) for (const c of planoDeCategorias(todas, 3, [], 0, turno)) vistas.add(c.id);
  assert.equal(vistas.size, todas.length, 'em um ciclo, todas as categorias foram lidas');
  assert.equal(new Set(planoDeCategorias(todas, 3, [], 0, 0).map((c) => c.nicho)).size, 3, 'o rodízio intercala os nichos (não lê 3 de moda seguidas)');
  for (let turno = 0; turno < 10; turno++) {
    const plano = planoDeCategorias(todas, 3, ['pet'], 1, turno);
    assert.ok(plano.some((c) => c.nicho === 'pet'), `turno ${turno}: a categoria de pets é lida`);
    assert.equal(new Set(plano.map((c) => c.id)).size, plano.length, 'sem categoria repetida no turno');
  }
  assert.deepEqual(planoDeCategorias([], 3, ['pet'], 1, 0), []);
  assert.deepEqual(planoDeCategorias(todas, 0, [], 0, 0), []);
  assert.deepEqual(planoDeCategorias(categoriasShopeeDosNichos(['pet']), 3, ['pet'], 1, 5).map((c) => c.id), [11059991]);
});

const itemDaShopee = (id: number) => ({ itemId: id, productName: `Produto ${id}`, offerLink: `https://s/${id}`, priceMin: '50' });
const respostaDaShopee = (nodes: unknown[]) => new Response(JSON.stringify({ data: { productOfferV2: { nodes, pageInfo: { hasNextPage: false } } } }), { status: 200 });

test('shopee: lê por categoria (productCatId, mais vendidos) e, com NICHOS_ATIVOS, pula o ranking geral', async () => {
  const { FonteShopee } = await import('../src/fontes/shopee.ts');
  const { categoriasShopeeDosNichos } = await import('../src/nichos.ts');
  const consultas: string[] = [];
  const fetchFalso = (async (_url: any, init: any) => {
    const q = JSON.parse(init.body).query as string;
    consultas.push(q);
    return respostaDaShopee(q.includes('productCatId: 11059991') ? [itemDaShopee(1), itemDaShopee(2)] : [itemDaShopee(3)]);
  }) as typeof fetch;

  const so = new FonteShopee({ appId: 'A', secret: 'S', categorias: categoriasShopeeDosNichos(['pet']), categoriasPorRodada: 1, nichosAtivos: ['pet'], buscasPorRodada: 0 }, fetchFalso);
  const ofertas = await so.coletar();
  assert.deepEqual(ofertas.map((o) => o.idProduto).sort(), ['1', '2']);
  assert.ok(consultas.some((q) => q.includes('productCatId: 11059991') && q.includes('sortType: 2')), 'a categoria de pets, pelos mais vendidos');
  assert.ok(!consultas.some((q) => q.includes('listType')), 'sem o ranking geral, que mistura todos os nichos');

  consultas.length = 0;
  const geral = new FonteShopee({ appId: 'A', secret: 'S', categorias: categoriasShopeeDosNichos(['pet']), categoriasPorRodada: 1, buscasPorRodada: 0 }, fetchFalso);
  await geral.coletar();
  assert.ok(consultas.some((q) => q.includes('listType: 2')), 'sem restrição, o ranking geral continua');
  assert.ok(consultas.some((q) => q.includes('productCatId')), 'e as categorias também');
});

test('shopee: categoria vazia ou com erro é substituída por uma busca do mesmo nicho, e a rodada continua', async () => {
  const { FonteShopee, BUSCAS_POR_NICHO } = await import('../src/fontes/shopee.ts');
  const { categoriasShopeeDosNichos } = await import('../src/nichos.ts');
  const opcoes = { appId: 'A', secret: 'S', categorias: categoriasShopeeDosNichos(['pet']), categoriasPorRodada: 1, nichosAtivos: ['pet'], buscasPorRodada: 0 };

  const consultas: string[] = [];
  const vazia = (async (_url: any, init: any) => {
    const q = JSON.parse(init.body).query as string;
    consultas.push(q);
    return respostaDaShopee(q.includes('keyword') ? [itemDaShopee(7)] : []);
  }) as typeof fetch;
  const ofertas = await new FonteShopee(opcoes, vazia).coletar();
  assert.deepEqual(ofertas.map((o) => o.idProduto), ['7']);
  const busca = consultas.find((q) => q.includes('keyword'))!;
  assert.ok(BUSCAS_POR_NICHO.pet!.some((t) => busca.includes(JSON.stringify(t))), 'a busca é de pet');

  // Erro na categoria: segue para a busca. Se nada foi coletado, o erro sobe (para a rodada avisar que a Shopee falhou).
  const comErro = (async (_url: any, init: any) => {
    const q = JSON.parse(init.body).query as string;
    if (q.includes('productCatId')) return new Response(JSON.stringify({ errors: [{ message: 'categoria inválida', extensions: { code: 10000 } }] }), { status: 200 });
    return respostaDaShopee([itemDaShopee(8)]);
  }) as typeof fetch;
  assert.deepEqual((await new FonteShopee(opcoes, comErro).coletar()).map((o) => o.idProduto), ['8']);
  const tudoErro = (async () => new Response(JSON.stringify({ errors: [{ message: 'fora do ar', extensions: { code: 10000 } }] }), { status: 200 })) as typeof fetch;
  await assert.rejects(() => new FonteShopee(opcoes, tudoErro).coletar(), /Shopee/);
});

test('geral: um nicho com canal próprio manda ao geral só a cota do dia (GERAL_LIMITES); o resto vai só para o dele', async () => {
  const banco = new Banco(':memory:');
  const c = lerConfig({ ...base, ROTAS_TELEGRAM: 'pet=@canal_pet', ROTAS_TAMBEM_NO_GERAL: '1', GERAL_LIMITES: 'pet=2, inventado=3', PARECIDOS_HORAS: '0' });
  assert.equal(c.rotas.geralLimites.pet, 2);
  assert.match(c.rotas.avisos.join('\n'), /GERAL_LIMITES: nicho "inventado" não existe/);
  const pub = new Falso();
  for (const [id, t] of [['A', 'Cama para Cachorro Pet Lavável G'], ['B', 'Ração para Gatos Premium 10kg'], ['C', 'Coleira Antipulgas para Cachorro'], ['D', 'Arranhador para Gato Torre']]) banco.enfileirar(oferta(t!, id!), AGORA);
  for (let i = 0; i < 4; i++) await postarProxima(pub, banco, c, AGORA);
  assert.equal(pub.enviados.filter((e) => e.destino === '@canal_pet').length, 4, 'o canal de pets recebe todos');
  assert.equal(pub.enviados.filter((e) => e.destino === '@geral_canal').length, 2, 'o geral recebe só dois');
  assert.equal(banco.postsNoGeralHoje('pet', AGORA), 2);
  // Sem a cota (0 ou sem a linha) o geral recebe todos.
  assert.deepEqual(destinosDaOferta('pet', lerConfig({ ...base, ROTAS_TELEGRAM: 'pet=@canal_pet', ROTAS_TAMBEM_NO_GERAL: '1' })), ['@canal_pet', '@geral_canal']);
  assert.deepEqual(destinosDaOferta('pet', c, true), ['@canal_pet']);
  // Nicho sem destino próprio não tem cota: não há outro lugar para ele ir.
  const sozinho = lerConfig({ ...base, GERAL_LIMITES: 'tech=1' });
  banco.enfileirar(oferta('Smartphone Xiaomi Redmi 13', 'T1'), AGORA);
  banco.enfileirar(oferta('Fone Bluetooth Sem Fio', 'T2'), AGORA);
  const p2 = new Falso();
  await postarProxima(p2, banco, sozinho, AGORA);
  await postarProxima(p2, banco, sozinho, AGORA);
  assert.equal(p2.enviados.filter((e) => e.destino === '@geral_canal' || e.destino === undefined).length, 2);
});

test('enviador: mensagem "só do nicho" não vai para o destino geral, mas vai para o grupo do nicho', async () => {
  const { destinoAceita } = await import('../enviador/logica.mjs');
  assert.equal(destinoAceita({ jid: 'g' }, 'pet', {}, true), false);
  assert.equal(destinoAceita({ jid: 'g' }, 'pet', {}, false), true);
  assert.equal(destinoAceita({ jid: 'p', nichos: ['pet'] }, 'pet', {}, true), true);
});

test('geral: a cota do nicho no geral cresce ao longo do dia, para os anúncios saírem espalhados', async () => {
  const { cotaDoGeralAgora } = await import('../src/rotas.ts');
  const c = lerConfig({ ...base, HORA_INICIO: '7', HORA_FIM: '23' });
  assert.equal(cotaDoGeralAgora(2, c, 7), 1, 'de manhã, só um');
  assert.equal(cotaDoGeralAgora(2, c, 12), 1);
  assert.equal(cotaDoGeralAgora(2, c, 16), 2, 'à tarde, o segundo');
  assert.equal(cotaDoGeralAgora(2, c, 22), 2, 'nunca passa do limite do dia');
});

test('lojas: o Mercado Livre puxa a maior parte dos posts (LOJA_PROPORCAO) e a Shopee entra com a dela', async () => {
  const { lojaParaEvitar } = await import('../src/rotas.ts');
  const c = lerConfig({ ...base, LOJA_PROPORCAO: 'mercadolivre=65, shopee=35, amazon=9, shopee=x' });
  assert.deepEqual(c.ritmo.proporcaoDasLojas, { mercadolivre: 65, shopee: 35 });
  // Shopee acima da fatia nos últimos posts: evita a Shopee. Mercado Livre acima: evita o Mercado Livre.
  assert.equal(lojaParaEvitar(['shopee', 'shopee', 'mercadolivre', 'shopee'], 'shopee', c), 'shopee');
  assert.equal(lojaParaEvitar(['mercadolivre', 'mercadolivre', 'mercadolivre', 'mercadolivre'], 'mercadolivre', c), 'mercadolivre');
  // Em 20 posts na proporção certa (13 e 7), a Shopee ainda cabe um pouco: não evita a Shopee.
  const certo = [...Array(13).fill('mercadolivre'), ...Array(7).fill('shopee')] as string[];
  assert.notEqual(lojaParaEvitar(certo, 'mercadolivre', c), 'shopee');
  // Sem a proporção, vale a regra antiga: evita a loja da última oferta.
  assert.equal(lojaParaEvitar(['shopee'], 'shopee', lerConfig(base)), 'shopee');
  assert.equal(lojaParaEvitar([], undefined, c), undefined);

  // Na fila: com a Shopee na frente do ranking, o Mercado Livre ainda é escolhido quando ele está abaixo da fatia.
  const banco = new Banco(':memory:');
  const ml = { ...oferta('Smartphone Xiaomi Redmi 13', 'M1'), loja: 'mercadolivre' as const, pontos: 60 };
  const sp = { ...oferta('Camiseta Básica Algodão', 'S1'), loja: 'shopee' as const, pontos: 90 };
  for (const o of [sp, ml]) banco.enfileirar(o, AGORA);
  for (let i = 0; i < 6; i++) banco.registrarPost({ ...sp, idProduto: `x${i}` }, AGORA);
  const pub = new Falso();
  await postarProxima(pub, banco, lerConfig({ ...base, LOJA_PROPORCAO: 'mercadolivre=65,shopee=35' }), AGORA);
  assert.equal(pub.enviados[0]!.id, 'M1');
});

test('filtro: a Shopee exige mais vendas (SHOPEE_VENDAS_MINIMAS), o Mercado Livre segue o mínimo de todos', async () => {
  const { avaliar } = await import('../src/filtro.ts');
  const c = lerConfig({ ...base, VENDAS_MINIMAS: '50', SHOPEE_VENDAS_MINIMAS: '1000' });
  const banco = new Banco(':memory:');
  const o = { loja: 'shopee' as const, idProduto: 'V1', titulo: 'Fone Bluetooth Sem Fio Premium', preco: 80, precoOriginal: 200, link: 'https://s/v', vendas: 400, nota: 4.8 };
  assert.deepEqual(avaliar(o, banco, c, AGORA), { aprovada: false, motivo: 'poucas vendas' });
  assert.equal(avaliar({ ...o, vendas: 4000 }, banco, c, AGORA).aprovada, true);
  assert.equal(avaliar({ ...o, loja: 'mercadolivre', vendas: 400 }, banco, c, AGORA).aprovada, true);
});

test('nicho atrás do mínimo não tira as vagas do geral: o post só do grupo sai a mais e o limite do dia não conta', async () => {
  const banco = new Banco(':memory:');
  // pet tem grupo de WhatsApp, cota de 0 no geral hoje (GERAL_LIMITES=pet=1 e já usada) e mínimo alto: sempre passa na frente.
  const c = lerConfig({ ...base, WHATSAPP_ATIVO: '1', WHATSAPP_ROTAS: 'pet=https://chat.whatsapp.com/KJi6FhpMfda0s0phA5W3Y3', GERAL_LIMITES: 'pet=1', NICHO_MINIMOS: 'pet=48', MAX_POSTS_POR_DIA: '2' });
  const pub = new Falso();
  banco.registrarPost({ ...oferta('Cama Macia Pet Tamanho G', 'JA'), categoria: 'pet' }, AGORA, '@geral_canal', true);
  banco.enfileirar({ ...oferta('Ração para Cães 15kg', 'PET1'), pontos: 99 }, AGORA);
  banco.enfileirar({ ...oferta('Coleira para Cães', 'PET2'), pontos: 98 }, AGORA);
  banco.enfileirar(oferta('Air Fryer 4L', 'CASA'), AGORA);
  // Sem restrição, o pet passa na frente e só vai para o grupo (sem Telegram).
  const a = await postarProxima(pub, banco, c, AGORA);
  assert.ok(a.postou && a.canais.length === 0 && a.oferta.categoria === 'pet');
  // Pedindo só o que vale para o geral, o pet fica de fora e a casa sai no canal geral.
  const b = await postarProxima(pub, banco, c, AGORA, undefined, true);
  assert.ok(b.postou);
  assert.deepEqual(pub.enviados, [{ id: 'CASA', destino: '@geral_canal' }]);
  // O limite do dia (2) só conta o que foi para o geral: já tem 2 (a de antes e a casa), então para; o pet só-de-grupo não pesou.
  assert.equal(banco.postsNoGeralNoDia(AGORA), 2);
  assert.deepEqual(await postarProxima(pub, banco, c, AGORA), { postou: false, motivo: 'limite diário' });
  assert.equal(banco.postsNoDia(AGORA), 3);
});

test('categoria: produtos que caíam em "geral" agora vão para o nicho certo, sem confundir pet com casa nem perfume com roupa', async () => {
  const { categorizar } = await import('../src/categoria.ts');
  const casos: Array<[string, string]> = [
    ['Gravata Masculina Premium Tradicional Padrinhos Casamento', 'moda'],
    ['Boné Ny New York Masculino Unissex', 'moda'],
    ['Mala de Bordo Rígida Bege para Viagem', 'moda'],
    ['Prancha Alisadora de Cabelo Bivolt', 'beleza'],
    ['Gloss Labial Hydra Cor 01', 'beleza'],
    ['Bola de Vôlei Oficial Ultra Soft', 'esporte'],
    ['Babador de Silicone Pega Migalhas', 'bebe'],
    ['Nobreak Senoidal 1200VA Bivolt', 'tech'],
    ['Cama Colchonete Almofada para Cachorro ou Gato Pet', 'pet'],
    ['Gaiola Viveiro para Calopsitas e Periquito', 'pet'],
    ['Kit Body Splash Masculino 2x200ml', 'beleza'],
    ['Sanduicheira Grill 2 em 1 Elétrica, Mixto Quente e Outros Petiscos', 'casa'],
    ['Kit 3 Pares Meias Esportivas', 'moda'],
  ];
  for (const [titulo, nicho] of casos) assert.equal(categorizar(titulo), nicho, titulo);
});

test('febre: o produto cujas vendas sobem mais por dia ganha pontos, e a Shopee ganha uma vez e meia', async () => {
  const { avaliar } = await import('../src/filtro.ts');
  const c = lerConfig({ ...base, VENDAS_MINIMAS: '50', SHOPEE_VENDAS_MINIMAS: '50' });
  const dia = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);
  const banco = new Banco(':memory:');
  const so = (loja: 'shopee' | 'mercadolivre', id: string, vendas: number) => ({ loja, idProduto: id, titulo: 'Fone Bluetooth Sem Fio Premium', preco: 80, precoOriginal: 200, link: 'https://s/f', vendas, nota: 4.8 });
  // O mesmo produto tinha 1000 vendas há 4 dias; hoje tem 1400 (100 por dia). Outro está parado em 1000.
  for (const id of ['QUENTE', 'PARADO']) banco.registrarVendas(so('shopee', id, 1000), dia(4));
  banco.registrarVendas(so('mercadolivre', 'QUENTE', 1000), dia(4));
  const quente = avaliar(so('shopee', 'QUENTE', 1400), banco, c, AGORA);
  const parado = avaliar(so('shopee', 'PARADO', 1000), banco, c, AGORA);
  const novo = avaliar(so('shopee', 'NOVO', 1400), banco, c, AGORA);
  assert.ok(quente.aprovada && parado.aprovada && novo.aprovada);
  assert.equal(quente.oferta.vendasPorDia, 100);
  assert.equal(parado.oferta.vendasPorDia, 0);
  assert.equal(novo.oferta.vendasPorDia, undefined, 'produto novo para o robô: sem histórico, sem bônus');
  assert.ok(quente.oferta.pontos > parado.oferta.pontos + 10, 'a febre pesa na pontuação');
  // O Mercado Livre também ganha, mas sem o peso extra da Shopee.
  const ml = avaliar(so('mercadolivre', 'QUENTE', 1400), banco, c, AGORA);
  assert.ok(ml.aprovada && ml.oferta.pontos < quente.oferta.pontos);
});

test('whatsapp: a cota por rodada é dos canais gerais, e as mensagens só do grupo de um nicho não a gastam', () => {
  const banco = new Banco(':memory:');
  const pet = { ...oferta('Cama para Cachorro Pet', 'W1'), link: 'https://s/w1' };
  banco.guardarParaWhatsapp(pet, 'msg pet 1', AGORA, true);
  banco.guardarParaWhatsapp({ ...pet, idProduto: 'W2' }, 'msg pet 2', AGORA, true);
  assert.equal(banco.whatsappNosUltimosMinutos(20, AGORA), 0, 'duas só de pet não ocupam a vaga do geral');
  banco.guardarParaWhatsapp({ ...pet, idProduto: 'W3' }, 'msg geral', AGORA, false);
  assert.equal(banco.whatsappNosUltimosMinutos(20, AGORA), 1);
  assert.equal(banco.mensagensDoWhatsapp(1, AGORA).filter((m) => m.soNicho).length, 2);
});
