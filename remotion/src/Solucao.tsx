import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { Frase } from './Frase';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Reel "problema → solução" ("eu não sabia que existia isso"): a pessoa se reconhece na dor, o produto chega como surpresa e não como
 * anúncio.
 *   1. DOR (2,2 s): a imagem apagada, sem cor, com a dor escrita grande ("TEU FONE MORRE NO SUOR?").
 *   2. VIRADA (1 s): flash, a cor volta e "EU NÃO SABIA QUE EXISTIA ISSO".
 *   3. SOLUÇÃO (5,5 s): o produto resolvendo (vídeo de verdade, se tiver; senão as fotos do anúncio) e a resposta embaixo.
 *   4. FIM (2,8 s): a prova ("14 MIL VENDIDOS"), o carimbo "MATEI O PREÇO" e o "COMENTA EU QUERO".
 * Regra da marca: nunca preço em reais. A dor só entra quando o título do anúncio comprova a solução (src/problemas.ts).
 */

export const SOLUCAO_FPS = 30;
export const QUADROS_DA_SOLUCAO = { dor: 66, virada: 30, solucao: 165, fim: 84 };
export type TemposDaSolucao = typeof QUADROS_DA_SOLUCAO;
/** Os tempos de cada parte: os de sempre ou os do Reel narrado (cada parte acompanha uma frase da voz). */
export const temposDaSolucao = (p: { tempos?: TemposDaSolucao } = {}) => p.tempos ?? QUADROS_DA_SOLUCAO;
export const duracaoDaSolucao = (p: { tempos?: TemposDaSolucao } = {}) => Object.values(temposDaSolucao(p)).reduce((a, b) => a + b, 0);

export type PropsDaSolucao = {
  /** A dor, em até 2 linhas curtas em maiúsculas. */
  dor: string[];
  /** A virada; vazia, usa "EU NÃO SABIA / QUE EXISTIA ISSO". */
  virada?: string[];
  /** A resposta em frase ("Esse é resistente à água."). */
  resposta: string;
  /** Nome curto do produto, em até 2 linhas. */
  nome: string[];
  /** Foto principal do anúncio. */
  imagem: string;
  /** Outras fotos do anúncio, para a solução não ficar parada. */
  fotos?: string[];
  /** Vídeo de verdade do produto em uso (em public/). Com ele, o Reel inteiro roda sobre o vídeo. */
  video?: string;
  /** O vídeo foi feito por IA? Aí aparece o aviso na tela (o Instagram exige). */
  videoDeIa?: boolean;
  /** A prova do fim ("14 MIL VENDIDOS"); vazia, não aparece. */
  prova: string;
  /** Nota das avaliações ("★ 4,7"); vazia, não aparece. */
  nota?: string;
  cor: string;
  comentaQuero: boolean;
  /** Música (em public/), baixinha por baixo. */
  musica?: string;
  /** Efeitos sonoros (em public/), sintetizados pelo robô no tempo dos cortes. */
  audio?: string;
  /** Narração (em public/): com ela, a música fica bem baixinha por baixo da voz. */
  voz?: string;
  /** Quadros de cada parte, para acompanhar a narração; vazio, os de sempre. */
  tempos?: TemposDaSolucao;
};

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sombra = '0 6px 22px rgba(0,0,0,.6)';
const caber = (s: string, base: number, largura = 940) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.74)));
const VIRADA_PADRAO = ['EU NÃO SABIA', 'QUE EXISTIA ISSO'];

const Linha: React.FC<{ y: number; tamanho: number; cor: string; italico?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ y, tamanho, cor, italico, children, style }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: italico ? 'italic' : 'normal', fontSize: tamanho, lineHeight: 1.05, color: cor, whiteSpace: 'nowrap', textShadow: sombra, ...style }}>
    {children}
  </div>
);

/** Uma foto grande sobre ela mesma desfocada, com "soco" de zoom na entrada e aproximação lenta. */
const Foto: React.FC<{ src: string; duracao: number }> = ({ src, duracao }) => {
  const frame = useCurrentFrame();
  const soco = interpolate(frame, [0, 6], [1.08, 1], travar);
  const devagar = interpolate(frame, [6, duracao], [1, 1.06], travar);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo, overflow: 'hidden' }}>
      <Img src={src} style={{ position: 'absolute', inset: -200, width: 'calc(100% + 400px)', height: 'calc(100% + 400px)', objectFit: 'cover', filter: 'blur(55px) brightness(0.55) saturate(1.4)' }} />
      <Img src={src} style={{ position: 'absolute', left: 30, top: 380, width: 1020, height: 1020, objectFit: 'contain', borderRadius: 40, transform: `scale(${soco * devagar})` }} />
    </AbsoluteFill>
  );
};

