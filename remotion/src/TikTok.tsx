import React from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Cena } from './Cena';
import { Aviso, FaixaDoGrupo, FONTE, FundoDaMarca, Logo, MARCA } from './marca';

export type PropsDoTikTok = {
  /** Gancho de abertura (aparece sobre o melhor momento do vídeo, antes do corte). */
  gancho: string;
  /** Passos da cena, uma palavra-chave por vez, na ordem do vídeo. */
  passos: string[];
  /** Duração do vídeo de entrada, em segundos (o comando `gerar` mede sozinho). */
  duracaoS: number;
  /** Vídeo de entrada horizontal (o comando `gerar` detecta sozinho). */
  horizontal?: boolean;
};

export const TIKTOK_FPS = 30;
/** Abertura: o melhor momento do vídeo (a cena do final) mostrado primeiro, para prender nos primeiros segundos. */
const ABERTURA_S = 1.5;
/** O corpo roda mais rápido (ritmo de TikTok) e pula o fim, que já foi mostrado na abertura. */
const VELOCIDADE = 1.2;
const FECHO_S = 2.4;
/** A abertura mostra o último 1,6 s do vídeo; o corpo roda do começo até 1,4 s antes do fim. */
const aberturaDe = (duracaoS: number) => Math.max(0, duracaoS - 1.6);
const corpoDaFonte = (duracaoS: number) => Math.max(2, duracaoS - 1.4);
export const duracaoDoTikTok = (duracaoS: number) => Math.round((ABERTURA_S + corpoDaFonte(duracaoS) / VELOCIDADE + FECHO_S) * TIKTOK_FPS);

/** Legenda grande estilo TikTok: branco com contorno preto, a palavra em destaque pula. */
const Passo: React.FC<{ n: number; texto: string; duracao: number }> = ({ n, texto, duracao }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 10, stiffness: 180 } });
  const sai = interpolate(f, [duracao - 4, duracao], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 60, right: 200, top: 1060, textAlign: 'left', opacity: sai, transform: `scale(${0.8 + 0.2 * pop})`, transformOrigin: '0% 50%', fontFamily: FONTE, fontWeight: 900 }}>
      <span style={{ display: 'inline-block', background: MARCA.vermelho, color: MARCA.branco, borderRadius: 18, padding: '4px 26px', fontSize: 70, marginRight: 22, verticalAlign: 'middle' }}>{n}</span>
      <span style={{ fontSize: 108, color: MARCA.branco, WebkitTextStroke: '10px #000', paintOrder: 'stroke fill', verticalAlign: 'middle', textTransform: 'uppercase' }}>{texto}</span>
    </div>
  );
};

const Abertura: React.FC<{ gancho: string; de: number; horizontal?: boolean }> = ({ gancho, de, horizontal }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(f, [0, 12, 45], [1.18, 1.0, 1.06], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pop = spring({ frame: f - 2, fps, config: { damping: 9, stiffness: 200 } });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Cena horizontal={horizontal} trimBefore={Math.round(de * TIKTOK_FPS)} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(rgba(0,0,0,.2) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.55) 100%)' }} />
      <div style={{ position: 'absolute', left: 50, right: 50, top: 240, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: '50% 0' }}>
        <span style={{ fontSize: 88, lineHeight: 1.05, color: MARCA.branco, WebkitTextStroke: '10px #000', paintOrder: 'stroke fill', textTransform: 'uppercase' }}>{gancho}</span>
      </div>
    </AbsoluteFill>
  );
};

const Fecho: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <FundoDaMarca />
      <div style={{ position: 'absolute', top: 540, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Logo altura={90} />
      </div>
      <div style={{ position: 'absolute', top: 800, transform: `scale(${0.8 + 0.2 * pop})` }}>
        <FaixaDoGrupo largura={880} />
      </div>
      <Aviso bottom={740} />
    </AbsoluteFill>
  );
};

export const TikTok: React.FC<PropsDoTikTok> = ({ gancho, passos, duracaoS, horizontal }) => {
  const aberturaF = Math.round(ABERTURA_S * TIKTOK_FPS);
  const corpoF = Math.round((corpoDaFonte(duracaoS) / VELOCIDADE) * TIKTOK_FPS);
  const fechoF = Math.round(FECHO_S * TIKTOK_FPS);
  const porPasso = Math.floor(corpoF / passos.length);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      {/* 1) Abertura: o melhor momento primeiro, com o gancho grande e uma batida de zoom. */}
      <Sequence durationInFrames={aberturaF}>
        <Abertura gancho={gancho} de={aberturaDe(duracaoS)} horizontal={horizontal} />
      </Sequence>

      {/* 2) Corpo: o vídeo do começo, acelerado, com um passo de cada vez. */}
      <Sequence from={aberturaF} durationInFrames={corpoF}>
        <Cena horizontal={horizontal} playbackRate={VELOCIDADE} />
        <AbsoluteFill style={{ background: 'linear-gradient(rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%)' }} />
        <div style={{ position: 'absolute', left: 56, top: 130 }}>
          <Logo altura={56} />
        </div>
        {passos.map((p, i) => (
          <Sequence key={p} from={i * porPasso} durationInFrames={porPasso}>
            <Passo n={i + 1} texto={p} duracao={porPasso} />
          </Sequence>
        ))}
      </Sequence>

      {/* 3) Fecho curto: o preço está no link da bio. */}
      <Sequence from={aberturaF + corpoF} durationInFrames={fechoF}>
        <Fecho />
      </Sequence>
    </AbsoluteFill>
  );
};
