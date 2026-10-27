/**
 * Trilha de fundo dos Reels, criada aqui mesmo (sintetizada em código): não usa gravação de ninguém,
 * então não tem direito autoral de terceiros. É uma batida pop atual: bumbo forte desde o primeiro segundo (quem abre o Reel
 * decide em um segundo se fica), grave longo tipo 808, acordes de fundo, melodia dedilhada com filtro, chimbal em semicolcheias,
 * palma nos tempos 2 e 4, e o resto da música "respirando" a cada bumbo. Vários estilos: muda o andamento, os acordes e o timbre.
 */
const TAXA = 44_100;

type Onda = 'triangulo' | 'seno' | 'quadrada' | 'serra';

interface Estilo {
  bpm: number;
  /** Quatro acordes, um por compasso: a nota-base em semitons a partir do Lá 3 (220 Hz) e se o acorde é menor. */
  acordes: Array<{ raiz: number; menor: boolean }>;
  onda: Onda;
  melodia: number;
  chimbal: number;
  palma: number;
}

/** O estilo 0 é a trilha original (Am - F - C - G, 118 BPM); os outros dão variedade ao perfil. */
const ESTILOS: Estilo[] = [
  { bpm: 118, acordes: [{ raiz: 0, menor: true }, { raiz: -4, menor: false }, { raiz: 3, menor: false }, { raiz: -2, menor: false }], onda: 'triangulo', melodia: 0.16, chimbal: 0.1, palma: 0.28 },
  { bpm: 104, acordes: [{ raiz: 3, menor: false }, { raiz: -2, menor: false }, { raiz: 0, menor: true }, { raiz: -4, menor: false }], onda: 'seno', melodia: 0.2, chimbal: 0.06, palma: 0.18 },
  { bpm: 126, acordes: [{ raiz: 5, menor: true }, { raiz: 1, menor: false }, { raiz: -4, menor: false }, { raiz: 3, menor: false }], onda: 'quadrada', melodia: 0.12, chimbal: 0.14, palma: 0.3 },
  { bpm: 110, acordes: [{ raiz: -5, menor: true }, { raiz: 3, menor: false }, { raiz: -2, menor: false }, { raiz: 5, menor: false }], onda: 'triangulo', melodia: 0.18, chimbal: 0.12, palma: 0.1 },
  { bpm: 122, acordes: [{ raiz: 0, menor: true }, { raiz: -2, menor: false }, { raiz: -4, menor: false }, { raiz: -5, menor: false }], onda: 'serra', melodia: 0.11, chimbal: 0.09, palma: 0.26 },
];

/** Quantos estilos de trilha existem. */
export const ESTILOS_DE_MUSICA = ESTILOS.length;

/**
 * Qual estilo um Reel usa, a partir da chave dele ("reel-2026-10-09" e "reel-2026-10-09-2"): gira de um Reel para o outro,
 * então dois Reels seguidos (inclusive os dois do mesmo dia) nunca têm a mesma trilha, e o mesmo Reel mantém o som entre rodadas.
 */
export function estiloDaMusica(chave: string): number {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:-(\d+))?/.exec(chave);
  if (!m) {
    let h = 0;
    for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % ESTILOS.length;
  }
  const dia = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
  const ordem = m[4] ? Number(m[4]) - 1 : 0;
  return (dia * 2 + ordem) % ESTILOS.length;
}

const hz = (semitons: number) => 220 * 2 ** (semitons / 12);

/** Notas do arpejo de um acorde, em colcheias: raiz, terça, quinta, terça, raiz, terça, quinta e a raiz uma oitava acima. */
function arpejo(raiz: number, menor: boolean): number[] {
  const [r, t, q, o] = [raiz, raiz + (menor ? 3 : 4), raiz + 7, raiz + 12];
  return [r, t, q, t, r, t, q, o].map(hz);
}

