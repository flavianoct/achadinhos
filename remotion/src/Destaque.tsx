import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Reel de destaque: UM produto (pensado para moda e beleza, que vendem pelo olho), mostrado por inteiro, depois em detalhes (a câmera
 * aproxima o topo, o meio e a base da foto, como quem mostra o tecido e o caimento) e no fim o pedido: "COMENTA "EU QUERO"". Nunca
 * preço em reais: o fato do gancho e as provas são o que os dados provam.
 */

export const DESTAQUE_FPS = 30;
export const QUADROS_DO_DESTAQUE = { gancho: 45, detalhe: 50, fim: 105 };
/** Com 3 fotos ou mais do anúncio, o destaque vira galeria: uma foto grande por batida. */
export const QUADROS_DA_GALERIA = { gancho: 40, foto: 20, fim: 90 };
export const MAXIMO_DE_FOTOS = 7;
const fotosDaGaleria = (p: { fotos?: string[] }) => (p.fotos && p.fotos.length >= 3 ? p.fotos.slice(0, MAXIMO_DE_FOTOS) : undefined);
export const duracaoDoDestaque = (p: { fotos?: string[] } = {}) => {
  const fotos = fotosDaGaleria(p);
  if (fotos) return QUADROS_DA_GALERIA.gancho + fotos.length * QUADROS_DA_GALERIA.foto + QUADROS_DA_GALERIA.fim;
  return QUADROS_DO_DESTAQUE.gancho + 3 * QUADROS_DO_DESTAQUE.detalhe + QUADROS_DO_DESTAQUE.fim;
};

export type PropsDoDestaque = {
  /** Nome curto do produto, em até duas linhas. */
  nome: string[];
  imagem: string;
  /** O fato do gancho ("2,3 MIL VENDIDOS", "-40% OFF"); vazio, não aparece. */
  fato: string;
  /** Até 3 provas, uma por detalhe ("★ 4,9", "2,3 mil vendidos", "Frete grátis"). */
  provas: string[];
  cor: string;
  comentaQuero: boolean;
  audio?: string;
  /** Todas as fotos do anúncio (a primeira é a principal). Com 3 ou mais, o vídeo vira galeria. */
  fotos?: string[];
};

const caber = (s: string, base: number, largura = 940) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.74)));
const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sombra = '0 6px 22px rgba(0,0,0,.55)';

const Fundo: React.FC<{ imagem: string; cor: string }> = ({ imagem, cor }) => (
  <AbsoluteFill style={{ background: MARCA.fundo, overflow: 'hidden' }}>
    <Img src={imagem} style={{ position: 'absolute', inset: -200, width: 'calc(100% + 400px)', height: 'calc(100% + 400px)', objectFit: 'cover', filter: 'blur(60px) saturate(1.5) brightness(0.55)', transform: 'scale(1.2)' }} />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, ${cor}55 0%, transparent 60%), linear-gradient(180deg, rgba(14,14,16,.25) 0%, rgba(14,14,16,.1) 40%, rgba(14,14,16,.9) 78%, ${MARCA.fundo} 100%)` }} />
  </AbsoluteFill>
);

const Linha: React.FC<{ y: number; tamanho: number; cor: string; italico?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ y, tamanho, cor, italico, children, style }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: italico ? 'italic' : 'normal', fontSize: tamanho, lineHeight: 1.05, color: cor, whiteSpace: 'nowrap', textShadow: sombra, ...style }}>
    {children}
  </div>
);

/** O produto inteiro num cartão branco grande. */
const Inteiro: React.FC<{ imagem: string; escala: number }> = ({ imagem, escala }) => (
  <div style={{ position: 'absolute', left: 70, top: 330, width: 940, height: 1000, borderRadius: 46, background: '#fff', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,.55)', transform: `scale(${escala})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Img src={imagem} style={{ width: '92%', height: '92%', objectFit: 'contain' }} />
  </div>
);

