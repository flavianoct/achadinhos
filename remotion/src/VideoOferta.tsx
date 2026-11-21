import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Reel com um VÍDEO REAL do produto (gravado, sem IA e sem alteração): o vídeo em tela cheia, com o mínimo por cima. O logo pequeno, o nome do
 * produto, um botão "DIGITA EU QUERO" que entra no fim e a chamada do canal. O som do próprio vídeo é mantido. Sem preço.
 */

export const VIDEO_OFERTA_FPS = 30;

export type PropsDoVideoOferta = {
  /** O vídeo (em public/). */
  video: string;
  /** Quantos quadros tem o vídeo (duração em s × 30). */
  quadros: number;
  /** Nome do produto, em até 2 linhas. */
  nome: string[];
  comentaQuero: boolean;
};

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const VERDE = '#25D366';
const SOMBRA = '0 3px 14px rgba(0,0,0,.85)';
const caber = (s: string, base: number, largura: number) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.78)));

export const duracaoDoVideoOferta = (p: { quadros: number }) => p.quadros;

export const VideoOferta: React.FC<PropsDoVideoOferta> = ({ video, quadros, nome, comentaQuero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const linhas = nome.slice(0, 2);
  const nomeEntra = interpolate(frame, [10, 24], [0, 1], travar);
  // O botão entra quando faltam ~3,6 s, para o produto aparecer limpo primeiro.
  const inicioDoBotao = Math.max(30, quadros - 108);
  const botao = spring({ frame: frame - inicioDoBotao, fps, config: { damping: 12, stiffness: 180 } });
  const pulsa = 1 + Math.sin(frame / 6) * 0.02;
  const fim = interpolate(frame, [inicioDoBotao - 6, inicioDoBotao + 8], [0, 1], travar);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <OffthreadVideo src={staticFile(video)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(14,14,16,.55) 0%, rgba(14,14,16,0) 16%, rgba(14,14,16,0) 58%, rgba(14,14,16,.92) 90%)' }} />
      <div style={{ position: 'absolute', top: 70, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={60} /></div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 1250, opacity: nomeEntra * (1 - fim * 0.0), textAlign: 'center' }}>
        {linhas.map((l, k) => (
          <div key={k} style={{ fontFamily: FONTE, fontWeight: 900, fontSize: caber(l, 58, 960), lineHeight: 1.12, color: '#fff', textShadow: SOMBRA, whiteSpace: 'nowrap' }}>{l}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 1440, width: '100%', display: 'flex', justifyContent: 'center', opacity: fim, transform: `scale(${botao * pulsa})` }}>
        <div style={{ padding: '20px 54px', borderRadius: 80, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: 52, whiteSpace: 'nowrap', boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>{comentaQuero ? 'DIGITA EU QUERO' : 'LINK NO DIRECT'}</div>
      </div>
      <div style={{ position: 'absolute', top: 1566, width: '100%', textAlign: 'center', opacity: fim, fontFamily: FONTE, fontWeight: 900, fontSize: 32, color: MARCA.amarelo, textShadow: SOMBRA }}>OFERTAS TODO DIA NO CANAL · LINK NA BIO</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1660, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '8px 24px', borderRadius: 26, background: 'rgba(0,0,0,.62)', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 26, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>Publi · link de afiliado · preço pode mudar</div>
      </div>
    </AbsoluteFill>
  );
};
