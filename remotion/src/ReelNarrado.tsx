import React from 'react';
import { AbsoluteFill, Audio, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FimNaBio } from './FimNaBio';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Reel de um vídeo de produto já narrado: gancho na abertura, legenda que acompanha a voz, selos com o que o anúncio informa e o corte
 * final "link na bio" com o número da oferta. Os tempos (em segundos) vêm nas props, medidos na narração.
 * Faixas seguras do Reels: nada importante nos 420 px de baixo.
 */
export interface Fala {
  de: number;
  ate: number;
  /** Palavras entre *asteriscos* saem em amarelo. */
  texto: string;
  /** Altura na tela (px): escolhida por cena, para não cobrir o produto. */
  y: number;
}

export interface PropsDoReelNarrado {
  video: string;
  /** Duração do vídeo do produto, em quadros (30 por segundo). */
  quadros: number;
  /** Quadros do corte final. */
  quadrosDoFim: number;
  /** Cortes de cena do vídeo (s): a aproximação recomeça em cada um. */
  cortes: number[];
  gancho: { linhas: string[]; ate: number };
  falas: Fala[];
  selo?: { de: number; texto: string; y: number };
  nota?: { de: number; texto: string; y: number };
  codigo: number;
  imagem?: string;
  direct?: boolean;
  vozDoFim?: string;
  musica?: string;
}

export const duracaoDoReelNarrado = (p: Pick<PropsDoReelNarrado, 'quadros' | 'quadrosDoFim'>) => p.quadros + p.quadrosDoFim;

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const contorno = '0 0 2px #000, 0 4px 18px rgba(0,0,0,.55)';

const Destacado: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split('*').map((t, i) => (
      <span key={i} style={{ color: i % 2 ? MARCA.amarelo : '#fff' }}>{t}</span>
    ))}
  </>
);

const Balao: React.FC<{ fala: Fala }> = ({ fala }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f, fps, config: { damping: 13, stiffness: 230, mass: 0.6 } });
  return (
    <div style={{ position: 'absolute', top: fala.y, left: 70, right: 130, display: 'flex', justifyContent: 'center', transform: `scale(${0.82 + entra * 0.18})`, opacity: Math.min(1, f / 2 + 0.4) }}>
      <div style={{ maxWidth: '100%', padding: '18px 34px 20px', borderRadius: 30, background: 'rgba(14,14,16,.88)', textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: 62, lineHeight: 1.14, textShadow: contorno, whiteSpace: 'pre-line' }}>
        <Destacado texto={fala.texto} />
      </div>
    </div>
  );
};

export const ReelNarrado: React.FC<PropsDoReelNarrado> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (segundos: number) => Math.round(segundos * fps);
  const inicios = [0, ...p.cortes.map(s)];
  const inicioDaCena = [...inicios].reverse().find((i) => f >= i) ?? 0;
  const zoom = 1 + Math.min(0.05, (f - inicioDaCena) * 0.00045);
  const total = duracaoDoReelNarrado(p);
  const some = interpolate(f, [s(p.gancho.ate) - 5, s(p.gancho.ate)], [1, 0], travar);
  const selo = p.selo ? spring({ frame: f - s(p.selo.de), fps, config: { damping: 10, stiffness: 170 } }) : 0;
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Sequence durationInFrames={p.quadros}>
        <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
          <OffthreadVideo src={staticFile(p.video)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
        <div style={{ position: 'absolute', top: 64, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={58} /></div>
        <div style={{ position: 'absolute', top: 140, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '4px 18px', borderRadius: 20, background: 'rgba(14,14,16,.6)', color: '#fff', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 24 }}>Publi · link de afiliado</div>
        </div>
      </Sequence>

      {/* O gancho já está na tela no primeiro quadro (é a capa e o que segura o dedo) */}
      {f < s(p.gancho.ate) ? (
        <div style={{ position: 'absolute', top: 215, left: 50, right: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: some }}>
          {p.gancho.linhas.map((linha, i) => (
            <div key={linha} style={{ padding: '14px 34px 18px', borderRadius: 24, background: i ? MARCA.amarelo : MARCA.fundo, color: i ? MARCA.fundo : '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: 82, whiteSpace: 'nowrap', boxShadow: '0 14px 34px rgba(0,0,0,.35)', transform: `rotate(${i ? 1.2 : -1.2}deg) scale(${1 + Math.max(0, 8 - f) * 0.008})` }}>{linha}</div>
          ))}
        </div>
      ) : null}

      {p.falas.map((fala) => (
        <Sequence key={fala.de} from={s(fala.de)} durationInFrames={Math.max(1, s(fala.ate) - s(fala.de))}>
          <Balao fala={fala} />
        </Sequence>
      ))}

      {p.selo && f >= s(p.selo.de) && f < p.quadros ? (
        <div style={{ position: 'absolute', top: p.selo.y, left: 40, right: 40, display: 'flex', justifyContent: 'center', transform: `scale(${selo})` }}>
          <div style={{ padding: '14px 30px', borderRadius: 60, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 42, whiteSpace: 'nowrap', boxShadow: '0 10px 26px rgba(0,0,0,.3)' }}>{p.selo.texto}</div>
        </div>
      ) : null}

      {p.nota && f >= s(p.nota.de) && f < p.quadros ? (
        <div style={{ position: 'absolute', top: p.nota.y, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '6px 20px', borderRadius: 20, background: 'rgba(14,14,16,.7)', color: '#fff', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 28 }}>{p.nota.texto}</div>
        </div>
      ) : null}

      <Sequence from={p.quadros}>
        <FimNaBio codigo={p.codigo} imagem={p.imagem} direct={p.direct} />
        {p.vozDoFim ? <Audio src={staticFile(p.vozDoFim)} /> : null}
      </Sequence>

      {p.musica ? <Audio src={staticFile(p.musica)} volume={(q) => interpolate(q, [0, 10, p.quadros, p.quadros + 10, total - 20, total], [0, 0.1, 0.1, 0.07, 0.07, 0], travar)} /> : null}
    </AbsoluteFill>
  );
};
