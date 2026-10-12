/**
 * Silhueta de um produto para o quiz "Que produto é esse?": apaga o fundo branco a partir das bordas da foto e pinta o produto de preto.
 * Só funciona com foto de fundo branco (e o robô confere isso sozinho): se o fundo não é branco, ou o produto some, ou ocupa a foto toda,
 * devolve o motivo em vez da silhueta, e o quiz usa outro produto. O que está cercado pelo produto (o buraco de uma alça, um texto branco
 * na caixa) continua sendo produto, porque só o branco que toca a borda é fundo.
 */
export type ResultadoDaSilhueta = { sombra: string } | { motivo: string };

/** Lado maior da imagem trabalhada (px): suficiente para uma silhueta nítida no vídeo, e leve de guardar. */
const LADO = 520;
/** Um pixel é "branco" quando todos os canais passam disto (aguenta a sombra clarinha do chão e o ruído do JPEG). */
const BRANCO = 226;
/** Pelo menos esta parte das bordas da foto precisa ser branca para a foto contar como "fundo branco". */
const BORDA_BRANCA = 0.92;
/** O produto (o que sobra depois de apagar o fundo) precisa ocupar entre estes limites da foto. */
const PRODUTO_MINIMO = 0.06;
const PRODUTO_MAXIMO = 0.72;

function ehBranco(d: Buffer, i: number): boolean {
  // Pixel transparente conta como fundo (foto PNG sem fundo).
  return d[i + 3]! < 200 || (d[i]! >= BRANCO && d[i + 1]! >= BRANCO && d[i + 2]! >= BRANCO);
}

/** Recebe a foto como data URI (png, jpeg) e devolve a silhueta preta em PNG (data URI) ou o motivo de não servir. */
export async function criarSilhueta(dataUri: string | undefined): Promise<ResultadoDaSilhueta> {
  if (!dataUri || !/^data:image\/(png|jpe?g|webp);base64,/.test(dataUri)) return { motivo: 'sem foto' };
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return { motivo: 'o conversor de imagens (sharp) não está instalado' };
  }
  try {
    const entrada = Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
    const { data, info } = await sharp(entrada).ensureAlpha().resize({ width: LADO, height: LADO, fit: 'inside', withoutEnlargement: false }).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    if (w < 40 || h < 40) return { motivo: 'foto pequena demais' };

    // 1. A foto tem fundo branco? Confere as quatro bordas.
    let bordas = 0;
    let bordasBrancas = 0;
    const pixel = (x: number, y: number) => (y * w + x) * 4;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) (bordas++, ehBranco(data, pixel(x, y)) && bordasBrancas++);
    for (let y = 1; y < h - 1; y++) for (const x of [0, w - 1]) (bordas++, ehBranco(data, pixel(x, y)) && bordasBrancas++);
    if (bordasBrancas / bordas < BORDA_BRANCA) return { motivo: 'o fundo da foto não é branco' };

    // 2. Apaga o branco que toca a borda (inundação a partir das bordas).
    const fundo = new Uint8Array(w * h);
    const fila = new Int32Array(w * h);
    let ini = 0;
    let fim = 0;
    const semear = (x: number, y: number) => {
      const k = y * w + x;
      if (!fundo[k] && ehBranco(data, k * 4)) {
        fundo[k] = 1;
        fila[fim++] = k;
      }
    };
    for (let x = 0; x < w; x++) (semear(x, 0), semear(x, h - 1));
    for (let y = 0; y < h; y++) (semear(0, y), semear(w - 1, y));
    while (ini < fim) {
      const k = fila[ini++]!;
      const x = k % w;
      const y = (k - x) / w;
      if (x > 0) semear(x - 1, y);
      if (x < w - 1) semear(x + 1, y);
      if (y > 0) semear(x, y - 1);
      if (y < h - 1) semear(x, y + 1);
    }

    // 3. O produto (o que não é fundo) tem um tamanho que dá silhueta?
    let produto = 0;
    for (let k = 0; k < w * h; k++) if (!fundo[k]) produto++;
    const parte = produto / (w * h);
    if (parte < PRODUTO_MINIMO) return { motivo: 'o produto é pequeno demais na foto' };
    if (parte > PRODUTO_MAXIMO) return { motivo: 'o produto ocupa a foto toda' };

    // 4. Pinta o produto de preto e deixa o fundo transparente.
    const saida = Buffer.alloc(w * h * 4);
    for (let k = 0; k < w * h; k++) if (!fundo[k]) saida[k * 4 + 3] = 255;
    const png = await sharp(saida, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    return { sombra: `data:image/png;base64,${png.toString('base64')}` };
  } catch (e) {
    return { motivo: `não consegui ler a foto (${(e as Error).message.slice(0, 80)})` };
  }
}
