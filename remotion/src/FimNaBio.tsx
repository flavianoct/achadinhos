import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Simbolo } from './Identidade';
import { FONTE, Logo, MARCA } from './marca';

/**
 * A tela de corte do fim dos Reels, mostrando ONDE fica o link: o desenho do nosso perfil (@matapreco) com o link da bio em destaque e
 * um dedo apontando, como no vinde a mim. Se o post tiver número, aparece "OFERTA Nº 247" (o mesmo da legenda; a pessoa digita na página
 * da bio e cai no produto). Sem números de seguidores: só o que é fixo. Entra de uma vez (corte seco) e fica ~3,5 s.
 * O link do desenho precisa ser o primeiro link do perfil: a página das ofertas (bio.html).
 */
export const QUADROS_DO_FIM_NA_BIO = 105;
const LINK_DO_PERFIL = 'flavianoct.github.io/achadinhos/bio.html';

const foto = (src: string) => (/^(https?:|data:)/.test(src) ? src : staticFile(src));
const TEXTO = 'Arial, Helvetica, sans-serif';
const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Onde o dedo toca (na tela): dentro da caixa do link (y de 1062 a 1162), à direita do fim do texto, sem cobrir letra. */
const TOQUE = { x: 912, y: 1128 };
// A mão é desenhada em 112x140 com a ponta do indicador no ponto (50, 4); ela gira em volta da própria ponta, que não sai do lugar.
const MAO = { escala: 1.55, ponta: { x: 50, y: 4 }, giro: -28 };
const ANEL = 96;

export const FimNaBio: React.FC<{ codigo?: number; imagem?: string }> = ({ codigo, imagem }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: f, fps, config: { damping: 14, stiffness: 190 } });
  const destaque = spring({ frame: f - 14, fps, config: { damping: 9, stiffness: 160 } });
  // 0 = a ponta está tocando; o dedo se afasta na diagonal e volta.
  const recuo = (1 + Math.sin(f / 4)) * 9;
  const anel = (f % 24) / 24;
  const centro: React.CSSProperties = { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: FONTE, fontWeight: 900 };
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 55%, ${MARCA.amarelo}2e 0%, rgba(14,14,16,0) 62%)` }} />
      <div style={{ position: 'absolute', top: 110, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={66} /></div>
      <div style={{ ...centro, top: 250, fontSize: 124, color: '#fff', lineHeight: 1.05, whiteSpace: 'nowrap', transform: `scale(${entra})` }}>LINK NA BIO</div>
      {codigo ? (
        <div style={{ position: 'absolute', top: 420, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra})` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '18px 44px', borderRadius: 28, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 80, whiteSpace: 'nowrap' }}>
            {imagem ? <Img src={foto(imagem)} style={{ width: 104, height: 104, objectFit: 'contain', background: '#fff', borderRadius: 18 }} /> : null}
            OFERTA Nº {codigo}
          </div>
        </div>
      ) : null}

      {/* O desenho do perfil */}
      <div style={{ position: 'absolute', top: 640, left: 55, width: 970, height: 640, borderRadius: 44, background: '#000', border: '3px solid rgba(255,255,255,.16)', boxShadow: '0 30px 70px rgba(0,0,0,.6)', transform: `translateY(${interpolate(entra, [0, 1], [60, 0])}px)` }}>
        <div style={{ position: 'absolute', top: 40, left: 46, width: 196, height: 196, borderRadius: 196, background: MARCA.amarelo, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '7px solid #fff' }}>
          <Simbolo tamanho={150} etiqueta={MARCA.fundo} raio={MARCA.vermelho} corte={MARCA.amarelo} />
        </div>
        <div style={{ position: 'absolute', top: 70, left: 282, fontFamily: TEXTO, fontWeight: 700, fontSize: 56, color: '#fff' }}>matapreco</div>
        <div style={{ position: 'absolute', top: 150, left: 282, fontFamily: TEXTO, fontSize: 34, color: 'rgba(255,255,255,.75)' }}>Mata Preço · Achadinhos</div>
        <div style={{ position: 'absolute', top: 278, left: 46, fontFamily: TEXTO, fontSize: 36, color: '#fff', lineHeight: 1.45 }}>
          Grupo de promoções e achadinhos do dia<br />Preço conferido antes de postar
        </div>
        {/* O link em destaque */}
        <div style={{ position: 'absolute', top: 422, left: 26, right: 26, height: 100, borderRadius: 24, border: `6px solid ${MARCA.amarelo}`, background: 'rgba(255,214,10,.14)', display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 28, transform: `scale(${0.9 + destaque * 0.1})`, boxShadow: `0 0 ${30 + Math.sin(f / 5) * 14}px ${MARCA.amarelo}88` }}>
          <svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
            <path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
          </svg>
          <div style={{ fontFamily: TEXTO, fontWeight: 700, fontSize: 36, color: '#9cc3ff', whiteSpace: 'nowrap' }}>{LINK_DO_PERFIL}</div>
        </div>
        <div style={{ position: 'absolute', top: 560, left: 46, right: 46, height: 52, display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, borderRadius: 14, background: 'rgba(255,255,255,.14)' }} />
          <div style={{ flex: 1, borderRadius: 14, background: 'rgba(255,255,255,.14)' }} />
        </div>
      </div>

      {/* O toque no link: o anel nasce no ponto do toque e a ponta do ponteiro encosta nele */}
      <div style={{ position: 'absolute', left: TOQUE.x - ANEL / 2, top: TOQUE.y - ANEL / 2, width: ANEL, height: ANEL, boxSizing: 'border-box', borderRadius: ANEL, border: `6px solid ${MARCA.amarelo}`, opacity: destaque * (1 - anel), transform: `scale(${0.3 + anel})` }} />
      <svg
        width={112 * MAO.escala}
        height={140 * MAO.escala}
        viewBox="0 0 112 140"
        style={{ position: 'absolute', overflow: 'visible', left: TOQUE.x - MAO.ponta.x * MAO.escala + recuo, top: TOQUE.y - MAO.ponta.y * MAO.escala + recuo, opacity: destaque, filter: 'drop-shadow(0 10px 18px rgba(0,0,0,.75))' }}
      >
        <g transform={`rotate(${MAO.giro} ${MAO.ponta.x} ${MAO.ponta.y})`} fill="#fff" stroke={MARCA.fundo} strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
          <path d="M40 14 a10 10 0 0 1 20 0 V56 a8 8 0 0 1 16 2 V64 a7.5 7.5 0 0 1 15 3 V74 a6.5 6.5 0 0 1 13 4 V101 C104 123 90 136 70 136 H58 C46 136 38 130 31 119 L14 90 C9 80 20 72 28 80 L40 94 Z" />
          <path d="M60 56 V78 M76 64 V80 M91 74 V86" fill="none" />
        </g>
      </svg>

      <div style={{ ...centro, top: 1380, fontSize: 56, color: '#fff' }}>1. Toque no nosso perfil</div>
      <div style={{ ...centro, top: 1470, fontSize: 56, color: MARCA.amarelo }}>2. Abra o link da bio</div>
      {codigo ? <div style={{ ...centro, top: 1560, fontSize: 56, color: '#fff' }}>3. Digite {codigo}</div> : null}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1680, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '8px 24px', borderRadius: 26, background: 'rgba(255,255,255,.08)', fontFamily: TEXTO, fontWeight: 700, fontSize: 26, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>Publi · link de afiliado · preço pode mudar</div>
      </div>
    </AbsoluteFill>
  );
};
