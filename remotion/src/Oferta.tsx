import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';
import { duracaoDoDestaque, type PropsDoDestaque } from './Destaque';

carregarFonte();

/**
 * Reel "oferta", minimalista: o PRODUTO grande e pouca coisa em volta. Só o logo pequeno, o nome, UM botão ("DIGITA EU QUERO", que leva o
 * link do produto no direct) e a chamada diária para o canal. O preço só aparece se REEL_PRECO=1. Quase nenhum efeito: aproximação lenta
 * da foto e troca suave entre as fotos do anúncio. Mesmos tempos e props do "Destaque", para os efeitos sonoros do robô continuarem no lugar.
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
    <div style={{ position: 'absolute', left: 50, top: 170, width: 980, height: 1010, borderRadius: 36, background: '#fff', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
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
  const pulsa = 1 + Math.sin(frame / 6) * 0.02;
  const nome = p.nome.slice(0, 2).join(' ');
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 20%, ${MARCA.amarelo}26 0%, rgba(14,14,16,0) 62%)` }} />
      <div style={{ position: 'absolute', top: 70, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={64} /></div>
      <Fotos lista={lista} />
      <div style={{ position: 'absolute', top: 1205, left: 70, right: 70, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: caber(nome, 56, 940), lineHeight: 1.1, color: '#fff', textShadow: SOMBRA, whiteSpace: 'nowrap' }}>{nome}</div>
      {p.preco ? (
        <div style={{ position: 'absolute', top: 1280, width: '100%', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 22 }}>
          {p.de ? <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: 36, color: 'rgba(255,255,255,.7)', textDecoration: 'line-through', textDecorationColor: MARCA.vermelho, textDecorationThickness: 4 }}>{p.de}</div> : null}
          <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: caber(p.preco, 96, 600), color: MARCA.amarelo, textShadow: SOMBRA }}>{p.preco}</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: p.preco ? 1410 : 1330, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '20px 54px', borderRadius: 80, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: 52, whiteSpace: 'nowrap' }}>{p.comentaQuero ? 'DIGITA EU QUERO' : 'LINK NO DIRECT'}</div>
      </div>
      <div style={{ position: 'absolute', top: p.preco ? 1535 : 1455, width: '100%', textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: 34, color: MARCA.amarelo, textShadow: SOMBRA }}>OFERTAS TODO DIA NO CANAL · LINK NA BIO</div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1660, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '8px 24px', borderRadius: 26, background: 'rgba(0,0,0,.62)', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 26, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>Publi · link de afiliado · oferta pode ser alterada ou encerrada</div>
      </div>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
      {p.musica ? <Audio src={staticFile(p.musica)} volume={(f) => musicaComFade(f, total) * 0.7} /> : null}
    </AbsoluteFill>
  );
};
