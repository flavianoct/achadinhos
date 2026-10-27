import React from 'react';
import { AbsoluteFill } from 'remotion';

/** Cores e textos fixos do Mata Preço (os mesmos das artes do Instagram, em src/moldes.ts do robô). */
export const MARCA = {
  fundo: '#0E0E10',
  amarelo: '#FFD60A',
  vermelho: '#E10600',
  branco: '#FFFFFF',
  suave: '#A9A9B3',
  faixa: 'O PREÇO ESTÁ NO GRUPO',
  faixaCurta: 'ENTRE PELO LINK NA BIO',
  aviso: 'Publi · link de afiliado · preço pode mudar',
};

export const FONTE = '"Archivo Black", "Arial Black", "Segoe UI Black", Impact, Arial, sans-serif';

/** Logo escrito em texto + raio (sem depender de arquivo de imagem). */
export const Logo: React.FC<{ altura?: number }> = ({ altura = 64 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: altura * 0.2, fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: altura * 0.8, lineHeight: 1, filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.55))' }}>
    <svg width={altura * 0.75} height={altura} viewBox="0 0 48 64" aria-hidden>
      <polygon points="28,0 6,36 22,36 16,64 42,24 26,24" fill={MARCA.vermelho} stroke={MARCA.amarelo} strokeWidth="3" strokeLinejoin="round" />
    </svg>
    <span style={{ color: MARCA.branco }}>MATA</span>
    <span style={{ color: MARCA.amarelo }}>PREÇO</span>
  </div>
);

/** Faixa amarela do fim do vídeo: o preço nunca aparece, quem quer entra pelo link da bio. */
export const FaixaDoGrupo: React.FC<{ largura?: number }> = ({ largura = 900 }) => (
  <div style={{ width: largura, background: MARCA.amarelo, borderRadius: 40, padding: '34px 20px 30px', textAlign: 'center', fontFamily: FONTE, fontStyle: 'italic', boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
    <div style={{ color: MARCA.fundo, fontSize: 54, fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{MARCA.faixa}</div>
    <div style={{ color: MARCA.vermelho, fontSize: 42, fontWeight: 900, marginTop: 12 }}>{MARCA.faixaCurta}</div>
  </div>
);

export const Aviso: React.FC<{ bottom: number }> = ({ bottom }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 30 }}>{MARCA.aviso}</div>
);

/** Fundo escuro com brilho vermelho no canto, como nas artes do robô. */
export const FundoDaMarca: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 85% 0%, rgba(225,6,0,.55) 0%, rgba(225,6,0,0) 55%), ${MARCA.fundo}` }} />
);
