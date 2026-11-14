import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Vídeo de divulgação do grupo de ofertas (Reels, Stories e anúncio na Meta). Vertical 1080x1920, uns 23 s, com narração.
 * Feito para passar nas regras de anúncio: sem preço em reais, sem "exclusivo" nem "o menor preço do mercado", sem logotipo de loja
 * nem do WhatsApp, sem falar de característica pessoal de quem assiste, e com o aviso de publicidade e afiliado em todo o vídeo.
 * As cenas acompanham as frases da narração (pausas medidas em public/voz-divulgacao.mp3).
 */

export const DIVULGACAO_FPS = 30;
/** Quadro em que cada cena termina (acompanha a voz). */
export const FIM_DAS_CENAS = { gancho: 114, garimpo: 228, historico: 330, grupo: 486, vantagens: 564, chamada: 690 };
export const DURACAO_DA_DIVULGACAO = FIM_DAS_CENAS.chamada;

/** Como a pessoa entra: pelo botão do anúncio, pelo link na descrição (Facebook, YouTube) ou pelo link na bio (Instagram). */
export type ChamadaDaDivulgacao = 'botao' | 'descricao' | 'bio';

export type PropsDaDivulgacao = {
  chamada: ChamadaDaDivulgacao;
  /** Narração (em public/). */
  voz: string;
  /** Música baixinha por baixo da voz (em public/); vazio, sem música. */
  musica?: string;
};

const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sombra = '0 6px 22px rgba(0,0,0,.6)';
const VERDE = '#25D366';

/** O maior tamanho (até `base`) em que o texto cabe na largura, para nada ser cortado na borda da tela. */
const caber = (conteudo: React.ReactNode, base: number, largura: number) => (typeof conteudo === 'string' ? Math.min(base, Math.floor(largura / (Math.max(1, conteudo.length) * 0.78))) : base);

const Texto: React.FC<{ y: number; tamanho: number; cor?: string; italico?: boolean; atraso?: number; children: React.ReactNode }> = ({ y, tamanho, cor = '#fff', italico, atraso = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - atraso, fps, config: { damping: 10, stiffness: 220 } });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: italico ? 'italic' : 'normal', fontSize: caber(children, tamanho, 960), lineHeight: 1.04, color: cor, whiteSpace: 'nowrap', textShadow: sombra, opacity: Math.min(1, s * 2), transform: `scale(${0.6 + s * 0.4})` }}>
      {children}
    </div>
  );
};

const Fundo: React.FC<{ brilho?: string }> = ({ brilho = 'rgba(225,6,0,.34)' }) => {
  const frame = useCurrentFrame();
  const mexe = Math.sin(frame / 40) * 60;
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${50 + mexe / 12}% 8%, ${brilho} 0%, rgba(14,14,16,0) 62%)` }} />
    </AbsoluteFill>
  );
};

/** Cena 1: o gancho. */
const Gancho: React.FC = () => {
  const frame = useCurrentFrame();
  const relogio = interpolate(frame, [0, 100], [0, 360], travar);
  return (
    <AbsoluteFill>
      <Fundo />
      <div style={{ position: 'absolute', top: 360, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <svg width="260" height="260" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke={MARCA.amarelo} strokeWidth="7" />
          <line x1="50" y1="50" x2="50" y2="20" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          <line x1="50" y1="50" x2="50" y2="26" stroke={MARCA.vermelho} strokeWidth="5" strokeLinecap="round" transform={`rotate(${relogio} 50 50)`} />
          <circle cx="50" cy="50" r="5" fill="#fff" />
        </svg>
      </div>
      <Texto y={730} tamanho={118} italico>PROMOÇÃO BOA</Texto>
      <Texto y={870} tamanho={118} cor={MARCA.amarelo} italico atraso={8}>ACABA RÁPIDO</Texto>
      <Texto y={1080} tamanho={52} cor={MARCA.suave} atraso={36}>e muita gente perde a hora</Texto>
    </AbsoluteFill>
  );
};

/** Cena 2: o robô garimpa as ofertas do dia nas grandes lojas (cartões genéricos, sem logotipo de loja). */
const Garimpo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rotulos = ['TECNOLOGIA', 'CASA', 'MODA', 'GAMES'];
  return (
    <AbsoluteFill>
      <Fundo brilho="rgba(255,214,10,.22)" />
      <div style={{ position: 'absolute', top: 300, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={110} /></div>
      <Texto y={520} tamanho={74} atraso={4}>GARIMPA AS OFERTAS</Texto>
      <Texto y={612} tamanho={74} cor={MARCA.amarelo} atraso={10}>DO DIA</Texto>
      <Texto y={730} tamanho={46} cor={MARCA.suave} atraso={20}>nas grandes lojas</Texto>
      <div style={{ position: 'absolute', top: 880, left: 70, right: 70, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
        {rotulos.map((r, i) => {
          const s = spring({ frame: frame - 24 - i * 8, fps, config: { damping: 11, stiffness: 190 } });
          return (
            <div key={r} style={{ height: 250, borderRadius: 32, background: '#1B1B20', border: `3px solid ${i % 2 ? MARCA.amarelo : MARCA.vermelho}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, transform: `scale(${s})`, opacity: Math.min(1, s * 2) }}>
              <div style={{ width: 120, height: 82, borderRadius: 18, background: `linear-gradient(135deg, #2A2A32, #3A3A44)` }} />
              <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: 40, color: '#fff' }}>{r}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Cena 3: o histórico de preço (gráfico ilustrativo, sem valores). */
