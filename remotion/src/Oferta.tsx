import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';
import { duracaoDoDestaque, type PropsDoDestaque } from './Destaque';

carregarFonte();

/**
 * Reel "oferta", no jeito dos perfis de promoção: limpo e informativo. O produto grande, a nota em estrelas, o preço grande (com o "de"
 * riscado) e a chamada para digitar EU QUERO. Quase sem efeito: só uma aproximação lenta da foto e a troca suave entre as fotos do
 * anúncio. Mesmos tempos e props do "Destaque", para os efeitos sonoros do robô continuarem no lugar. Aviso de publi no vídeo todo.
 */

export const duracaoDaOferta = duracaoDoDestaque;

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const VERDE = '#25D366';
const SOMBRA = '0 3px 14px rgba(0,0,0,.7)';
const caber = (s: string, base: number, largura: number) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.78)));
const foto = (src: string) => (/^(https?:|data:)/.test(src) ? src : staticFile(src));
const musicaComFade = (frame: number, total: number) => 0.8 * Math.min(1, frame / 15, Math.max(0, (total - frame) / 30));

type Props = PropsDoDestaque & { preco?: string; de?: string };

/** As fotos do anúncio, uma de cada vez, com troca suave (a cada ~1,5 s) e aproximação lenta. */
const Fotos: React.FC<{ lista: string[] }> = ({ lista }) => {
  const f = useCurrentFrame();
  const cada = 45;
  const i = Math.min(lista.length - 1, Math.floor(f / cada));
  const dentro = f - i * cada;
  const zoom = 1 + dentro * 0.0016;
  const entra = interpolate(dentro, [0, 8], [0, 1], travar);
  return (
    <div style={{ position: 'absolute', left: 60, top: 190, width: 960, height: 900, borderRadius: 36, background: '#fff', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
      <Img src={foto(lista[i]!)} style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: entra, transform: `scale(${zoom})` }} />
    </div>
  );
};

export const Oferta: React.FC<Props & { vozes?: unknown }> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = duracaoDoDestaque(p);
  const lista = p.fotos && p.fotos.length ? p.fotos.slice(0, 7) : [p.imagem];
  const entra = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 180 } });
  const pulsa = 1 + Math.sin(frame / 6) * 0.025;
  const nota = p.provas.find((s) => s.includes('★'));
  const outras = p.provas.filter((s) => s !== nota).slice(0, 2);
  const preco = p.preco;
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 20%, ${p.cor}40 0%, rgba(14,14,16,0) 62%)` }} />
      <div style={{ position: 'absolute', top: 70, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={72} /></div>
      <Fotos lista={lista} />
      {p.fato ? (
        <div style={{ position: 'absolute', left: 90, top: 215, padding: '10px 26px', borderRadius: 30, background: MARCA.vermelho, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(p.fato, 44, 440), boxShadow: '0 10px 26px rgba(0,0,0,.45)', transform: `scale(${entra})`, transformOrigin: 'left top' }}>{p.fato}</div>
      ) : null}
      <div style={{ position: 'absolute', top: 1115, left: 70, right: 70, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: Math.min(60, caber(p.nome.join(' '), 60, 1800) ), lineHeight: 1.1, color: '#fff', textShadow: SOMBRA }}>{p.nome.slice(0, 2).join(' ')}</div>
      <div style={{ position: 'absolute', top: 1255, width: '100%', display: 'flex', justifyContent: 'center', gap: 14 }}>
        {[...(nota ? [nota] : []), ...outras].map((s, k) => (
          <div key={k} style={{ padding: '8px 22px', borderRadius: 30, background: 'rgba(255,255,255,.1)', border: `2px solid ${MARCA.amarelo}`, color: nota && k === 0 ? MARCA.amarelo : '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: caber(s, 34, 320) }}>{s}</div>
        ))}
      </div>
      {preco ? (
        <div style={{ position: 'absolute', top: 1325, width: '100%', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 26 }}>
          {p.de ? <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: 40, color: 'rgba(255,255,255,.7)', textDecoration: 'line-through', textDecorationColor: MARCA.vermelho, textDecorationThickness: 4 }}>{p.de}</div> : null}
          <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: caber(preco, 112, 640), color: MARCA.amarelo, textShadow: SOMBRA }}>{preco}</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 1480, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '22px 56px', borderRadius: 80, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: 56, boxShadow: '0 0 0 10px rgba(37,211,102,.25)', whiteSpace: 'nowrap' }}>{p.comentaQuero ? 'DIGITA EU QUERO' : 'LINK NO DIRECT'}</div>
      </div>
      <div style={{ position: 'absolute', top: 1600, width: '100%', textAlign: 'center', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 30, color: 'rgba(255,255,255,.9)' }}>aí mandamos o link no direct</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1660, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '8px 24px', borderRadius: 26, background: 'rgba(0,0,0,.62)', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 26, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>Publi · link de afiliado · oferta pode ser alterada ou encerrada</div>
      </div>
      <Sequence from={0}>{p.audio ? <Audio src={staticFile(p.audio)} /> : null}</Sequence>
      {p.musica ? <Audio src={staticFile(p.musica)} volume={(f) => musicaComFade(f, total) * 0.7} /> : null}
    </AbsoluteFill>
  );
};
