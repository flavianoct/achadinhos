import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';
import { duracaoDoDestaque, QUADROS_DA_GALERIA, QUADROS_DO_DESTAQUE, type PropsDoDestaque } from './Destaque';

carregarFonte();

/**
 * Reel de um produto só, no estilo de impacto: "PARA!" tremendo, as fotos do anúncio estourando em cortes rápidos (ou os detalhes do
 * produto, quando há poucas fotos) e o fim com "COMENTA QUERO". Mesmos tempos e mesmas props do "Destaque", para os efeitos sonoros do
 * robô continuarem no lugar. Sem preço, sem logotipo de loja; aviso de publi em todo o vídeo.
 */

export const duracaoDoDestaqueImpacto = duracaoDoDestaque;

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const SOMBRA = '0 4px 18px rgba(0,0,0,.85), 0 0 4px rgba(0,0,0,.6)';
const VERDE = '#25D366';
const caber = (s: string, base: number, largura = 940) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.78)));
/** O preço grande: "R$ 77,90" e, em cima, o "de" riscado. */
const Preco: React.FC<{ preco: string; de?: string; y: number; atraso?: number }> = ({ preco, de, y, atraso = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - atraso, fps, config: { damping: 8, stiffness: 300 } });
  return (
    <div style={{ position: 'absolute', top: y, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${s})` }}>
      {de ? <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: 40, color: 'rgba(255,255,255,.85)', textDecoration: 'line-through', textDecorationColor: MARCA.vermelho, textDecorationThickness: 5, textShadow: SOMBRA }}>{de}</div> : null}
      <div style={{ padding: '4px 34px', borderRadius: 26, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: caber(preco, 112, 760), boxShadow: '0 14px 36px rgba(0,0,0,.55)', whiteSpace: 'nowrap', transform: 'rotate(-2deg)' }}>{preco}</div>
    </div>
  );
};

const foto = (src: string) => (/^(https?:|data:)/.test(src) ? src : staticFile(src));
const musicaComFade = (frame: number, total: number) => 0.8 * Math.min(1, frame / 15, Math.max(0, (total - frame) / 30));

const useTremida = (forca: number, duracao = 10) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [0, duracao], [forca, 0], travar);
  return { x: Math.sin(f * 12.9) * v, y: Math.cos(f * 9.7) * v };
};

const Flash: React.FC<{ forca?: number; cor?: string }> = ({ forca = 0.8, cor = '#fff' }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: cor, opacity: interpolate(f, [0, 5], [forca, 0], travar), pointerEvents: 'none' }} />;
};

const Fundo: React.FC<{ cor: string }> = ({ cor }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 28%, ${cor}66 0%, rgba(14,14,16,0) 66%)` }} />
      <AbsoluteFill style={{ opacity: 0.09, background: 'repeating-linear-gradient(115deg, #fff 0 4px, transparent 4px 60px)', transform: `translateX(${(f * 6) % 64}px)` }} />
    </AbsoluteFill>
  );
};

const Grande: React.FC<{ y: number; tamanho: number; cor?: string; atraso?: number; children: string }> = ({ y, tamanho, cor = '#fff', atraso = 0, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - atraso, fps, config: { damping: 7, stiffness: 320 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: caber(children, tamanho), color: cor, whiteSpace: 'nowrap', textShadow: SOMBRA, WebkitTextStroke: `4px ${MARCA.fundo}`, paintOrder: 'stroke fill', opacity: Math.min(1, s * 3), transform: `scale(${0.2 + s * 0.8})` }}>
      {children}
    </div>
  );
};

