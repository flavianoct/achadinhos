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
  assert.deepEqual(lerRotas('', false), { porCategoria: {}, tambemNoGeral: false, geralNichos: [], geralSem: [], avisos: [] });
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
