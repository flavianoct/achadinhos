/**
 * Trilha de fundo dos Reels, criada aqui mesmo (sintetizada em código): não usa gravação de ninguém,
 * então não tem direito autoral de terceiros. É uma batida leve de 118 BPM (bumbo, chimbal, palma, baixo e melodia).
 */
const TAXA = 44_100;
const BPM = 118;
const BATIDA = 60 / BPM;

// Progressão Am - F - C - G, uma por compasso (4 batidas). Notas em Hz: baixo (oitava grave) e acorde da melodia.
const BAIXO = [55.0, 43.65, 65.41, 49.0];
const ARPEJO = [
  [220.0, 261.63, 329.63, 261.63, 220.0, 261.63, 329.63, 440.0], // Am
  [174.61, 220.0, 261.63, 220.0, 174.61, 220.0, 261.63, 349.23], // F
  [261.63, 329.63, 392.0, 329.63, 261.63, 329.63, 392.0, 523.25], // C
  [196.0, 246.94, 293.66, 246.94, 196.0, 246.94, 293.66, 392.0], // G
];

/** Ruído repetível (sempre o mesmo som), para o chimbal e a palma. */
function ruido(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Gera a trilha em WAV estéreo de 16 bits. O volume já vem moderado, para ficar por trás de uma voz. */
export function sintetizarMusica(segundos: number): Buffer {
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
    const palma = beat % 2 === 1 ? ruido(i) * Math.exp(-22 * x) * 0.28 : 0;
    // Chimbal nos contratempos.
    const contra = (t + BATIDA / 2) % BATIDA;
    const chimbal = ruido(i + 7) * Math.exp(-80 * contra) * 0.1;
    // Baixo: uma nota por batida, com seno e um toque de harmônico.
    const fb = BAIXO[compasso]!;
    const baixo = (Math.sin(2 * Math.PI * fb * 2 * t) * 0.6 + Math.sin(2 * Math.PI * fb * 4 * t) * 0.15) * Math.exp(-2.2 * x) * 0.5;
    // Melodia em colcheias (onda triangular suave).
    const fa = ARPEJO[compasso]![passo]!;
    const fase = (fa * t) % 1;
    const triangulo = 4 * Math.abs(fase - 0.5) - 1;
    const melodia = triangulo * Math.exp(-9 * y) * 0.16;

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