/** Uma foto grande que bate na tela (zoom, tremida, flash). */
const FotoQueBate: React.FC<{ src: string; cor: string; lado: number; legenda?: string; preco?: string; de?: string }> = ({ src, cor, lado, legenda, preco, de }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bate = spring({ frame: f, fps, config: { damping: 9, stiffness: 420 } });
  const t = useTremida(14, 6);
  return (
    <AbsoluteFill>
      <Fundo cor={cor} />
      <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px)` }}>
        <div style={{ position: 'absolute', left: 90, top: 330, width: 900, height: 1000, borderRadius: 48, background: '#fff', border: `12px solid ${cor}`, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)', transform: `scale(${2.3 - 1.3 * bate}) rotate(${lado * (1 - bate) * 12 + lado * 1.5}deg)` }}>
          <Img src={foto(src)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      </AbsoluteFill>
      {preco ? <Preco preco={preco} de={de} y={1340} atraso={3} /> : null}
      {legenda ? <Grande y={preco ? 1560 : 1400} tamanho={preco ? 56 : 84} cor={MARCA.amarelo} atraso={3}>{legenda}</Grande> : null}
      <Flash forca={0.45} cor={cor} />
    </AbsoluteFill>
  );
};

const Gancho: React.FC<{ p: PropsDoDestaque }> = ({ p }) => {
  const f = useCurrentFrame();
  const t = useTremida(12, 10);
  const frase = p.frase?.length ? p.frase.slice(0, 2) : p.fato ? [p.fato] : [];
  return (
    <AbsoluteFill>
      <Fundo cor={p.cor} />
      {f < 16 ? (
        <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px)` }}>
          <Grande y={640} tamanho={330}>PARA!</Grande>
          <Flash forca={1} />
        </AbsoluteFill>
      ) : (
        <Sequence from={16}>
          <div style={{ position: 'absolute', top: 360, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={100} /></div>
          {frase.map((l, k) => (
            <Grande key={k} y={620 + k * 150} tamanho={92} cor={k ? MARCA.amarelo : '#fff'} atraso={k * 4}>{l}</Grande>
          ))}
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const Fim: React.FC<{ p: PropsDoDestaque }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f - 6, fps, config: { damping: 8, stiffness: 260 } });
  const pulsa = 1 + Math.sin(f / 3) * 0.04;
  return (
    <AbsoluteFill>
      <Fundo cor={VERDE} />
      <div style={{ position: 'absolute', left: 190, top: 250, width: 700, height: 560, borderRadius: 40, background: '#fff', border: `10px solid ${p.cor}`, overflow: 'hidden', transform: `scale(${entra})` }}>
        <Img src={foto(p.imagem)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      {p.nome.slice(0, 2).map((l, k) => (
        <Grande key={k} y={850 + k * 92} tamanho={72} atraso={4 + k * 3}>{l}</Grande>
      ))}
      {p.preco ? <Preco preco={p.preco} de={p.de} y={1040} atraso={4} /> : null}
      <div style={{ position: 'absolute', top: p.preco ? 1245 : 1090, width: '100%', display: 'flex', justifyContent: 'center', gap: 16 }}>
        {p.provas.slice(0, 3).map((s, k) => (
          <div key={k} style={{ padding: '10px 24px', borderRadius: 36, background: 'rgba(14,14,16,.88)', border: `3px solid ${MARCA.amarelo}`, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(s, 36, 280) }}>{s}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: p.preco ? 1345 : 1250, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '30px 56px', borderRadius: 100, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: caber(p.comentaQuero ? 'DIGITA EU QUERO' : 'LINK NO DIRECT', 80, 820), boxShadow: '0 0 0 14px rgba(37,211,102,.3), 0 24px 60px rgba(0,0,0,.55)', whiteSpace: 'nowrap' }}>{p.comentaQuero ? 'DIGITA EU QUERO' : 'LINK NO DIRECT'}</div>
      </div>
      {p.comentaQuero ? <Grande y={p.preco ? 1530 : 1430} tamanho={50} atraso={10}>aí mandamos o link no direct</Grande> : null}
    </AbsoluteFill>
  );
};

export type VozesDoDestaque = { gancho: string; fim: string };

export const DestaqueImpacto: React.FC<PropsDoDestaque & { vozes?: VozesDoDestaque }> = (p) => {
  const total = duracaoDoDestaque(p);
  const cores = [p.cor, MARCA.amarelo, VERDE, '#0ea5e9'];
  const cenas: Array<[number, number, React.ReactNode]> = [];
  const galeria = p.fotos && p.fotos.length >= 3 ? p.fotos.slice(0, 7) : undefined;
  let inicioDoFim: number;
  if (galeria) {
    const g = QUADROS_DA_GALERIA;
    cenas.push([0, g.gancho, <Gancho key="g" p={p} />]);
    galeria.forEach((src, i) => cenas.push([g.gancho + i * g.foto, g.gancho + (i + 1) * g.foto, <FotoQueBate key={i} src={src} cor={cores[i % cores.length]!} lado={i % 2 ? 1 : -1} preco={p.preco} de={p.de} />]));
    inicioDoFim = g.gancho + galeria.length * g.foto;
  } else {
    const q = QUADROS_DO_DESTAQUE;
    cenas.push([0, q.gancho, <Gancho key="g" p={p} />]);
    for (let i = 0; i < 3; i++) cenas.push([q.gancho + i * q.detalhe, q.gancho + (i + 1) * q.detalhe, <FotoQueBate key={i} src={p.imagem} cor={cores[i % cores.length]!} lado={i % 2 ? 1 : -1} legenda={p.provas[i]} preco={p.preco} de={p.de} />]);
    inicioDoFim = q.gancho + 3 * q.detalhe;
  }
  cenas.push([inicioDoFim, total, <Fim key="f" p={p} />]);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      {cenas.map(([de, ate, no], i) => (
        <Sequence key={i} from={de} durationInFrames={ate - de}>{no}</Sequence>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1650, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '10px 26px', borderRadius: 30, background: 'rgba(0,0,0,.62)', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 27, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>Publi · link de afiliado · preço pode mudar</div>
      </div>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
      {p.musica ? <Audio src={staticFile(p.musica)} volume={(f) => musicaComFade(f, total) * (p.vozes ? 0.55 : 1)} /> : null}
      {p.vozes ? (
        <>
          <Sequence from={0}><Audio src={staticFile(p.vozes.gancho)} /></Sequence>
          <Sequence from={inicioDoFim + 4}><Audio src={staticFile(p.vozes.fim)} /></Sequence>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
