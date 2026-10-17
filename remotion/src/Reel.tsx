import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Cena } from './Cena';
import { Aviso, FaixaDoGrupo, FONTE, FundoDaMarca, Logo, MARCA } from './marca';

export type PropsDoReel = {
  /** Nome curto do produto, em maiúsculas, para o gancho: "ESSA [CHALEIRA] VALE A PENA?". */
  produto: string;
  /** Nome completo, no fecho. */
  produtoCompleto: string;
  /** Legendas da cena, em ordem: dividem o tempo entre o fim do gancho e o fim do vídeo. */
  legendas: string[];
  /** Duração do vídeo de entrada, em segundos (o comando `gerar` mede sozinho). */
  duracaoS: number;
  /** Vídeo de entrada horizontal (o comando `gerar` detecta sozinho). */
  horizontal?: boolean;
};

export const REEL_FPS = 30;
const FECHO_S = 3.2;
const SOBREPOSICAO_S = 0.5;
/** Duração total do Reel: o vídeo inteiro, mais o fecho (que entra um pouco antes do fim). */
export const duracaoDoReel = (duracaoS: number) => Math.round((duracaoS + FECHO_S - SOBREPOSICAO_S) * REEL_FPS);
const GANCHO_S = 3.2;

/** Letreiro que "pula" para dentro da tela e sai de leve. */
const Letreiro: React.FC<{ linhas: string[]; entra: number; sai: number; top: number }> = ({ linhas, entra, sai, top }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - entra, fps, config: { damping: 12, stiffness: 140 } });
  const opacidade =
    interpolate(f, [sai - 8, sai], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(f, [entra, entra + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 40, right: 40, top, textAlign: 'center', fontFamily: FONTE, fontStyle: 'italic', fontWeight: 900, opacity: opacidade, transform: `scale(${0.7 + 0.3 * pop})`, transformOrigin: '50% 0' }}>
      {linhas.map((l, i) => (
        <div key={l} style={{ fontSize: i === 0 ? 92 : 120, lineHeight: 1.02, color: i === 0 ? MARCA.branco : MARCA.amarelo, textShadow: '0 6px 0 rgba(0,0,0,.55), 0 0 30px rgba(0,0,0,.6)' }}>
          {l}
        </div>
      ))}
    </div>
  );
};

const Legenda: React.FC<{ texto: string; inicio: number; fim: number; bottom: number }> = ({ texto, inicio, fim, bottom }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [inicio, inicio + 6, fim - 6, fim], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(f, [inicio, inicio + 8], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', opacity: a, transform: `translateY(${y}px)` }}>
      <div style={{ background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 62, padding: '20px 44px', borderRadius: 999, boxShadow: '0 10px 30px rgba(0,0,0,.45)' }}>{texto}</div>
    </div>
  );
};

const Fecho: React.FC<{ produtoCompleto: string }> = ({ produtoCompleto }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const pop = spring({ frame: f - 6, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ opacity: entra, alignItems: 'center', justifyContent: 'center' }}>
      <FundoDaMarca />
      <div style={{ position: 'absolute', top: 330, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Logo altura={96} />
      </div>
      <div style={{ position: 'absolute', top: 640, left: 60, right: 60, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: 84, color: MARCA.branco, lineHeight: 1.05, transform: `scale(${0.85 + 0.15 * pop})` }}>
        {produtoCompleto}
      </div>
      <div style={{ position: 'absolute', top: 960, transform: `scale(${0.85 + 0.15 * pop})` }}>
        <FaixaDoGrupo />
      </div>
      <div style={{ position: 'absolute', top: 1290, width: '100%', textAlign: 'center', color: MARCA.branco, fontFamily: FONTE, fontWeight: 900, fontSize: 48 }}>💾 Salva pra achar depois</div>
      <Aviso bottom={400} />
    </AbsoluteFill>
  );
};

export const Reel: React.FC<PropsDoReel> = ({ produto, produtoCompleto, legendas, duracaoS, horizontal }) => {
  const f = useCurrentFrame();
  const videoFrames = Math.round(duracaoS * REEL_FPS);
  const fatia = (duracaoS - GANCHO_S - 0.1) / Math.max(1, legendas.length);
  const zoom = interpolate(f, [0, videoFrames], [1, 1.07], { extrapolateRight: 'clamp' });
  const inicioDoFecho = Math.round((duracaoS - SOBREPOSICAO_S) * REEL_FPS);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Sequence durationInFrames={videoFrames}>
        <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
          <Cena horizontal={horizontal} volume={(fr) => interpolate(fr, [videoFrames - 15, videoFrames], [1, 0], { extrapolateLeft: 'clamp' })} />
        </AbsoluteFill>
        {/* Escurece o topo e o pé para o texto ler bem sobre qualquer cena. */}
        <AbsoluteFill style={{ background: 'linear-gradient(rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 62%, rgba(0,0,0,.5) 100%)' }} />
        <div style={{ position: 'absolute', left: 56, top: 96 }}>
          <Logo altura={62} />
        </div>
        <Letreiro linhas={[`ESSA ${produto}`, 'VALE A PENA?']} entra={8} sai={Math.round(2.9 * REEL_FPS)} top={300} />
        {legendas.map((texto, i) => (
          <Legenda key={texto} texto={texto} inicio={Math.round((GANCHO_S + i * fatia) * REEL_FPS)} fim={Math.round((GANCHO_S + (i + 1) * fatia) * REEL_FPS)} bottom={420} />
        ))}
      </Sequence>
      <Sequence from={inicioDoFecho}>
        <Fecho produtoCompleto={produtoCompleto} />
      </Sequence>
    </AbsoluteFill>
  );
};
