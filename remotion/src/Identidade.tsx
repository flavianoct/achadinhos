import React from 'react';
import { AbsoluteFill } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE } from './marca';

carregarFonte();

/**
 * Identidade visual do Mata Preço (peças estáticas para imagem): o símbolo de sempre (etiqueta cortada por um raio), agora com o
 * AMARELO como cor principal, o preto como base e o vermelho só no que "mata o preço" (o risco e o raio). Peças: foto de perfil,
 * capas dos destaques, capa de convite ao grupo e a folha da identidade.
 */

export const COR = { preto: '#0E0E10', amarelo: '#FFD60A', vermelho: '#E10600', branco: '#FFFFFF', suave: '#A9A9B3', verde: '#25D366' };

/** O símbolo num quadro de 200x200: etiqueta (cor `etiqueta`), furo e raio (cor `raio`) com contorno na cor `corte`. */
export const Simbolo: React.FC<{ tamanho: number; etiqueta: string; raio: string; corte: string; style?: React.CSSProperties }> = ({ tamanho, etiqueta, raio, corte, style }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 200 200" style={style}>
    <g transform="rotate(-18 100 100)">
      <path d="M26 100 L74 50 H164 Q176 50 176 62 V138 Q176 150 164 150 H74 Z" fill={etiqueta} stroke={etiqueta} strokeWidth="10" strokeLinejoin="round" />
      <circle cx="70" cy="100" r="10" fill={corte} />
    </g>
    <path d="M128 10 L82 106 H112 L90 190 L154 84 H122 L146 10 Z" fill={raio} stroke={corte} strokeWidth="10" strokeLinejoin="round" paintOrder="stroke" />
  </svg>
);

/** O nome: MATA + PREÇO (riscado em vermelho). */
export const Nome: React.FC<{ tamanho: number; cor?: string; corPreco?: string }> = ({ tamanho, cor = COR.branco, corPreco = COR.amarelo }) => (
  <div style={{ fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: tamanho, lineHeight: 1, display: 'flex', gap: tamanho * 0.22, whiteSpace: 'nowrap' }}>
    <span style={{ color: cor }}>MATA</span>
    <span style={{ color: corPreco, position: 'relative' }}>
      PREÇO
      <span style={{ position: 'absolute', left: '-4%', right: '-4%', top: '48%', height: tamanho * 0.1, background: COR.vermelho, borderRadius: tamanho * 0.05, transform: 'rotate(-5deg)', boxShadow: `0 0 0 ${tamanho * 0.025}px ${corPreco === COR.amarelo ? COR.preto : COR.amarelo}` }} />
    </span>
  </div>
);

/** Foto de perfil: o símbolo grande, sem texto (a foto aparece pequena, e o nome ilegível nela só atrapalha). */
export const Perfil: React.FC<{ fundo: 'amarelo' | 'preto' }> = ({ fundo }) => {
  const amarelo = fundo === 'amarelo';
  return (
    <AbsoluteFill style={{ background: amarelo ? COR.amarelo : COR.preto, alignItems: 'center', justifyContent: 'center' }}>
      <Simbolo tamanho={760} etiqueta={amarelo ? COR.preto : COR.amarelo} raio={amarelo ? COR.vermelho : COR.vermelho} corte={amarelo ? COR.amarelo : COR.preto} />
    </AbsoluteFill>
  );
};

type Icone = 'cupom' | 'oferta' | 'grupo' | 'como' | 'frete' | 'novo';
/** Ícones simples de traço grosso (preto), no quadro de 120x120. */
const Desenho: React.FC<{ icone: Icone; cor: string }> = ({ icone, cor }) => {
  const p = { fill: 'none', stroke: cor, strokeWidth: 9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg width={340} height={340} viewBox="0 0 120 120">
      {icone === 'cupom' ? <><path d="M14 36 H106 V52 A10 10 0 0 0 106 72 V88 H14 V72 A10 10 0 0 0 14 52 Z" {...p} /><path d="M46 38 V86" {...p} strokeDasharray="2 12" /><path d="M64 70 L82 52 M66 54 h.1 M80 70 h.1" {...p} /></> : null}
      {icone === 'oferta' ? <><path d="M20 62 L62 20 H100 V58 L58 100 Z" {...p} /><circle cx="82" cy="38" r="4" fill={cor} /><path d="M50 78 L74 54" {...p} /></> : null}
      {icone === 'grupo' ? <><path d="M20 28 H100 V80 H52 L32 98 V80 H20 Z" {...p} /><path d="M38 50 H82 M38 64 H66" {...p} /></> : null}
      {icone === 'como' ? <><circle cx="60" cy="60" r="42" {...p} /><path d="M46 48 A14 14 0 1 1 66 60 Q60 64 60 72 M60 88 h.1" {...p} /></> : null}
      {icone === 'frete' ? <><path d="M12 38 H70 V84 H12 Z M70 52 H92 L106 66 V84 H70" {...p} /><circle cx="32" cy="88" r="9" fill={COR.amarelo} {...p} /><circle cx="88" cy="88" r="9" fill={COR.amarelo} {...p} /></> : null}
      {icone === 'novo' ? <path d="M70 8 L30 66 H58 L48 112 L92 50 H64 Z" {...p} /> : null}
    </svg>
  );
};

