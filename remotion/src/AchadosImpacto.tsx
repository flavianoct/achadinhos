import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';
import { duracaoDosAchados, musicaComFade, QUADROS, type ItemDosAchados, type PropsDosAchados } from './Achados';

carregarFonte();

/**
 * Reel de achados no estilo de impacto: o mesmo conteúdo e o mesmo tempo do "Achados" (o áudio de efeitos que o robô gera continua
 * sincronizado), mas com abertura "PARA!" tremendo, foto do produto que estoura na tela, números e provas que pulam e o fim com
 * "COMENTA ...". Sem preço, sem "exclusivo", sem logotipo de loja; aviso de publi em todo o vídeo.
 */

export const duracaoDosAchadosImpacto = duracaoDosAchados;

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const SOMBRA = '0 4px 18px rgba(0,0,0,.85), 0 0 4px rgba(0,0,0,.6)';
const VERDE = '#25D366';
const caber = (s: string, base: number, largura = 940) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.78)));
const foto = (src: string) => (/^(https?:|data:)/.test(src) ? src : staticFile(src));

const useTremida = (forca: number, duracao = 10) => {
  const f = useCurrentFrame();
  const v = interpolate(f, [0, duracao], [forca, 0], travar);
  return { x: Math.sin(f * 12.9) * v, y: Math.cos(f * 9.7) * v };
};

const Flash: React.FC<{ forca?: number; cor?: string }> = ({ forca = 0.8, cor = '#fff' }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: cor, opacity: interpolate(f, [0, 5], [forca, 0], travar), pointerEvents: 'none' }} />;
};

