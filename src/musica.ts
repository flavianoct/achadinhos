/**
 * Trilha de fundo dos Reels, criada aqui mesmo (sintetizada em código): não usa gravação de ninguém,
 * então não tem direito autoral de terceiros. É uma batida leve (bumbo, chimbal, palma, baixo e melodia) em vários estilos:
 * muda o andamento, os acordes e o timbre da melodia, e cada Reel usa um deles.
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

/** Gera a trilha em WAV estéreo de 16 bits. O volume já vem moderado, para ficar por trás de uma voz. `estilo` escolhe a variação (0 = a original). */
export function sintetizarMusica(segundos: number, estilo = 0): Buffer {
  const e = ESTILOS[((Math.floor(estilo) % ESTILOS.length) + ESTILOS.length) % ESTILOS.length]!;
  const BATIDA = 60 / e.bpm;
  const BAIXO = e.acordes.map((a) => hz(a.raiz) / 2);
  const ARPEJO = e.acordes.map((a) => arpejo(a.raiz, a.menor));
  const total = Math.round(segundos * TAXA);
  const dados = Buffer.alloc(total * 4);
  const fade = Math.min(1.2, segundos / 4);
  for (let i = 0; i < total; i++) {
    const t = i / TAXA;
    const beat = Math.floor(t / BATIDA);
    const x = t - beat * BATIDA; // tempo desde o início da batida
    const compasso = Math.floor(beat / 4) % 4;
    const meia = t / (BATIDA / 2);
    const y = (meia - Math.floor(meia)) * (BATIDA / 2); // tempo desde o início da colcheia
    const passo = Math.floor(meia) % 8;

    // Bumbo em toda batida: seno que cai de agudo para grave.
    const bumbo = Math.sin(2 * Math.PI * (48 * x + 70 * (1 - Math.exp(-35 * x)) / 35)) * Math.exp(-7 * x) * 0.9;
    // Palma nas batidas 2 e 4.
    const palma = beat % 2 === 1 ? ruido(i) * Math.exp(-22 * x) * e.palma : 0;
    // Chimbal nos contratempos.
    const contra = (t + BATIDA / 2) % BATIDA;
    const chimbal = ruido(i + 7) * Math.exp(-80 * contra) * e.chimbal;
    // Baixo: uma nota por batida, com seno e um toque de harmônico.
    const fb = BAIXO[compasso]!;
    const baixo = (Math.sin(2 * Math.PI * fb * t) * 0.6 + Math.sin(2 * Math.PI * fb * 2 * t) * 0.15) * Math.exp(-2.2 * x) * 0.5;
    // Melodia em colcheias, no timbre do estilo.
    const fa = ARPEJO[compasso]![passo]!;
    const melodia = forma(e.onda, (fa * t) % 1) * Math.exp(-9 * y) * e.melodia;

    let v = (bumbo + palma + chimbal + baixo + melodia) * 0.55;
    const entrada = Math.min(1, t / 0.3);
    const saida = Math.min(1, (segundos - t) / fade);
    v *= Math.max(0, Math.min(entrada, saida));
    v = Math.tanh(v * 1.4); // segura picos sem estourar
    const amostra = Math.max(-1, Math.min(1, v)) * 32767;
    dados.writeInt16LE(Math.round(amostra), i * 4);
    dados.writeInt16LE(Math.round(amostra), i * 4 + 2);
  }
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