const Historico: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pontos: Array<[number, number]> = [[60, 150], [200, 120], [330, 170], [450, 100], [580, 140], [700, 60], [840, 190]];
  const caminho = pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const traco = interpolate(frame, [14, 70], [0, 1], travar);
  const bola = spring({ frame: frame - 70, fps, config: { damping: 8, stiffness: 260 } });
  return (
    <AbsoluteFill>
      <Fundo brilho="rgba(22,163,74,.28)" />
      <Texto y={330} tamanho={72}>CONFERE O</Texto>
      <Texto y={420} tamanho={84} cor={MARCA.amarelo} atraso={6}>HISTÓRICO DE PREÇO</Texto>
      <div style={{ position: 'absolute', top: 640, left: 50, width: 980, height: 420, borderRadius: 36, background: '#17171B', border: '3px solid #2E2E36' }}>
        <svg width="980" height="420" viewBox="0 0 900 260" style={{ position: 'absolute', inset: 0 }}>
          <g transform="translate(0 30)">
            {[0, 1, 2].map((i) => <line key={i} x1="40" x2="880" y1={40 + i * 70} y2={40 + i * 70} stroke="#2E2E36" strokeWidth="2" strokeDasharray="8 8" />)}
            <path d={caminho} fill="none" stroke={MARCA.amarelo} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - traco} />
            <circle cx={840} cy={190} r={22 * bola} fill={MARCA.verde} stroke="#fff" strokeWidth="5" />
          </g>
        </svg>
      </div>
      <Texto y={1130} tamanho={58} cor="#fff" atraso={50}>ANTES DE POSTAR</Texto>
      <Texto y={1230} tamanho={38} cor={MARCA.suave} atraso={60}>gráfico ilustrativo</Texto>
    </AbsoluteFill>
  );
};