/** Ruído repetível (sempre o mesmo som), para o chimbal e a palma. */
function ruido(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function forma(onda: Onda, fase: number): number {
  switch (onda) {
    case 'seno':
      return Math.sin(2 * Math.PI * fase);
    case 'quadrada':
      return Math.tanh(Math.sin(2 * Math.PI * fase) * 3) * 0.7;
    case 'serra':
      return (fase - 0.5) * 1.4;
    default:
      return 4 * Math.abs(fase - 0.5) - 1;
  }
}

/** Coloca o cabeçalho WAV (PCM, estéreo, 16 bits) nas amostras. */
function empacotarWav(dados: Buffer): Buffer {
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0);
  cab.writeUInt32LE(36 + dados.length, 4);
  cab.write('WAVEfmt ', 8);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(2, 22); // estéreo
  cab.writeUInt32LE(TAXA, 24);
  cab.writeUInt32LE(TAXA * 4, 28);
  cab.writeUInt16LE(4, 32);
  cab.writeUInt16LE(16, 34);
  cab.write('data', 36);
  cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

/** Gera a trilha em WAV estéreo de 16 bits. O volume já vem moderado, para ficar por trás de uma voz. `estilo` escolhe a variação (0 = a original). */
export function sintetizarMusica(segundos: number, estilo = 0): Buffer {
  const e = ESTILOS[((Math.floor(estilo) % ESTILOS.length) + ESTILOS.length) % ESTILOS.length]!;
  const BATIDA = 60 / e.bpm;
  const SEMI = BATIDA / 4;
  const GRAVE = e.acordes.map((a) => hz(a.raiz) / 4);
  const ARPEJO = e.acordes.map((a) => arpejo(a.raiz + 12, a.menor));
  const ACORDE = e.acordes.map((a) => [a.raiz, a.raiz + (a.menor ? 3 : 4), a.raiz + 7].map((n) => hz(n + 12)));
  const total = Math.round(segundos * TAXA);
  const dados = Buffer.alloc(total * 4);
  const fade = Math.min(1.2, segundos / 4);
  let filtro = 0; // estado do filtro passa-baixa da melodia
  let anterior = 0; // ruído anterior, para o chimbal soar agudo (passa-alta simples)
  for (let i = 0; i < total; i++) {
    const t = i / TAXA;
    const beat = Math.floor(t / BATIDA);
    const x = t - beat * BATIDA; // tempo desde a batida
    const compasso = Math.floor(beat / 4) % 4;
    const semi = Math.floor(t / SEMI);
    const xs = t - semi * SEMI; // tempo desde a semicolcheia
    const meia = Math.floor(t / (BATIDA / 2));
    const y = t - meia * (BATIDA / 2); // tempo desde a colcheia

    // Bumbo em toda batida, com ataque de clique e corpo grave.
    const bumbo = Math.sin(2 * Math.PI * (46 * x + (110 * (1 - Math.exp(-32 * x))) / 32)) * Math.exp(-6.5 * x) * 0.95 + ruido(i) * Math.exp(-400 * x) * 0.25;
    // A música "respira": tudo menos o bumbo abaixa logo depois de cada batida e volta (o bombeado da música pop).
    const respiro = 1 - 0.55 * Math.exp(-9 * x);
    // Palma nos tempos 2 e 4: ruído com um tom curto por baixo.
    const palma = beat % 2 === 1 ? (ruido(i + 3) * 0.75 + Math.sin(2 * Math.PI * 190 * x) * 0.25) * Math.exp(-20 * x) * e.palma * 1.4 : 0;
    // Chimbal em semicolcheias, mais forte nos contratempos.
    const brilho = ruido(i + 7) - anterior;
    anterior = ruido(i + 7);
    const chimbal = brilho * Math.exp(-95 * xs) * (semi % 2 ? 1 : 0.55) * e.chimbal * 1.6;
    // Grave tipo 808: nota longa nos tempos 1 e 3, levemente saturada.
    const x2 = t - Math.floor(t / (BATIDA * 2)) * BATIDA * 2;
    const fg = GRAVE[compasso]!;
    const grave = Math.tanh(Math.sin(2 * Math.PI * fg * t) * 1.8) * Math.exp(-1.1 * x2) * 0.42;
    // Acordes de fundo: notas um pouco desafinadas entre si (dá largura), entrando devagar a cada compasso.
    const xc = t - Math.floor(t / (BATIDA * 4)) * BATIDA * 4;
    let fundoL = 0;
    let fundoR = 0;
    for (const f of ACORDE[compasso]!) {
      fundoL += Math.sin(2 * Math.PI * f * 1.003 * t);
      fundoR += Math.sin(2 * Math.PI * f * 0.997 * t);
    }
    const envFundo = Math.min(1, xc / 0.25) * 0.05;
    // Melodia dedilhada em colcheias: duas ondas desafinadas e um filtro que fecha (o som de "pluck").
    const fa = ARPEJO[compasso]![Math.floor(t / (BATIDA / 2)) % 8]!;
    const bruto = (forma(e.onda, (fa * t) % 1) + forma(e.onda, (fa * 1.006 * t) % 1)) * 0.5;
    const corte = 500 + 5200 * Math.exp(-14 * y);
    filtro += (1 - Math.exp((-2 * Math.PI * corte) / TAXA)) * (bruto - filtro);
    const melodia = filtro * Math.exp(-6 * y) * e.melodia * 1.5;

    const meio = bumbo * 0.85 + (palma + grave + melodia) * respiro;
    let l = meio + chimbal * 0.8 + fundoL * envFundo * respiro;
    let r = meio + chimbal * 1.1 + fundoR * envFundo * respiro;
    // Começa cheia (sem entrada lenta) e termina com fade.
    const nivel = Math.max(0, Math.min(Math.min(1, t / 0.02), (segundos - t) / fade)) * 0.6;
    l = Math.tanh(l * nivel * 1.5);
    r = Math.tanh(r * nivel * 1.5);
    dados.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), i * 4);
    dados.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), i * 4 + 2);
  }
  return empacotarWav(dados);
}