/** Gancho: o produto entra crescendo e o fato carimba por cima. */
const Gancho: React.FC<{ p: PropsDoDestaque }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 13, stiffness: 150 } });
  const fato = spring({ frame: frame - 8, fps, config: { damping: 8, stiffness: 260 } });
  return (
    <AbsoluteFill>
      <Fundo imagem={p.imagem} cor={p.cor} />
      <div style={{ position: 'absolute', top: 262, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={52} /></div>
      <Inteiro imagem={p.imagem} escala={0.85 + entra * 0.15} />
      {p.fato ? (
        <Linha y={1350} tamanho={caber(p.fato, 120)} cor={MARCA.amarelo} italico style={{ transform: `scale(${2.2 - fato * 1.2}) rotate(-3deg)`, opacity: Math.min(1, fato * 2), WebkitTextStroke: `3px ${MARCA.fundo}` }}>{p.fato}</Linha>
      ) : null}
      {p.nome.map((l, k) => (
        <Linha key={k} y={1490 + k * 66} tamanho={caber(l, 56)} cor="#fff" style={{ opacity: interpolate(frame, [12 + k * 4, 20 + k * 4], [0, 1], travar) }}>{l}</Linha>
      ))}
    </AbsoluteFill>
  );
};

/** Um detalhe: a câmera aproxima uma parte da foto (topo, meio ou base) e uma prova aparece embaixo. */
const Detalhe: React.FC<{ p: PropsDoDestaque; parte: 0 | 1 | 2 }> = ({ p, parte }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, QUADROS_DO_DESTAQUE.detalhe], [1.9, 2.2]);
  const foco = ['30%', '50%', '72%'][parte];
  const prova = p.provas[parte];
  const chip = spring({ frame: frame - 6, fps, config: { damping: 9, stiffness: 240 } });
  const entra = interpolate(frame, [0, 6], [0, 1], travar);
  return (
    <AbsoluteFill>
      <Fundo imagem={p.imagem} cor={p.cor} />
      <div style={{ position: 'absolute', left: 40, top: 300, width: 1000, height: 1080, borderRadius: 46, background: '#fff', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,.55)', opacity: entra }}>
        <Img src={p.imagem} style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom})`, transformOrigin: `50% ${foco}`, filter: `blur(${(1 - entra) * 12}px)` }} />
      </div>
      {prova ? (
        <div style={{ position: 'absolute', top: 1440, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '18px 44px', borderRadius: 50, background: parte === 0 ? MARCA.amarelo : 'rgba(14,14,16,.82)', border: parte === 0 ? 'none' : `3px solid ${MARCA.amarelo}`, color: parte === 0 ? MARCA.fundo : '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(prova, 58, 800), transform: `scale(${chip})` }}>{prova}</div>
        </div>
      ) : null}
      <AbsoluteFill style={{ background: '#fff', opacity: interpolate(frame, [0, 4], [0.45, 0], travar), pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

/** Fim: o produto inteiro de volta e o pedido de comentário pulsando. */
const Fim: React.FC<{ p: PropsDoDestaque }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 10, stiffness: 190 } });
  const pulso = 1 + 0.05 * Math.sin(frame / 2.6);
  const chamada = p.comentaQuero ? 'COMENTA "EU QUERO"' : 'LINK NA BIO';
  const apoio = p.comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'PRA VER O PREÇO DE AGORA';
  return (
    <AbsoluteFill>
      <Fundo imagem={p.imagem} cor={p.cor} />
      <div style={{ position: 'absolute', top: 262, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={52} /></div>
      <div style={{ transform: 'scale(0.82)', transformOrigin: '50% 30%', position: 'absolute', inset: 0 }}>
        <Inteiro imagem={p.imagem} escala={0.95 + entra * 0.05} />
      </div>
      <Linha y={1310} tamanho={caber(chamada, 104)} cor={MARCA.amarelo} italico style={{ transform: `scale(${(0.6 + entra * 0.4) * pulso})`, WebkitTextStroke: `3px ${MARCA.fundo}` }}>{chamada}</Linha>
      <Linha y={1440} tamanho={caber(apoio, 44)} cor="#fff" style={{ opacity: entra }}>{apoio}</Linha>
      <div style={{ position: 'absolute', top: 1590, left: 0, right: 0, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 24 }}>{MARCA.aviso}</div>
      <AbsoluteFill style={{ background: '#fff', opacity: interpolate(frame, [0, 4], [0.5, 0], travar), pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

/** A foto grande, quase tela cheia, sobre ela mesma desfocada; entra com um "soco" de zoom e depois aproxima devagar. */
const FotoGrande: React.FC<{ imagem: string; duracao: number; escurecer?: number }> = ({ imagem, duracao, escurecer = 0 }) => {
  const frame = useCurrentFrame();
  const soco = interpolate(frame, [0, 5], [1.14, 1], travar);
  const devagar = interpolate(frame, [5, duracao], [1, 1.05], travar);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo, overflow: 'hidden' }}>
      <Img src={imagem} style={{ position: 'absolute', inset: -200, width: 'calc(100% + 400px)', height: 'calc(100% + 400px)', objectFit: 'cover', filter: 'blur(50px) brightness(0.6) saturate(1.3)' }} />
      <Img src={imagem} style={{ position: 'absolute', left: 0, top: 120, width: 1080, height: 1560, objectFit: 'contain', transform: `scale(${soco * devagar})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(14,14,16,.45) 0%, rgba(14,14,16,0) 18%, rgba(14,14,16,0) 62%, rgba(14,14,16,${0.75 + escurecer}) 86%, ${MARCA.fundo} 100%)` }} />
    </AbsoluteFill>
  );
};

/** Flash curtinho no corte. */
const Corte: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#fff', opacity: interpolate(frame, [0, 3], [0.5, 0], travar), pointerEvents: 'none' }} />;
};

/** Galeria: o gancho com a foto principal e o fato, uma foto por batida (com a prova girando embaixo) e o pedido no fim. */
const Galeria: React.FC<{ p: PropsDoDestaque; fotos: string[] }> = ({ p, fotos }) => {
  const q = QUADROS_DA_GALERIA;
  const frameGeral = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Sequence durationInFrames={q.gancho}>
        <FotoGrande imagem={fotos[0]!} duracao={q.gancho} />
        <div style={{ position: 'absolute', top: 250, width: '100%', display: 'flex', justifyContent: 'center' }}><div style={{ padding: '10px 26px', borderRadius: 40, background: 'rgba(14,14,16,.8)' }}><Logo altura={48} /></div></div>
        {p.fato ? (
          <Linha y={1370} tamanho={caber(p.fato, 120)} cor={MARCA.amarelo} italico style={{ transform: `scale(${2.2 - spring({ frame: frameGeral - 6, fps, config: { damping: 8, stiffness: 260 } }) * 1.2}) rotate(-3deg)`, WebkitTextStroke: `3px ${MARCA.fundo}` }}>{p.fato}</Linha>
        ) : null}
        {p.nome.map((l, k) => (
          <Linha key={k} y={1500 + k * 64} tamanho={caber(l, 56)} cor="#fff">{l}</Linha>
        ))}
      </Sequence>
      {fotos.map((foto, i) => (
        <Sequence key={i} from={q.gancho + i * q.foto} durationInFrames={q.foto}>
          <FotoGrande imagem={foto} duracao={q.foto} />
          {/* Bolinhas: quantas fotos faltam (a pessoa fica até o fim). */}
          <div style={{ position: 'absolute', top: 262, width: '100%', display: 'flex', justifyContent: 'center', gap: 12 }}>
            {fotos.map((_, k) => <div key={k} style={{ width: k === i ? 46 : 16, height: 16, borderRadius: 8, background: k <= i ? MARCA.amarelo : 'rgba(255,255,255,.4)' }} />)}
          </div>
          {p.provas.length ? (
            <div style={{ position: 'absolute', top: 1450, width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div style={{ padding: '16px 40px', borderRadius: 50, background: 'rgba(14,14,16,.82)', border: `3px solid ${MARCA.amarelo}`, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(p.provas[i % p.provas.length]!, 54, 800) }}>{p.provas[i % p.provas.length]}</div>
            </div>
          ) : null}
          <Corte />
        </Sequence>
      ))}
      <Sequence from={q.gancho + fotos.length * q.foto} durationInFrames={q.fim}>
        <FotoGrande imagem={fotos[0]!} duracao={q.fim} escurecer={0.1} />
        <div style={{ position: 'absolute', top: 250, width: '100%', display: 'flex', justifyContent: 'center' }}><div style={{ padding: '10px 26px', borderRadius: 40, background: 'rgba(14,14,16,.8)' }}><Logo altura={48} /></div></div>
        <FimDaGaleria p={p} />
        <Corte />
      </Sequence>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
    </AbsoluteFill>
  );
};

/** O pedido de comentário por cima da foto grande, pulsando. */
const FimDaGaleria: React.FC<{ p: PropsDoDestaque }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 10, stiffness: 190 } });
  const pulso = 1 + 0.05 * Math.sin(frame / 2.6);
  const chamada = p.comentaQuero ? 'COMENTA "EU QUERO"' : 'LINK NA BIO';
  const apoio = p.comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'PRA VER O PREÇO DE AGORA';
  return (
    <>
      <Linha y={1360} tamanho={caber(chamada, 104)} cor={MARCA.amarelo} italico style={{ transform: `scale(${(0.6 + entra * 0.4) * pulso})`, WebkitTextStroke: `3px ${MARCA.fundo}` }}>{chamada}</Linha>
      <Linha y={1490} tamanho={caber(apoio, 44)} cor="#fff" style={{ opacity: entra }}>{apoio}</Linha>
      <div style={{ position: 'absolute', top: 1600, left: 0, right: 0, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 24 }}>{MARCA.aviso}</div>
    </>
  );
};

export const Destaque: React.FC<PropsDoDestaque> = (p) => {
  const fotos = fotosDaGaleria(p);
  if (fotos) return <Galeria p={p} fotos={fotos} />;
  const q = QUADROS_DO_DESTAQUE;
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Sequence durationInFrames={q.gancho}><Gancho p={p} /></Sequence>
      {([0, 1, 2] as const).map((parte) => (
        <Sequence key={parte} from={q.gancho + parte * q.detalhe} durationInFrames={q.detalhe}><Detalhe p={p} parte={parte} /></Sequence>
      ))}
      <Sequence from={q.gancho + 3 * q.detalhe} durationInFrames={q.fim}><Fim p={p} /></Sequence>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
    </AbsoluteFill>
  );
};