/** O fundo do Reel inteiro: o vídeo do produto ou as fotos em sequência. Na dor fica sem cor e escuro; a cor volta na virada. */
const Fundo: React.FC<{ p: PropsDaSolucao }> = ({ p }) => {
  const frame = useCurrentFrame();
  const q = temposDaSolucao(p);
  const cinza = interpolate(frame, [q.dor - 4, q.dor + 2], [1, 0], travar);
  const brilho = interpolate(frame, [q.dor - 4, q.dor + 2], [0.45, 1], travar);
  const filtro = `grayscale(${cinza}) brightness(${brilho})`;
  if (p.video) {
    return (
      <AbsoluteFill style={{ background: MARCA.fundo, overflow: 'hidden', filter: filtro }}>
        <OffthreadVideo src={staticFile(p.video)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    );
  }
  // Sem vídeo: a foto principal na dor e na virada; na solução, as fotos giram (uma por batida); no fim, a principal de volta.
  const fotos = [p.imagem, ...(p.fotos ?? []).filter((f) => f !== p.imagem)].slice(0, 5);
  const batida = Math.floor(q.solucao / fotos.length);
  const inicio = q.dor + q.virada;
  return (
    <AbsoluteFill style={{ filter: filtro }}>
      <Sequence durationInFrames={inicio}><Foto src={p.imagem} duracao={inicio} /></Sequence>
      {fotos.map((f, i) => (
        <Sequence key={i} from={inicio + i * batida} durationInFrames={i === fotos.length - 1 ? q.solucao - i * batida : batida}>
          <Foto src={f} duracao={batida} />
        </Sequence>
      ))}
      <Sequence from={inicio + q.solucao}><Foto src={p.imagem} duracao={q.fim} /></Sequence>
    </AbsoluteFill>
  );
};

/** Flash branco curtinho no corte. */
const Flash: React.FC<{ forca?: number }> = ({ forca = 0.6 }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#fff', opacity: interpolate(frame, [0, 5], [forca, 0], travar), pointerEvents: 'none' }} />;
};

/** 1. A dor: texto grande no meio da tela, tremendo de leve. */
const Dor: React.FC<{ p: PropsDaSolucao }> = ({ p }) => {
  const frame = useCurrentFrame();
  const treme = Math.sin(frame * 1.7) * interpolate(frame, [0, 10, 20], [0, 5, 1.5], travar);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(225,6,0,.28) 0%, rgba(14,14,16,.55) 70%)` }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${treme}px)` }}>
        <Frase linhas={p.dor} y={720} />
      </div>
    </AbsoluteFill>
  );
};

/** 2. A virada: "EU NÃO SABIA QUE EXISTIA ISSO" estoura em cima da imagem já colorida. */
const Virada: React.FC<{ p: PropsDaSolucao }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const linhas = p.virada?.length ? p.virada : VIRADA_PADRAO;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(14,14,16,.65) 0%, rgba(14,14,16,0) 35%)' }} />
      {linhas.slice(0, 2).map((l, k) => {
        const s = spring({ frame: frame - k * 4, fps, config: { damping: 8, stiffness: 280 } });
        return (
          <Linha key={k} y={250 + k * 112} tamanho={caber(l, 104)} cor={k === 0 ? '#fff' : MARCA.amarelo} italico style={{ transform: `scale(${0.3 + s * 0.7}) rotate(${k === 0 ? -2 : 2}deg)`, WebkitTextStroke: `3px ${MARCA.fundo}` }}>
            {l}
          </Linha>
        );
      })}
      <Flash forca={0.8} />
    </AbsoluteFill>
  );
};

/** 3. A solução: a resposta numa pílula amarela embaixo e o nome do produto; o selo de IA quando o vídeo é de IA. */
const Solucao: React.FC<{ p: PropsDaSolucao }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: frame - 4, fps, config: { damping: 11, stiffness: 200 } });
  // Na solução longa (narrada), a prova aparece na segunda metade, junto com a frase "mais de 4 mil pessoas já compraram".
  const metade = Math.floor(temposDaSolucao(p).solucao / 2);
  const provas = temposDaSolucao(p).solucao > QUADROS_DA_SOLUCAO.solucao || p.voz ? [p.prova, p.nota].filter((s): s is string => Boolean(s && s.trim())) : [];
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(14,14,16,.45) 0%, rgba(14,14,16,0) 16%, rgba(14,14,16,0) 64%, rgba(14,14,16,.88) 88%)' }} />
      <div style={{ position: 'absolute', top: 250, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '10px 26px', borderRadius: 40, background: 'rgba(14,14,16,.8)' }}><Logo altura={48} /></div>
      </div>
      <div style={{ position: 'absolute', top: 1440, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: 960, padding: '20px 40px', borderRadius: 30, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: caber(p.resposta, 58, 880), textAlign: 'center', whiteSpace: 'nowrap', transform: `scale(${entra})`, boxShadow: '0 12px 34px rgba(0,0,0,.45)' }}>{p.resposta}</div>
      </div>
      {p.nome.slice(0, 2).map((l, k) => (
        <Linha key={k} y={1580 + k * 54} tamanho={caber(l, 44)} cor="#fff" style={{ opacity: interpolate(frame, [12 + k * 4, 20 + k * 4], [0, 1], travar) }}>{l}</Linha>
      ))}
      {provas.length && frame >= metade ? (
        <div style={{ position: 'absolute', top: 420, width: '100%', display: 'flex', justifyContent: 'center', gap: 20 }}>
          {provas.map((s, k) => (
            <div key={k} style={{ padding: '14px 34px', borderRadius: 50, background: 'rgba(14,14,16,.85)', border: `3px solid ${MARCA.amarelo}`, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(s, 50, 520), transform: `scale(${spring({ frame: frame - metade - k * 4, fps, config: { damping: 10, stiffness: 220 } })})` }}>{s}</div>
          ))}
        </div>
      ) : null}
      {p.video && p.videoDeIa ? (
        <div style={{ position: 'absolute', left: 40, top: 1720, padding: '8px 22px', borderRadius: 30, background: 'rgba(14,14,16,.78)', color: '#fff', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 26 }}>Vídeo feito com IA a partir da foto do anúncio</div>
      ) : null}
      <Flash forca={0.35} />
    </AbsoluteFill>
  );
};