/**
 * Um efeito sonoro, em segundos desde o início do vídeo: o tique e o taque da contagem e o "ding" da revelação (quiz), o "whoosh"
 * da troca de tela e o "pop" do número do produto aparecendo (Reel).
 */
export interface Efeito {
  t: number;
  tipo: 'tic' | 'tac' | 'ding' | 'whoosh' | 'pop';
}

/**
 * Efeitos do quiz sintetizados em código (como a trilha, sem gravação de ninguém): "tic" e "tac" são cliques curtos de dois tons
 * (o relógio), e o "ding" é um sino de duas parciais que demora a sumir. Devolve um WAV estéreo com silêncio entre os efeitos.
 */
export function sintetizarEfeitos(segundos: number, eventos: Efeito[]): Buffer {
  const total = Math.round(segundos * TAXA);
  const mix = new Float32Array(total);
  for (const ev of eventos) {
    const inicio = Math.round(ev.t * TAXA);
    const duracao = ev.tipo === 'ding' ? 1.1 : ev.tipo === 'whoosh' ? 0.4 : ev.tipo === 'pop' ? 0.14 : 0.09;
    let passa = 0;
    const n = Math.round(duracao * TAXA);
    for (let k = 0; k < n && inicio + k < total; k++) {
      const x = k / TAXA;
      let v: number;
      if (ev.tipo === 'whoosh') {
        // Ruído que sobe e desce, com o filtro abrindo: o "vuuush" da tela deslizando.
        const corte = 300 + 6000 * Math.sin(Math.PI * Math.min(1, x / 0.4));
        passa += (1 - Math.exp((-2 * Math.PI * corte) / TAXA)) * (ruido(k + 11) - passa);
        v = passa * Math.sin(Math.PI * Math.min(1, x / 0.4)) * 0.7;
      } else if (ev.tipo === 'pop') {
        // Bolha curta: tom que cai de agudo para médio.
        v = Math.sin(2 * Math.PI * (520 * x + (900 * (1 - Math.exp(-40 * x))) / 40)) * Math.exp(-28 * x) * 0.55;
      } else if (ev.tipo === 'ding') {
        v = (Math.sin(2 * Math.PI * 1318.5 * x) * 0.6 + Math.sin(2 * Math.PI * 1975.5 * x) * 0.3 + Math.sin(2 * Math.PI * 2637 * x) * 0.1) * Math.exp(-4.2 * x) * 0.55;
      } else {
        const f = ev.tipo === 'tic' ? 1800 : 1250;
        v = (Math.sin(2 * Math.PI * f * x) * 0.8 + ruido(k) * 0.2) * Math.exp(-55 * x) * 0.6;
      }
      mix[inicio + k]! += v;
    }
  }
  const dados = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i++) {
    const amostra = Math.max(-1, Math.min(1, Math.tanh(mix[i]! * 1.2))) * 32767;
    dados.writeInt16LE(Math.round(amostra), i * 4);
    dados.writeInt16LE(Math.round(amostra), i * 4 + 2);
  }
  return empacotarWav(dados);
}
