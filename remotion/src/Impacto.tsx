import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Reel de impacto (13 s): feito para segurar o dedo na tela. Abre com "PARA!" tremendo e piscando, fotos reais de ofertas estouram na tela
 * em cortes de menos de meio segundo, números e selos pulam, e fecha com "COMENTA QUERO". Mesmas regras de anúncio dos outros vídeos
 * (sem preço, sem "exclusivo", sem logotipo de loja) e com o aviso de publi/afiliado. Cenas coladas na voz (public/voz-impacto.mp3).
 */

export const IMPACTO_FPS = 30;
/** Quadro em que cada cena termina, na ordem da voz: "Para!", "perdendo oferta boa", "todo dia dezenas...", "É grátis!", "Comenta QUERO". */
export const FIM_DO_IMPACTO = { para: 21, perdendo: 89, dezenas: 228, gratis: 257, chamada: 354 };
export const DURACAO_DO_IMPACTO = FIM_DO_IMPACTO.chamada;

export type PropsDoImpacto = { voz: string; musica?: string };

const FOTOS = ['divulgacao/p1.jpg', 'divulgacao/p2.jpg', 'divulgacao/p3.jpg', 'divulgacao/p4.jpg', 'divulgacao/p5.jpg', 'divulgacao/p6.jpg', 'divulgacao/p7.jpg', 'divulgacao/p8.jpg'];
const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const SOMBRA = '0 4px 18px rgba(0,0,0,.85), 0 0 4px rgba(0,0,0,.6)';
const VERDE = '#25D366';

const caber = (s: string, base: number, largura = 960) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.78)));

/** Tremida de câmera: forte no começo da cena e some. */
const useTremida = (forca: number, duracao = 10) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [0, duracao], [forca, 0], travar);
  return { x: Math.sin(f * 12.9) * v, y: Math.cos(f * 9.7) * v, r: Math.sin(f * 7.3) * v * 0.06 };
};

const Flash: React.FC<{ forca?: number; cor?: string }> = ({ forca = 0.9, cor = '#fff' }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: cor, opacity: interpolate(f, [0, 6], [forca, 0], travar), pointerEvents: 'none' }} />;
};

const Fundo: React.FC = () => {
  const f = useCurrentFrame();
  const pulso = 0.35 + 0.15 * Math.sin(f / 4);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, rgba(225,6,0,${pulso}) 0%, rgba(14,14,16,0) 65%)` }} />
      <AbsoluteFill style={{ opacity: 0.1, background: `repeating-linear-gradient(115deg, #fff 0 4px, transparent 4px 60px)`, transform: `translateX(${(f * 6) % 64}px)` }} />
    </AbsoluteFill>
  );
};

const Grande: React.FC<{ y: number; tamanho: number; cor?: string; atraso?: number; inclina?: number; children: string }> = ({ y, tamanho, cor = '#fff', atraso = 0, inclina = 0, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - atraso, fps, config: { damping: 7, stiffness: 320 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: caber(children, tamanho), color: cor, whiteSpace: 'nowrap', textShadow: SOMBRA, WebkitTextStroke: `4px ${MARCA.fundo}`, paintOrder: 'stroke fill', opacity: Math.min(1, s * 3), transform: `scale(${0.2 + s * 0.8}) rotate(${inclina}deg)` }}>
      {children}
    </div>
  );
};

/** Cena 1: "PARA!" ocupa a tela, treme e pisca. */
const Para: React.FC = () => {
  const t = useTremida(34, 14);
  return (
    <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg)` }}>
      <AbsoluteFill style={{ background: 'rgba(225,6,0,.55)' }} />
      <Grande y={640} tamanho={330} cor="#fff">PARA!</Grande>
      <Flash forca={1} />
    </AbsoluteFill>
  );
};

/** Uma foto grande que "bate" na tela (zoom, tremida e flash curto) e some no corte seguinte. */
const FotoQueBate: React.FC<{ src: string; lado: number; cor: string }> = ({ src, lado, cor }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bate = spring({ frame: f, fps, config: { damping: 9, stiffness: 420 } });
  const t = useTremida(14, 6);
  return (
    <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px)` }}>
      <div style={{ position: 'absolute', left: 90, top: 560, width: 900, height: 900, borderRadius: 48, background: '#fff', border: `12px solid ${cor}`, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)', transform: `scale(${2.4 - 1.4 * bate}) rotate(${lado * (1 - bate) * 14 + lado * 2}deg)` }}>
        <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <Flash forca={0.45} cor={cor} />
    </AbsoluteFill>
  );
};

/** Cena 2: "VOCÊ ESTÁ PERDENDO OFERTA BOA" e as fotos estourando em cortes de ~0,4 s. */
const Perdendo: React.FC = () => {
  const corte = 11;
  const cores = [MARCA.vermelho, MARCA.amarelo, VERDE, '#0ea5e9'];
  return (
    <AbsoluteFill>
      {Array.from({ length: 6 }, (_, i) => (
        <Sequence key={i} from={i * corte} durationInFrames={corte}>
          <FotoQueBate src={FOTOS[i % FOTOS.length]!} lado={i % 2 ? 1 : -1} cor={cores[i % cores.length]!} />
        </Sequence>
      ))}
      <Grande y={250} tamanho={96} cor="#fff">VOCÊ ESTÁ</Grande>
      <Grande y={360} tamanho={110} cor={MARCA.amarelo} atraso={4}>PERDENDO</Grande>
      <Grande y={1340} tamanho={100} cor="#fff" atraso={9}>OFERTA BOA</Grande>
    </AbsoluteFill>
  );
};

