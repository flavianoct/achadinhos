import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Carrossel "N achados de [nicho]" (1080x1350, feed): cada quadro desta composição é uma imagem do carrossel.
 *  - capa: o título com o nicho, o fato real dos produtos ("+12 MIL VENDIDOS") e as fotos em leque, numeradas, com "ARRASTA";
 *  - um produto por imagem: a foto desfocada de fundo, o cartão do produto, o número, o selo, o nome curto e as provas;
 *  - fim: "QUAL VOCÊ LEVARIA?", as miniaturas numeradas e o pedido de comentário e de salvar.
 * Nunca mostra preço em reais. O robô grava os quadros como PNG (render --sequence).
 */

export type SeloDoCarrossel = { texto: string; tipo: 'desconto' | 'historico' | 'febre' };
export type ItemDoCarrossel = { nome: string[]; imagem: string; selo?: SeloDoCarrossel; provas: string[]; cor: string };
export type PropsDoCarrossel = {
  /** Título da capa em duas linhas ("5 ACHADOS DE PET", "PRA SALVAR AGORA"). */
  titulo: [string, string];
  /** Fato real da capa ("+12 MIL VENDIDOS"); vazio, não aparece. */
  fato: string;
  itens: ItemDoCarrossel[];
  comentaQuero: boolean;
};

export const imagensDoCarrossel = (n: number) => n + 2;

const caber = (s: string, base: number, largura = 940) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.74)));
const sombra = '0 6px 22px rgba(0,0,0,.55)';

const Fundo: React.FC<{ imagem: string; cor: string }> = ({ imagem, cor }) => (
  <AbsoluteFill style={{ background: MARCA.fundo, overflow: 'hidden' }}>
    <Img src={imagem} style={{ position: 'absolute', inset: -200, width: 'calc(100% + 400px)', height: 'calc(100% + 400px)', objectFit: 'cover', filter: 'blur(60px) saturate(1.6) brightness(0.5)', transform: 'scale(1.2)' }} />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, ${cor}55 0%, transparent 60%), linear-gradient(180deg, rgba(14,14,16,.3) 0%, rgba(14,14,16,.15) 40%, rgba(14,14,16,.92) 76%, ${MARCA.fundo} 100%)` }} />
  </AbsoluteFill>
);

const Linha: React.FC<{ y: number; tamanho: number; cor: string; italico?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ y, tamanho, cor, italico, children, style }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: italico ? 'italic' : 'normal', fontSize: tamanho, lineHeight: 1.05, color: cor, whiteSpace: 'nowrap', textShadow: sombra, ...style }}>
    {children}
  </div>
);

const Cartao: React.FC<{ imagem: string; largura: number; altura: number; inclina?: number; raio?: number }> = ({ imagem, largura, altura, inclina = 0, raio = 40 }) => (
  <div style={{ width: largura, height: altura, borderRadius: raio, background: '#fff', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,.55), 0 0 0 5px rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${inclina}deg)` }}>
    <Img src={imagem} style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
  </div>
);

const Bolinha: React.FC<{ n: number; tamanho: number }> = ({ n, tamanho }) => (
  <div style={{ width: tamanho, height: tamanho, borderRadius: '50%', background: MARCA.amarelo, color: MARCA.fundo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: tamanho * 0.6, boxShadow: '0 6px 0 #B38F00, 0 10px 24px rgba(0,0,0,.4)' }}>{n}</div>
);