/** O carimbo "MATEI O PREÇO": cai de cima, bate inclinado e treme no impacto. */
const Carimbo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bate = spring({ frame: frame - 10, fps, config: { damping: 9, stiffness: 320 } });
  const tremor = frame > 12 && frame < 20 ? Math.sin(frame * 3) * 6 : 0;
  return (
    <div style={{ position: 'absolute', top: 760, width: '100%', display: 'flex', justifyContent: 'center', transform: `translateY(${tremor}px)` }}>
      <div style={{ padding: '22px 46px 16px', border: `10px solid ${MARCA.vermelho}`, borderRadius: 26, background: 'rgba(255,255,255,.94)', color: MARCA.vermelho, fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: 112, lineHeight: 1, whiteSpace: 'nowrap', transform: `scale(${3 - bate * 2}) rotate(-8deg)`, opacity: Math.min(1, bate * 3), boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
        MATEI O PREÇO
      </div>
    </div>
  );
};

/** 4. O fim: prova e nota no alto, o carimbo no meio e o pedido de comentário pulsando embaixo. */
const Fim: React.FC<{ p: PropsDaSolucao }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 10, stiffness: 190 } });
  const pulso = 1 + 0.05 * Math.sin(frame / 2.6);
  const chamada = p.comentaQuero ? 'COMENTA "EU QUERO"' : 'LINK NA BIO';
  const apoio = p.comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'ENTRA NO GRUPO PRA VER O PREÇO';
  const provas = [p.prova, p.nota].filter((s): s is string => Boolean(s && s.trim()));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'rgba(14,14,16,.55)' }} />
      <div style={{ position: 'absolute', top: 250, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={52} /></div>
      {provas.length ? (
        <div style={{ position: 'absolute', top: 420, width: '100%', display: 'flex', justifyContent: 'center', gap: 20 }}>
          {provas.map((s, k) => (
            <div key={k} style={{ padding: '14px 34px', borderRadius: 50, background: 'rgba(14,14,16,.85)', border: `3px solid ${MARCA.amarelo}`, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(s, 50, 520), transform: `scale(${spring({ frame: frame - k * 4, fps, config: { damping: 10, stiffness: 220 } })})` }}>{s}</div>
          ))}
        </div>
      ) : null}
      <Carimbo />
      <Linha y={1260} tamanho={caber(chamada, 100)} cor={MARCA.amarelo} italico style={{ transform: `scale(${(0.6 + entra * 0.4) * pulso})`, WebkitTextStroke: `3px ${MARCA.fundo}` }}>{chamada}</Linha>
      <Linha y={1390} tamanho={caber(apoio, 44)} cor="#fff" style={{ opacity: entra }}>{apoio}</Linha>
      <div style={{ position: 'absolute', top: 1520, left: 0, right: 0, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 26 }}>{MARCA.aviso}</div>
      <Flash forca={0.5} />
    </AbsoluteFill>
  );
};

const volumeDaMusica = (frame: number, total: number) => 0.7 * Math.min(1, frame / 15, Math.max(0, (total - frame) / 30));

export const SolucaoReel: React.FC<PropsDaSolucao> = (p) => {
  const q = temposDaSolucao(p);
  const total = duracaoDaSolucao(p);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Fundo p={p} />
      <Sequence durationInFrames={q.dor}><Dor p={p} /></Sequence>
      <Sequence from={q.dor} durationInFrames={q.virada}><Virada p={p} /></Sequence>
      <Sequence from={q.dor + q.virada} durationInFrames={q.solucao}><Solucao p={p} /></Sequence>
      <Sequence from={q.dor + q.virada + q.solucao} durationInFrames={q.fim}><Fim p={p} /></Sequence>
      {p.musica ? <Audio src={staticFile(p.musica)} volume={(f) => volumeDaMusica(f, total) * (p.voz ? 0.3 : 1)} /> : null}
      {p.voz ? <Audio src={staticFile(p.voz)} /> : null}
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
    </AbsoluteFill>
  );
};