/** Cena 3: "TODO DIA, DEZENAS DE PROMOÇÕES": mosaico de fotos pulando e o selo de preço conferido. */
const Dezenas: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const celulas = Array.from({ length: 8 }, (_, i) => i);
  const selo = spring({ frame: f - 60, fps, config: { damping: 8, stiffness: 260 } });
  const contagem = Math.round(interpolate(f, [4, 60], [0, 40], travar));
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 430, left: 60, right: 60, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {celulas.map((i) => {
          const entra = spring({ frame: f - 6 - i * 4, fps, config: { damping: 9, stiffness: 300 } });
          const pulo = Math.sin((f + i * 5) / 5) * 6;
          return (
            <div key={i} style={{ height: 250, borderRadius: 28, background: '#fff', overflow: 'hidden', transform: `scale(${entra}) translateY(${pulo}px) rotate(${(i % 2 ? 1 : -1) * 2}deg)`, opacity: Math.min(1, entra * 2), boxShadow: '0 14px 34px rgba(0,0,0,.5)' }}>
              <Img src={staticFile(FOTOS[i]!)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          );
        })}
      </div>
      <Grande y={190} tamanho={84} cor="#fff">TODO DIA</Grande>
      <Grande y={286} tamanho={96} cor={MARCA.amarelo} atraso={5}>{`DEZENAS DE OFERTAS`}</Grande>
      <div style={{ position: 'absolute', top: 1560, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${selo})` }}>
        <div style={{ padding: '18px 44px', borderRadius: 60, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: 52, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }}>✔ PREÇO CONFERIDO ANTES</div>
      </div>
      <div style={{ position: 'absolute', top: 395, right: 70, fontFamily: FONTE, fontWeight: 900, fontSize: 1, color: 'transparent' }}>{contagem}</div>
    </AbsoluteFill>
  );
};

/** Cena 4: carimbo "É GRÁTIS!". */
const Gratis: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bate = spring({ frame: f, fps, config: { damping: 6, stiffness: 400 } });
  const t = useTremida(22, 10);
  return (
    <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px)` }}>
      <AbsoluteFill style={{ background: 'rgba(14,14,16,.6)' }} />
      <div style={{ position: 'absolute', top: 700, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: "30px 60px 24px", border: `14px solid ${MARCA.amarelo}`, borderRadius: 36, background: MARCA.vermelho, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: 135, lineHeight: 1, transform: `scale(${3.2 - 2.2 * bate}) rotate(-7deg)`, opacity: Math.min(1, bate * 4), boxShadow: '0 30px 70px rgba(0,0,0,.6)', whiteSpace: 'nowrap' }}>É GRÁTIS!</div>
      </div>
      <Flash forca={0.7} cor={MARCA.amarelo} />
    </AbsoluteFill>
  );
};

/** Cena 5: chamada para comentar, com o botão pulsando e o dedo apontando. */
const Chamada: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f - 2, fps, config: { damping: 8, stiffness: 260 } });
  const pulsa = 1 + Math.sin(f / 3) * 0.05;
  const dedo = Math.sin(f / 3) * 22;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'rgba(4,30,14,.72)' }} />
      <div style={{ position: 'absolute', top: 300, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={120} /></div>
      <Grande y={520} tamanho={100} cor="#fff">GRUPO DE OFERTAS</Grande>
      <div style={{ position: 'absolute', top: 760, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '38px 70px', borderRadius: 100, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: caber('COMENTA QUERO', 96, 820), boxShadow: '0 0 0 16px rgba(37,211,102,.3), 0 26px 60px rgba(0,0,0,.55)', whiteSpace: 'nowrap' }}>COMENTA QUERO</div>
      </div>
      <div style={{ position: 'absolute', top: 1010 + dedo, width: '100%', textAlign: 'center', fontSize: 150, textShadow: SOMBRA }}>👇</div>
      <Grande y={1290} tamanho={50} cor="#fff" atraso={10}>eu te mando o link no direct</Grande>
    </AbsoluteFill>
  );
};

export const Impacto: React.FC<PropsDoImpacto> = ({ voz, musica }) => {
  const frame = useCurrentFrame();
  const f = FIM_DO_IMPACTO;
  const cenas: Array<[number, number, React.ReactNode]> = [
    [0, f.para, <Para key="p" />],
    [f.para, f.perdendo, <Perdendo key="q" />],
    [f.perdendo, f.dezenas, <Dezenas key="d" />],
    [f.dezenas, f.gratis, <Gratis key="g" />],
    [f.gratis, f.chamada, <Chamada key="c" />],
  ];
  const volume = interpolate(frame, [0, 10, DURACAO_DO_IMPACTO - 20, DURACAO_DO_IMPACTO], [0, 0.2, 0.2, 0], travar);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Fundo />
      {cenas.map(([de, ate, no], i) => (
        <Sequence key={i} from={de} durationInFrames={ate - de}>{no}</Sequence>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1650, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '10px 26px', borderRadius: 30, background: 'rgba(0,0,0,.62)', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 27, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>Publi · links de afiliado · exemplos de ofertas · preços podem mudar</div>
      </div>
      <Audio src={staticFile(voz)} />
      {musica ? <Audio src={staticFile(musica)} volume={volume} /> : null}
    </AbsoluteFill>
  );
};
