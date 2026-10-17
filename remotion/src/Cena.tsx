import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, type VolumeProp } from 'remotion';

type Props = {
  /** Vídeo horizontal (16:9): fica no centro, um pouco ampliado, sobre o próprio vídeo desfocado. Vertical: preenche a tela. */
  horizontal?: boolean;
  trimBefore?: number;
  playbackRate?: number;
  volume?: VolumeProp;
};

/** O vídeo de entrada na tela 9:16, nos dois formatos de origem (vertical ou horizontal). */
export const Cena: React.FC<Props> = ({ horizontal, trimBefore, playbackRate, volume }) => {
  const src = staticFile('entrada.mp4');
  if (!horizontal) {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={src} trimBefore={trimBefore} playbackRate={playbackRate} volume={volume} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: 'blur(48px) brightness(0.55)', transform: 'scale(1.3)' }}>
        <OffthreadVideo src={src} trimBefore={trimBefore} playbackRate={playbackRate} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* Vídeo ampliado em 35%: preenche mais a tela e corta só um pouco das laterais, onde o produto não está. */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
        <OffthreadVideo src={src} trimBefore={trimBefore} playbackRate={playbackRate} volume={volume} style={{ width: '135%', height: 'auto', flex: 'none' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