const Fundo: React.FC<{ cor?: string }> = ({ cor = MARCA.vermelho }) => {
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

/** Abertura: "PARA!" tremendo e, depois, a frase de gancho. */
const Gancho: React.FC<{ p: PropsDosAchados }> = ({ p }) => {
  const f = useCurrentFrame();
  const t = useTremida(30, 12);
  const frase = p.frase?.length ? p.frase.slice(0, 2) : [p.promessa];
  return (
    <AbsoluteFill>
      <Fundo />
      {f < 18 ? (
        <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px)` }}>
          <Grande y={640} tamanho={330}>PARA!</Grande>
          <Flash forca={1} />
        </AbsoluteFill>
      ) : (
        <Sequence from={18}>
          <div style={{ position: 'absolute', top: 360, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={100} /></div>
          {frase.map((l, k) => (
            <Grande key={k} y={620 + k * 150} tamanho={96} cor={k ? MARCA.amarelo : '#fff'} atraso={k * 4}>{l}</Grande>
          ))}
          <Grande y={1000} tamanho={56} atraso={12}>{p.promessa}</Grande>
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** Um produto: a foto estoura na tela, o número pula e as provas aparecem uma a uma. */
const Produto: React.FC<{ item: ItemDosAchados; n: number }> = ({ item, n }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bate = spring({ frame: f, fps, config: { damping: 9, stiffness: 420 } });
  const t = useTremida(16, 7);
  const lado = n % 2 ? 1 : -1;
  return (
    <AbsoluteFill>
      <Fundo cor={item.cor} />
      <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px)` }}>
        <div style={{ position: 'absolute', left: 100, top: 400, width: 880, height: 820, borderRadius: 48, background: '#fff', border: `12px solid ${item.cor}`, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)', transform: `scale(${2.3 - 1.3 * bate}) rotate(${lado * (1 - bate) * 12 + lado * 1.5}deg)` }}>
          <Img src={foto(item.imagem)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 60, top: 330, width: 130, height: 130, borderRadius: 65, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${bate}) rotate(-8deg)`, boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>{n}</div>
      {item.nome.slice(0, 2).map((l, k) => (
        <Grande key={k} y={1270 + k * 92} tamanho={76} atraso={4 + k * 3}>{l}</Grande>
      ))}
      <div style={{ position: 'absolute', top: 1470, width: '100%', display: 'flex', justifyContent: 'center', gap: 18 }}>
        {[...(item.selo ? [item.selo.texto] : []), ...item.provas].slice(0, 3).map((s, k) => {
          const pop = spring({ frame: f - 14 - k * 5, fps, config: { damping: 8, stiffness: 300 } });
          return <div key={k} style={{ padding: '12px 28px', borderRadius: 40, background: k === 0 && item.selo ? VERDE : 'rgba(14,14,16,.88)', border: `3px solid ${MARCA.amarelo}`, color: k === 0 && item.selo ? '#06210F' : '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(s, 40, 300), transform: `scale(${pop})` }}>{s}</div>;
        })}
      </div>
      <Flash forca={0.5} cor={item.cor} />
    </AbsoluteFill>
  );
};

/** Fim: as fotos em mosaico e o pedido para comentar (o número do produto, ou QUERO). */
const Fim: React.FC<{ p: PropsDosAchados }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f - 6, fps, config: { damping: 8, stiffness: 260 } });
  const pulsa = 1 + Math.sin(f / 3) * 0.04;
  const numeros = p.itens.map((_, i) => i + 1).join(', ').replace(/, (\d)$/, ' OU $1');
  const texto = p.comentaQuero && p.itens.length === 1 ? 'COMENTA QUERO' : `COMENTA ${numeros}`;
  return (
    <AbsoluteFill>
      <Fundo cor={VERDE} />
      <Grande y={250} tamanho={96}>QUAL VOCÊ LEVARIA?</Grande>
      <div style={{ position: 'absolute', top: 430, left: 70, right: 70, display: 'flex', justifyContent: 'center', gap: 22 }}>
        {p.itens.slice(0, 3).map((it, i) => {
          const s = spring({ frame: f - 2 - i * 4, fps, config: { damping: 9, stiffness: 300 } });
          return (
            <div key={i} style={{ position: 'relative', flex: 1, height: 300, borderRadius: 28, background: '#fff', border: `8px solid ${it.cor}`, overflow: 'hidden', transform: `scale(${s})` }}>
              <Img src={foto(it.imagem)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              <div style={{ position: 'absolute', left: 8, top: 8, width: 56, height: 56, borderRadius: 28, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', top: 860, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '34px 56px', borderRadius: 100, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: caber(texto, 84, 800), boxShadow: '0 0 0 14px rgba(37,211,102,.3), 0 24px 60px rgba(0,0,0,.55)', whiteSpace: 'nowrap' }}>{texto}</div>
      </div>
      <Grande y={1110} tamanho={50} atraso={10}>e eu te mando o link no direct</Grande>
      {p.grupo ? <Grande y={1230} tamanho={44} cor={MARCA.amarelo} atraso={16}>{p.grupo}</Grande> : null}
    </AbsoluteFill>
  );
};

/** Vozes da biblioteca (public/vozes): a abertura, "número N" em cada produto e o pedido para comentar no fim. */
export type VozesDoImpacto = { gancho: string; itens: string[]; fim: string };

export const AchadosImpacto: React.FC<PropsDosAchados & { vozes?: VozesDoImpacto }> = (p) => {
  const frame = useCurrentFrame();
  const total = duracaoDosAchados(p.itens.length);
  const cenas: Array<[number, number, React.ReactNode]> = [[0, QUADROS.gancho, <Gancho key="g" p={p} />]];
  p.itens.forEach((it, i) => cenas.push([QUADROS.gancho + i * QUADROS.item, QUADROS.gancho + (i + 1) * QUADROS.item, <Produto key={i} item={it} n={i + 1} />]));
  cenas.push([QUADROS.gancho + p.itens.length * QUADROS.item, total, <Fim key="f" p={p} />]);
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
          {p.vozes.itens.slice(0, p.itens.length).map((v, i) => (
            <Sequence key={i} from={QUADROS.gancho + i * QUADROS.item + 4}><Audio src={staticFile(v)} /></Sequence>
          ))}
          <Sequence from={QUADROS.gancho + p.itens.length * QUADROS.item + 4}><Audio src={staticFile(p.vozes.fim)} /></Sequence>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