/** Capa de destaque (1080x1920; o Instagram mostra só um círculo no meio, então tudo fica na faixa central). */
export const Destaque: React.FC<{ icone: Icone; rotulo: string }> = ({ icone, rotulo }) => (
  <AbsoluteFill style={{ background: COR.amarelo, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 40 }}>
    <Desenho icone={icone} cor={COR.preto} />
    <div style={{ fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: 120, color: COR.preto, lineHeight: 1 }}>{rotulo}</div>
    <div style={{ position: 'absolute', bottom: 560, width: 200, height: 14, background: COR.vermelho, borderRadius: 7, transform: 'rotate(-5deg)' }} />
  </AbsoluteFill>
);

/** Capa de convite ao grupo (1080x1350): chamada grande, símbolo, "link na bio" e o selo de grátis. */
export const CapaDoGrupo: React.FC = () => (
  <AbsoluteFill style={{ background: COR.preto }}>
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 0%, ${COR.amarelo}33 0%, transparent 60%)` }} />
    <div style={{ position: 'absolute', top: 70, width: '100%', display: 'flex', justifyContent: 'center' }}><Nome tamanho={92} /></div>
    <div style={{ position: 'absolute', top: 250, left: 60, right: 60, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', color: COR.branco, fontSize: 118, lineHeight: 1.02 }}>
      AS OFERTAS <span style={{ color: COR.amarelo }}>DO DIA</span><br />NO SEU <span style={{ color: COR.verde }}>ZAP</span>
    </div>
    <div style={{ position: 'absolute', top: 700, width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Simbolo tamanho={380} etiqueta={COR.amarelo} raio={COR.vermelho} corte={COR.preto} />
    </div>
    <div style={{ position: 'absolute', top: 1110, width: '100%', display: 'flex', justifyContent: 'center', gap: 22 }}>
      {['GRÁTIS', 'PREÇO CONFERIDO', 'SAI QUANDO QUISER'].map((t) => (
        <div key={t} style={{ padding: '10px 26px', borderRadius: 40, border: `3px solid ${COR.amarelo}`, color: COR.amarelo, fontFamily: FONTE, fontWeight: 900, fontSize: 34 }}>{t}</div>
      ))}
    </div>
    <div style={{ position: 'absolute', bottom: 60, width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div style={{ padding: '22px 60px', borderRadius: 80, background: COR.amarelo, color: COR.preto, fontFamily: FONTE, fontWeight: 900, fontSize: 60 }}>LINK NA BIO</div>
    </div>
  </AbsoluteFill>
);

/** Folha da identidade (1920x1080): símbolo, nome, cores, tipografia e regras de uso. */
export const Folha: React.FC = () => {
  const cores = [['PRETO', COR.preto, COR.branco, 'Base de tudo'], ['AMARELO', COR.amarelo, COR.preto, 'Cor principal'], ['VERMELHO', COR.vermelho, COR.branco, 'Só no que mata o preço'], ['BRANCO', COR.branco, COR.preto, 'Texto sobre o preto'], ['VERDE', COR.verde, COR.preto, 'Só no botão do grupo']] as const;
  return (
    <AbsoluteFill style={{ background: '#17171B', padding: 70, fontFamily: 'Arial, sans-serif', color: '#fff' }}>
      <div style={{ display: 'flex', gap: 50, height: 430 }}>
        <div style={{ width: 430, background: COR.amarelo, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Simbolo tamanho={330} etiqueta={COR.preto} raio={COR.vermelho} corte={COR.amarelo} /></div>
        <div style={{ width: 430, background: COR.preto, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #2A2A31' }}><Simbolo tamanho={330} etiqueta={COR.amarelo} raio={COR.vermelho} corte={COR.preto} /></div>
        <div style={{ flex: 1, background: COR.preto, borderRadius: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, border: '2px solid #2A2A31' }}>
          <Simbolo tamanho={200} etiqueta={COR.amarelo} raio={COR.vermelho} corte={COR.preto} />
          <Nome tamanho={120} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 22, marginTop: 50 }}>
        {cores.map(([nome, cor, texto, uso]) => (
          <div key={nome} style={{ flex: 1, height: 190, background: cor, color: texto, borderRadius: 26, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '2px solid #2A2A31' }}>
            <div style={{ fontFamily: FONTE, fontSize: 34, fontWeight: 900 }}>{nome}</div>
            <div><div style={{ fontSize: 24, fontWeight: 700 }}>{cor}</div><div style={{ fontSize: 22, opacity: 0.85 }}>{uso}</div></div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 60, marginTop: 50 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONTE, fontStyle: 'italic', fontSize: 64, fontWeight: 900 }}>Archivo Black <span style={{ color: COR.amarelo }}>itálico</span></div>
          <div style={{ fontSize: 26, opacity: 0.8, marginTop: 8 }}>Títulos, preço e chamadas: sempre em maiúsculas e inclinado.</div>
          <div style={{ fontSize: 38, fontWeight: 700, marginTop: 22 }}>Arial para textos pequenos e avisos.</div>
        </div>
        <div style={{ flex: 1, fontSize: 28, lineHeight: 1.5 }}>
          <div style={{ fontFamily: FONTE, fontSize: 36, fontWeight: 900, color: COR.amarelo, marginBottom: 6 }}>REGRAS</div>
          <div>• O vermelho só aparece no risco do PREÇO e no raio.</div>
          <div>• Foto de perfil: o símbolo grande, sem texto.</div>
          <div>• O verde só no botão do grupo.</div>
          <div>• Nunca mais de 3 cores na mesma peça.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Mascote "Etiquetinha": a etiqueta de preço com cara decidida, que segura o raio e mata o preço. Desenhado em vetor (400x500), para usar em
 * Reels, capas e figurinhas, sempre igual. `fundo` é a cor de trás (o contorno de baixo do raio e do corpo).
 */
export const Mascote: React.FC<{ altura: number; corpo?: string; contorno?: string }> = ({ altura, corpo = COR.amarelo, contorno = COR.preto }) => (
  <svg height={altura} width={altura * 0.8} viewBox="0 0 400 500" strokeLinecap="round" strokeLinejoin="round">
    {/* pernas e tênis */}
    <path d="M150 395 L140 450 M250 395 L262 450" stroke={contorno} strokeWidth="16" fill="none" />
    <ellipse cx="132" cy="462" rx="34" ry="16" fill={COR.vermelho} stroke={contorno} strokeWidth="8" />
    <ellipse cx="274" cy="462" rx="34" ry="16" fill={COR.vermelho} stroke={contorno} strokeWidth="8" />
    {/* braço esquerdo (na cintura) */}
    <path d="M82 270 L38 300 L66 340" stroke={contorno} strokeWidth="16" fill="none" />
    {/* corpo: a etiqueta */}
    <path d="M80 130 L150 62 H300 Q322 62 322 84 V378 Q322 400 300 400 H102 Q80 400 80 378 Z" fill={corpo} stroke={contorno} strokeWidth="12" />
    <circle cx="152" cy="108" r="13" fill="#17171B" stroke={contorno} strokeWidth="6" />
    {/* rosto */}
    <ellipse cx="160" cy="240" rx="30" ry="38" fill="#fff" stroke={contorno} strokeWidth="8" />
    <ellipse cx="254" cy="240" rx="30" ry="38" fill="#fff" stroke={contorno} strokeWidth="8" />
    <circle cx="172" cy="246" r="13" fill={contorno} />
    <circle cx="266" cy="246" r="13" fill={contorno} />
    <path d="M122 192 L190 214 M290 192 L222 214" stroke={contorno} strokeWidth="14" fill="none" />
    <path d="M148 328 Q206 372 268 322" stroke={contorno} strokeWidth="12" fill="none" />
    <path d="M232 340 L244 322" stroke="#fff" strokeWidth="10" fill="none" />
    {/* braço direito levantado com o raio */}
    <path d="M322 270 L362 230 L350 170" stroke={contorno} strokeWidth="16" fill="none" />
    <circle cx="350" cy="166" r="16" fill={corpo} stroke={contorno} strokeWidth="8" />
    <path d="M356 -6 L300 104 H336 L306 200 L394 70 H356 L384 -6 Z" fill={COR.vermelho} stroke={contorno} strokeWidth="8" transform="translate(-6 18) scale(.92)" />
  </svg>
);

/** Mascote sozinho num quadrado (figurinha e imagem de apresentação). */
export const MascoteSozinho: React.FC<{ fundo: 'preto' | 'amarelo' }> = ({ fundo }) => {
  const amarelo = fundo === 'amarelo';
  return (
    <AbsoluteFill style={{ background: amarelo ? COR.amarelo : COR.preto, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 26 }}>
      <Mascote altura={760} corpo={amarelo ? COR.branco : COR.amarelo} />
      <Nome tamanho={92} cor={amarelo ? COR.preto : COR.branco} corPreco={amarelo ? COR.preto : COR.amarelo} />
    </AbsoluteFill>
  );
};