/** Cena 4: as ofertas chegando no celular, como mensagens de um grupo (sem logotipo e sem preço). */
const Grupo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mensagens = [
    { cat: 'TECNOLOGIA', cor: MARCA.vermelho },
    { cat: 'CASA', cor: '#0ea5e9' },
    { cat: 'MODA', cor: '#d946ef' },
    { cat: 'GAMES', cor: MARCA.verde },
  ];
  return (
    <AbsoluteFill>
      <Fundo brilho="rgba(37,211,102,.26)" />
      <Texto y={270} tamanho={64}>TUDO CHEGA DIRETO</Texto>
      <Texto y={350} tamanho={64} cor={VERDE} atraso={6}>NO SEU WHATSAPP</Texto>
      <div style={{ position: 'absolute', top: 470, left: 150, width: 780, height: 1060, borderRadius: 70, background: '#0B141A', border: '10px solid #2A2A32', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }}>
        <div style={{ height: 120, background: '#202C33', display: 'flex', alignItems: 'center', gap: 22, padding: '0 34px' }}>
          <div style={{ width: 66, height: 66, borderRadius: 33, background: MARCA.fundo, border: `3px solid ${MARCA.amarelo}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="40" viewBox="0 0 48 64"><polygon points="28,0 6,36 22,36 16,64 42,24 26,24" fill={MARCA.vermelho} stroke={MARCA.amarelo} strokeWidth="3" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ fontFamily: FONTE, fontSize: 36, color: '#E9EDEF', fontWeight: 900 }}>Mata Preço · Ofertas</div>
        </div>
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mensagens.map((m, i) => {
            const s = spring({ frame: frame - 18 - i * 22, fps, config: { damping: 12, stiffness: 180 } });
            return (
              <div key={m.cat} style={{ alignSelf: 'flex-start', width: 600, borderRadius: 24, background: '#202C33', padding: 14, transform: `translateY(${(1 - s) * 60}px) scale(${0.85 + s * 0.15})`, opacity: Math.min(1, s * 2), transformOrigin: 'left top' }}>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                  <div style={{ width: 96, height: 96, borderRadius: 18, background: `linear-gradient(135deg, ${m.cor}, #1B1B20)` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: FONTE, fontSize: 34, color: '#fff', fontWeight: 900 }}>{m.cat}</div>
                    <div style={{ marginTop: 12, height: 14, width: '90%', borderRadius: 7, background: '#33424B' }} />
                    <div style={{ marginTop: 10, height: 14, width: '60%', borderRadius: 7, background: '#33424B' }} />
                  </div>
                </div>
                <div style={{ marginTop: 10, textAlign: 'center', fontFamily: FONTE, fontSize: 26, color: '#53BDEB', borderTop: '2px solid #2E3B44', paddingTop: 8, fontWeight: 900 }}>Ver oferta</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Cena 5: as vantagens (grátis e sai quando quiser). */
const Vantagens: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const itens = [
    { t: 'É GRÁTIS', c: MARCA.amarelo, f: '#0E0E10' },
    { t: 'SAI QUANDO QUISER', c: '#fff', f: '#0E0E10' },
  ];
  return (
    <AbsoluteFill>
      <Fundo />
      {itens.map((it, i) => {
        const s = spring({ frame: frame - 4 - i * 20, fps, config: { damping: 9, stiffness: 240 } });
        return (
          <div key={it.t} style={{ position: 'absolute', top: 560 + i * 280, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${s}) rotate(${i ? 2 : -2}deg)` }}>
            <div style={{ padding: '30px 70px', borderRadius: 40, background: it.c, color: it.f, fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: caber(it.t, 92, 780), boxShadow: '0 20px 50px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }}>{it.t}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Cena 6: a chamada. Botão grande, que pulsa, e a seta apontando para ele. */
const TEXTOS_DA_CHAMADA: Record<ChamadaDaDivulgacao, { botao: string; seta: string; rodape: string }> = {
  botao: { botao: 'ENTRAR NO GRUPO', seta: '👆', rodape: 'toque no botão · é grátis' },
  descricao: { botao: 'LINK NA DESCRIÇÃO', seta: '👇', rodape: 'toque no link da descrição · é grátis' },
  bio: { botao: 'LINK NA BIO', seta: '👆', rodape: 'toque no link do perfil · é grátis' },
};

const Chamada: React.FC<{ tipo: ChamadaDaDivulgacao }> = ({ tipo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = TEXTOS_DA_CHAMADA[tipo];
  const entra = spring({ frame: frame - 4, fps, config: { damping: 9, stiffness: 200 } });
  const pulsa = 1 + Math.sin(frame / 5) * 0.035;
  const seta = Math.sin(frame / 4) * 18;
  return (
    <AbsoluteFill>
      <Fundo brilho="rgba(37,211,102,.3)" />
      <div style={{ position: 'absolute', top: 330, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={120} /></div>
      <Texto y={560} tamanho={92} italico>ENTRA NO GRUPO</Texto>
      <Texto y={680} tamanho={64} cor={MARCA.amarelo} atraso={8}>E RECEBA AS OFERTAS DO DIA</Texto>
      <div style={{ position: 'absolute', top: 900, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '36px 64px', borderRadius: 100, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: caber(t.botao, 80, 780), boxShadow: `0 0 0 14px rgba(37,211,102,.28), 0 24px 60px rgba(0,0,0,.55)`, whiteSpace: 'nowrap' }}>{t.botao}</div>
      </div>
      <div style={{ position: 'absolute', top: 1130 + seta, width: '100%', textAlign: 'center', fontSize: 130, color: '#fff', textShadow: sombra }}>{t.seta}</div>
      <Texto y={1330} tamanho={46} cor={MARCA.suave} atraso={20}>{t.rodape}</Texto>
    </AbsoluteFill>
  );
};

export const Divulgacao: React.FC<PropsDaDivulgacao> = ({ chamada, voz, musica }) => {
  const frame = useCurrentFrame();
  const f = FIM_DAS_CENAS;
  const cenas: Array<{ de: number; ate: number; no: React.ReactNode }> = [
    { de: 0, ate: f.gancho, no: <Gancho /> },
    { de: f.gancho, ate: f.garimpo, no: <Garimpo /> },
    { de: f.garimpo, ate: f.historico, no: <Historico /> },
    { de: f.historico, ate: f.grupo, no: <Grupo /> },
    { de: f.grupo, ate: f.vantagens, no: <Vantagens /> },
    { de: f.vantagens, ate: f.chamada, no: <Chamada tipo={chamada} /> },
  ];
  const volumeDaMusica = interpolate(frame, [0, 20, DURACAO_DA_DIVULGACAO - 30, DURACAO_DA_DIVULGACAO], [0, 0.11, 0.11, 0], travar);
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      {cenas.map((c, i) => (
        <Sequence key={i} from={c.de} durationInFrames={c.ate - c.de}>
          {c.no}
        </Sequence>
      ))}
      {/* Aviso de publicidade em todo o vídeo, dentro da área segura. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1660, textAlign: 'center', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 30, color: 'rgba(255,255,255,.78)', textShadow: '0 2px 8px rgba(0,0,0,.8)' }}>
        Publi · links de afiliado · preços e disponibilidade podem mudar
      </div>
      <Audio src={staticFile(voz)} />
      {musica ? <Audio src={staticFile(musica)} volume={volumeDaMusica} /> : null}
    </AbsoluteFill>
  );
};
