// Gera o Reel e o TikTok de um produto: npm run gerar -- <produto>
// Lê produtos/<produto>/video.mp4 e produtos/<produto>/produto.json, mede a duração do vídeo e renderiza os dois.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2];

const parar = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};

if (!slug) {
  const lista = existsSync(join(aqui, 'produtos')) ? readdirSync(join(aqui, 'produtos')).filter((p) => !p.startsWith('_')) : [];
  parar(`Uso: npm run gerar -- <produto>\nProdutos disponíveis: ${lista.join(', ') || '(nenhum ainda: copie produtos/_modelo)'}`);
}
// O nome vira parte de comandos e caminhos: só letras minúsculas, números e hífen.
if (!/^[a-z0-9-]+$/.test(slug)) parar('O nome do produto só pode ter letras minúsculas, números e hífen (ex.: chaleira, fone-bluetooth).');

const pasta = join(aqui, 'produtos', slug);
const video = join(pasta, 'video.mp4');
const dados = join(pasta, 'produto.json');
if (!existsSync(video)) parar(`Falta o vídeo: ${video}`);
if (!existsSync(dados)) parar(`Falta o arquivo de textos: ${dados} (copie produtos/_modelo/produto.json)`);

let produto;
try {
  produto = JSON.parse(readFileSync(dados, 'utf8'));
} catch (e) {
  parar(`O produto.json não é um JSON válido: ${e.message}`);
}
const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const lista = (v) => Array.isArray(v) && v.length > 0 && v.every(texto);
const erros = [];
if (!texto(produto.produto)) erros.push('"produto" (texto curto em maiúsculas, ex.: CHALEIRA)');
if (!texto(produto.produtoCompleto)) erros.push('"produtoCompleto" (nome completo)');
if (!lista(produto.legendas)) erros.push('"legendas" (lista de 1 ou mais textos)');
if (!texto(produto.gancho)) erros.push('"gancho" (frase de abertura do TikTok)');
if (!lista(produto.passos)) erros.push('"passos" (lista de 1 ou mais palavras)');
if (erros.length) parar(`Faltam campos no produto.json:\n - ${erros.join('\n - ')}`);

const npx = (args, opcoes = {}) => spawnSync('npx', args, { cwd: aqui, shell: true, ...opcoes });

// O Remotion lê o vídeo da pasta public/: copia o do produto para lá.
mkdirSync(join(aqui, 'public'), { recursive: true });
mkdirSync(join(aqui, 'out'), { recursive: true });
copyFileSync(video, join(aqui, 'public', 'entrada.mp4'));

const sondar = (entrada, campo) => String(npx(['remotion', 'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', `stream=${campo}`, '-of', 'csv=p=0', 'public/entrada.mp4'], { encoding: 'utf8' }).stdout).trim();
const duracaoS = Math.round(parseFloat(sondar('v', 'duration')) * 100) / 100;
if (!Number.isFinite(duracaoS) || duracaoS < 3 || duracaoS > 30) parar(`Não consegui medir o vídeo (ou ele tem menos de 3 s ou mais de 30 s). Resultado: "${sondar('v', 'duration')}"`);
const largura = Number(sondar('v', 'width'));
const altura = Number(sondar('v', 'height'));
const horizontal = largura > altura;
console.log(`Produto: ${produto.produtoCompleto} | vídeo de ${duracaoS} s, ${largura}x${altura} (${horizontal ? 'horizontal: vai no centro, ampliado, com fundo desfocado' : 'vertical'})`);

const propsArquivo = `out/${slug}-props.json`;
writeFileSync(join(aqui, propsArquivo), JSON.stringify({ ...produto, duracaoS, horizontal }, null, 2), 'utf8');

for (const [id, saida] of [['Reel', `out/${slug}-reel.mp4`], ['TikTok', `out/${slug}-tiktok.mp4`]]) {
  console.log(`\nRenderizando ${id}...`);
  const r = npx(['remotion', 'render', 'src/index.ts', id, saida, `--props=${propsArquivo}`], { stdio: 'inherit' });
  if (r.status !== 0) parar(`A renderização do ${id} falhou.`);
}
console.log(`\nPronto:\n  remotion/out/${slug}-reel.mp4\n  remotion/out/${slug}-tiktok.mp4`);