/** Seta desenhada (sem depender de emoji). */
const Seta: React.FC<{ tamanho: number; cor: string }> = ({ tamanho, cor }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden><path d="M4 12h13M12 5l7 7-7 7" stroke={cor} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Marcador de "salvar" desenhado. */
const Salvar: React.FC<{ tamanho: number }> = ({ tamanho }) => (
  <svg width={tamanho * 0.75} height={tamanho} viewBox="0 0 18 24" aria-hidden><path d="M2 2h14v20l-7-5-7 5z" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" /></svg>
);

const Capa: React.FC<{ p: PropsDoCarrossel }> = ({ p }) => {
  const n = p.itens.length;
  // Fotos em leque: até 5, a do meio na frente.
  const posicoes = [
    { x: 40, y: 600, r: -12, w: 300 },
    { x: 740, y: 600, r: 12, w: 300 },
    { x: 200, y: 560, r: -5, w: 330 },
    { x: 550, y: 560, r: 5, w: 330 },
    { x: 360, y: 520, r: 0, w: 360 },
  ];
  const ordem = [3, 4, 1, 2, 0].filter((i) => i < n);
  return (
    <AbsoluteFill>
      <Fundo imagem={p.itens[0]!.imagem} cor={p.itens[0]!.cor} />
      <div style={{ position: 'absolute', top: 70, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={56} /></div>
      <Linha y={170} tamanho={caber(p.titulo[0], 112)} cor="#fff">{p.titulo[0]}</Linha>
      <Linha y={300} tamanho={caber(p.titulo[1], 96)} cor={MARCA.amarelo} italico>{p.titulo[1]}</Linha>
      {p.fato ? (
        <div style={{ position: 'absolute', top: 430, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '12px 34px', borderRadius: 40, background: MARCA.vermelho, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: 42, border: '4px solid #fff', boxShadow: '0 10px 26px rgba(0,0,0,.45)', transform: 'rotate(-3deg)' }}>{p.fato}</div>
        </div>
      ) : null}
      {ordem.map((i, k) => {
        const pos = posicoes[(n >= 5 ? k : k + (5 - n))] ?? posicoes[4]!;
        return (
          <div key={i} style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: k }}>
            <Cartao imagem={p.itens[i]!.imagem} largura={pos.w} altura={pos.w * 1.15} inclina={pos.r} raio={30} />
            <div style={{ position: 'absolute', left: -14, top: -26 }}><Bolinha n={i + 1} tamanho={78} /></div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', bottom: 70, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 44px', borderRadius: 60, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 44, boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
          ARRASTA PRO LADO <Seta tamanho={48} cor={MARCA.fundo} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SeloFixo: React.FC<{ selo: SeloDoCarrossel }> = ({ selo }) => {
  if (selo.tipo === 'desconto') {
    return (
      <div style={{ position: 'absolute', right: 50, top: 190, width: 230, height: 230, borderRadius: '50%', background: MARCA.vermelho, border: '7px solid #fff', boxShadow: '0 16px 40px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONTE, fontWeight: 900, transform: 'rotate(-9deg)' }}>
        <div style={{ color: '#fff', fontSize: 72, lineHeight: 1 }}>{selo.texto}</div>
        <div style={{ color: MARCA.amarelo, fontSize: 34, letterSpacing: 5 }}>OFF</div>
      </div>
    );
  }
  const amarelo = selo.tipo === 'historico';
  return <div style={{ position: 'absolute', right: 60, top: 200, padding: '16px 34px', borderRadius: 18, background: amarelo ? MARCA.amarelo : MARCA.vermelho, color: amarelo ? MARCA.fundo : '#fff', border: '5px solid #fff', fontFamily: FONTE, fontWeight: 900, fontSize: 42, transform: 'rotate(-7deg)', boxShadow: '0 16px 40px rgba(0,0,0,.5)' }}>{selo.texto}</div>;
};

const Produto: React.FC<{ item: ItemDoCarrossel; i: number; total: number }> = ({ item, i, total }) => (
  <AbsoluteFill>
    <Fundo imagem={item.imagem} cor={item.cor} />
    {/* Número gigante vazado atrás do produto. */}
    <div style={{ position: 'absolute', left: -30, top: 500, fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: 560, lineHeight: 1, color: 'transparent', WebkitTextStroke: `8px ${MARCA.amarelo}`, opacity: 0.55 }}>{i + 1}</div>
    <div style={{ position: 'absolute', top: 64, left: 60, right: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Logo altura={46} />
      <div style={{ padding: '8px 22px', borderRadius: 30, background: 'rgba(14,14,16,.7)', border: `3px solid ${MARCA.amarelo}`, color: MARCA.amarelo, fontFamily: FONTE, fontWeight: 900, fontSize: 34 }}>{i + 1}/{total}</div>
    </div>
    <div style={{ position: 'absolute', left: 140, top: 200 }}>
      <Cartao imagem={item.imagem} largura={800} altura={700} inclina={i % 2 ? 1.5 : -1.5} />
    </div>
    <div style={{ position: 'absolute', left: 80, top: 160, padding: '8px 28px', borderRadius: 20, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 60, transform: 'rotate(-6deg)', boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>Nº {i + 1}</div>
    {item.selo ? <SeloFixo selo={item.selo} /> : null}
    {item.nome.map((linha, k) => (
      <Linha key={k} y={950 + k * 74} tamanho={caber(linha, 62)} cor="#fff">{linha}</Linha>
    ))}
    <div style={{ position: 'absolute', top: 970 + item.nome.length * 74, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '0 60px' }}>
      {item.provas.map((prova, k) => (
        <div key={k} style={{ padding: '10px 24px', borderRadius: 36, background: k === 0 ? MARCA.amarelo : 'rgba(255,255,255,.14)', border: k === 0 ? 'none' : '2px solid rgba(255,255,255,.35)', color: k === 0 ? MARCA.fundo : '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: 34 }}>{prova}</div>
      ))}
    </div>
    <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 24 }}>{MARCA.aviso}</div>
    {i < total - 1 ? <div style={{ position: 'absolute', right: 26, top: 520, opacity: 0.9 }}><Seta tamanho={70} cor={MARCA.amarelo} /></div> : null}
  </AbsoluteFill>
);

const Fim: React.FC<{ p: PropsDoCarrossel }> = ({ p }) => {
  const n = p.itens.length;
  const numeros = Array.from({ length: n }, (_, i) => i + 1).join(', ').replace(/, (\d+)$/, ' OU $1');
  const largura = Math.floor((960 - 16 * (n - 1)) / n);
  const apoio = p.comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'OS LINKS ESTÃO NA BIO';
  return (
    <AbsoluteFill>
      <Fundo imagem={p.itens[0]!.imagem} cor={MARCA.vermelho} />
      <div style={{ position: 'absolute', top: 70, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={56} /></div>
      <Linha y={190} tamanho={caber('QUAL VOCÊ LEVARIA?', 100)} cor={MARCA.amarelo} italico>QUAL VOCÊ LEVARIA?</Linha>
      <div style={{ position: 'absolute', top: 360, left: 60, display: 'flex', gap: 16 }}>
        {p.itens.map((it, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <Cartao imagem={it.imagem} largura={largura} altura={largura * 1.6} raio={24} />
            <div style={{ position: 'absolute', left: -10, top: -24 }}><Bolinha n={i + 1} tamanho={Math.min(76, largura * 0.45)} /></div>
          </div>
        ))}
      </div>
      <Linha y={800} tamanho={caber(`COMENTA ${numeros}`, 92)} cor={MARCA.amarelo} italico>{`COMENTA ${numeros}`}</Linha>
      <Linha y={905} tamanho={caber(apoio, 44)} cor="#fff">{apoio}</Linha>
      <div style={{ position: 'absolute', top: 1040, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 40px', borderRadius: 60, background: 'rgba(14,14,16,.75)', border: '3px solid #fff', color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: 42 }}>
          <Salvar tamanho={50} /> SALVA PRA NÃO PERDER
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 24 }}>{MARCA.aviso}</div>
    </AbsoluteFill>
  );
};

export const Carrossel: React.FC<PropsDoCarrossel> = (p) => {
  const frame = useCurrentFrame();
  if (frame === 0) return <Capa p={p} />;
  if (frame <= p.itens.length) return <Produto item={p.itens[frame - 1]!} i={frame - 1} total={p.itens.length} />;
  return <Fim p={p} />;
};
