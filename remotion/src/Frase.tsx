import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTE, MARCA } from './marca';

/**
 * A frase de gancho dos primeiros 1,5 segundo: até 2 linhas grandes no alto da tela (abaixo da faixa do nome do perfil), a primeira em
 * branco e a segunda em amarelo, cada uma entrando com um "soco" de escala.
 */
export const Frase: React.FC<{ linhas?: string[]; y?: number }> = ({ linhas, y = 250 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!linhas?.length) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {linhas.slice(0, 2).map((l, k) => {
        const entra = spring({ frame: frame - k * 5, fps, config: { damping: 9, stiffness: 260 } });
        const tamanho = Math.min(104, Math.floor(860 / (Math.max(1, l.length) * 0.66)));
        return (
          <div
            key={k}
            style={{
              padding: '6px 28px',
              borderRadius: 18,
              background: k === 0 ? 'rgba(14,14,16,.82)' : MARCA.amarelo,
              color: k === 0 ? '#fff' : MARCA.fundo,
              fontFamily: FONTE,
              fontWeight: 900,
              fontStyle: 'italic',
              fontSize: tamanho,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              transform: `scale(${0.4 + entra * 0.6}) rotate(${k === 0 ? -2 : 2}deg)`,
              opacity: interpolate(frame - k * 5, [0, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              boxShadow: '0 10px 30px rgba(0,0,0,.45)',
            }}
          >
            {l}
          </div>
        );
      })}
    </div>
  );
};
