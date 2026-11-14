import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { carregarFonte } from './fonte';
import { FONTE, Logo, MARCA } from './marca';

carregarFonte();

/**
 * Vídeo de divulgação do grupo de ofertas (Reels, Stories e anúncio na Meta). Vertical 1080x1920, 23 s, com narração.
 * O fundo é o próprio grupo rolando: cartões de ofertas de verdade (fotos reais, sem preço), borrados, que entram em foco na cena
 * "tudo chega direto no seu WhatsApp". Feito para passar nas regras de anúncio: sem preço em reais, sem "exclusivo" nem "o menor
 * preço do mercado", sem logotipo de loja nem do WhatsApp, sem falar de característica pessoal de quem assiste, e com o aviso de
 * publicidade e afiliado em todo o vídeo. As cenas acompanham as frases da narração (pausas medidas em public/voz-divulgacao.mp3).
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

/** Ofertas reais já postadas no grupo (fotos de anúncios, em public/divulgacao). Sem preço, de propósito. */
const PRODUTOS = [
  { src: 'divulgacao/p1.jpg', nome: 'Air Fryer Philco 11L' },
  { src: 'divulgacao/p2.jpg', nome: 'Mochila para notebook' },
  { src: 'divulgacao/p3.jpg', nome: 'Ventilador de parede' },
  { src: 'divulgacao/p4.jpg', nome: 'Bola de futebol Adidas' },
  { src: 'divulgacao/p5.jpg', nome: 'Calça jogger esportiva' },
  { src: 'divulgacao/p6.jpg', nome: 'Vestido midi estampado' },
  { src: 'divulgacao/p7.jpg', nome: 'Bomba de ar portátil' },
  { src: 'divulgacao/p8.jpg', nome: 'Prancha de cabelo' },
];

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
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: italico ? 'italic' : 'normal', fontSize: caber(children, tamanho, 960), lineHeight: 1.04, color: cor, whiteSpace: 'nowrap', textShadow: '0 4px 18px rgba(0,0,0,.85), 0 0 4px rgba(0,0,0,.6)', opacity: Math.min(1, s * 2), transform: `scale(${0.6 + s * 0.4})` }}>
      {children}
    </div>
  );
};

/** Escurece o fundo para o texto ler bem (e tinge com a cor da cena). */
const Veu: React.FC<{ cor?: string; forca?: number }> = ({ cor = 'rgba(14,14,16,1)', forca = 0.55 }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, ${cor.replace(',1)', `,${forca + 0.2})`)} 0%, ${cor.replace(',1)', `,${forca})`)} 50%, ${cor.replace(',1)', `,${forca + 0.25})`)} 100%)` }} />
);

const ALTURA_DO_CARTAO = 300;
const VAO = 30;

/** Uma oferta como aparece no grupo: foto real num quadro branco, nome e "Ver oferta". */
const Cartao: React.FC<{ i: number }> = ({ i }) => {
  const p = PRODUTOS[i % PRODUTOS.length]!;
  return (
    <div style={{ height: ALTURA_DO_CARTAO, width: 880, marginLeft: i % 2 ? 150 : 50, marginBottom: VAO, borderRadius: 34, background: '#202C33', padding: 20, display: 'flex', gap: 26, alignItems: 'center', boxSizing: 'border-box' }}>
      <div style={{ width: 260, height: 260, borderRadius: 24, background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
        <Img src={staticFile(p.src)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONTE, fontWeight: 900, fontSize: 40, lineHeight: 1.1, color: '#fff' }}>{p.nome}</div>
        <div style={{ marginTop: 16, height: 16, width: '88%', borderRadius: 8, background: '#33424B' }} />
        <div style={{ marginTop: 12, height: 16, width: '58%', borderRadius: 8, background: '#33424B' }} />
        <div style={{ marginTop: 22, fontFamily: FONTE, fontWeight: 900, fontSize: 32, color: '#53BDEB' }}>Ver oferta ›</div>
      </div>
    </div>
  );
};

/**
 * O fundo do vídeo inteiro: o grupo rolando. Borrado e escuro nas cenas de texto; em foco (e mais claro) na cena do WhatsApp,
 * para a pessoa ver as ofertas de verdade chegando.
 */
const GrupoRolando: React.FC = () => {
  const frame = useCurrentFrame();
  const f = FIM_DAS_CENAS;
  const foco = interpolate(frame, [f.historico - 6, f.historico + 14, f.grupo - 14, f.grupo + 6], [0, 1, 1, 0], travar);
  const desfoque = 10 * (1 - foco);
  const brilho = 0.38 + 0.52 * foco;
  const volta = PRODUTOS.length * (ALTURA_DO_CARTAO + VAO);
  const y = -((frame * 3.1) % volta);
  return (
    <AbsoluteFill style={{ background: '#0B141A', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, transform: `translateY(${y}px) scale(1.04)`, filter: `blur(${desfoque}px) brightness(${brilho})` }}>
        {[0, 1, 2, 3].flatMap((rep) => PRODUTOS.map((_, i) => <Cartao key={`${rep}-${i}`} i={i + rep * 0} />))}
      </div>
    </AbsoluteFill>
  );
};

/** Cena 1: o gancho. */
const Gancho: React.FC = () => {
  const frame = useCurrentFrame();
  const relogio = interpolate(frame, [0, 100], [0, 360], travar);
  return (
    <AbsoluteFill>
      <Veu cor="rgba(60,0,0,1)" forca={0.45} />
      <div style={{ position: 'absolute', top: 340, width: '100%', display: 'flex', justifyContent: 'center', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,.7))' }}>
        <svg width="260" height="260" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="rgba(14,14,16,.85)" stroke={MARCA.amarelo} strokeWidth="7" />
          <line x1="50" y1="50" x2="50" y2="20" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          <line x1="50" y1="50" x2="50" y2="26" stroke={MARCA.vermelho} strokeWidth="5" strokeLinecap="round" transform={`rotate(${relogio} 50 50)`} />
          <circle cx="50" cy="50" r="5" fill="#fff" />
        </svg>
      </div>
      <Texto y={730} tamanho={118} italico>PROMOÇÃO BOA</Texto>
      <Texto y={870} tamanho={118} cor={MARCA.amarelo} italico atraso={8}>ACABA RÁPIDO</Texto>
      <Texto y={1080} tamanho={52} cor="#fff" atraso={36}>e muita gente perde a hora</Texto>
    </AbsoluteFill>
  );
};

/** Cena 2: o robô garimpa as ofertas do dia (três fotos reais entram como achados). */
const Garimpo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const achados = [0, 3, 5];
  return (
    <AbsoluteFill>
      <Veu forca={0.5} />
      <div style={{ position: 'absolute', top: 280, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={110} /></div>
      <Texto y={500} tamanho={74} atraso={4}>GARIMPA AS OFERTAS</Texto>
      <Texto y={592} tamanho={74} cor={MARCA.amarelo} atraso={10}>DO DIA</Texto>
      <Texto y={710} tamanho={46} atraso={20}>nas grandes lojas</Texto>
      <div style={{ position: 'absolute', top: 860, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 28 }}>
        {achados.map((a, k) => {
          const s = spring({ frame: frame - 24 - k * 9, fps, config: { damping: 11, stiffness: 190 } });
          const p = PRODUTOS[a]!;
          return (
            <div key={a} style={{ width: 300, height: 380, borderRadius: 30, background: '#fff', padding: 14, boxSizing: 'border-box', transform: `scale(${s}) rotate(${(k - 1) * 4}deg) translateY(${k === 1 ? -26 : 0}px)`, opacity: Math.min(1, s * 2), boxShadow: '0 22px 50px rgba(0,0,0,.55)' }}>
              <Img src={staticFile(p.src)} style={{ width: '100%', height: 280, objectFit: 'contain' }} />
              <div style={{ marginTop: 8, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: 26, color: '#0E0E10', lineHeight: 1.1 }}>{p.nome}</div>
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
      <Veu cor="rgba(4,30,14,1)" forca={0.55} />
      <Texto y={330} tamanho={72}>CONFERE O</Texto>
      <Texto y={420} tamanho={84} cor={MARCA.amarelo} atraso={6}>HISTÓRICO DE PREÇO</Texto>
      <div style={{ position: 'absolute', top: 640, left: 50, width: 980, height: 420, borderRadius: 36, background: 'rgba(23,23,27,.94)', border: '3px solid #2E2E36', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <svg width="980" height="420" viewBox="0 0 900 260" style={{ position: 'absolute', inset: 0 }}>
          <g transform="translate(0 30)">
            {[0, 1, 2].map((i) => <line key={i} x1="40" x2="880" y1={40 + i * 70} y2={40 + i * 70} stroke="#2E2E36" strokeWidth="2" strokeDasharray="8 8" />)}
            <path d={caminho} fill="none" stroke={MARCA.amarelo} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - traco} />
            <circle cx={840} cy={190} r={22 * bola} fill={MARCA.verde} stroke="#fff" strokeWidth="5" />
          </g>
        </svg>
      </div>
      <Texto y={1130} tamanho={58} atraso={50}>ANTES DE POSTAR</Texto>
      <Texto y={1230} tamanho={38} cor="rgba(255,255,255,.75)" atraso={60}>gráfico ilustrativo</Texto>
    </AbsoluteFill>
  );
};

/** Cena 4: o grupo em foco, com as ofertas chegando (o fundo já mostra o grupo; aqui só a chamada no alto). */
const Grupo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sino = spring({ frame: frame - 14, fps, config: { damping: 7, stiffness: 260 } });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(11,20,26,.96) 0%, rgba(11,20,26,.88) 22%, rgba(11,20,26,0) 36%, rgba(11,20,26,0) 80%, rgba(11,20,26,.9) 100%)' }} />
      <Texto y={250} tamanho={64}>TUDO CHEGA DIRETO</Texto>
      <Texto y={330} tamanho={64} cor={VERDE} atraso={6}>NO SEU WHATSAPP</Texto>
      <div style={{ position: 'absolute', right: 120, top: 470, width: 84, height: 84, borderRadius: 42, background: MARCA.vermelho, color: '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${sino})`, boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>+8</div>
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
      <Veu forca={0.5} />
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

const TEXTOS_DA_CHAMADA: Record<ChamadaDaDivulgacao, { botao: string; seta: string; rodape: string }> = {
  botao: { botao: 'ENTRAR NO GRUPO', seta: '👆', rodape: 'toque no botão · é grátis' },
  descricao: { botao: 'LINK NA DESCRIÇÃO', seta: '👇', rodape: 'toque no link da descrição · é grátis' },
  bio: { botao: 'LINK NA BIO', seta: '👆', rodape: 'toque no link do perfil · é grátis' },
};

/** Cena 6: a chamada. Botão grande, que pulsa, e a seta apontando para ele. */
const Chamada: React.FC<{ tipo: ChamadaDaDivulgacao }> = ({ tipo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = TEXTOS_DA_CHAMADA[tipo];
  const entra = spring({ frame: frame - 4, fps, config: { damping: 9, stiffness: 200 } });
  const pulsa = 1 + Math.sin(frame / 5) * 0.035;
  const seta = Math.sin(frame / 4) * 18;
  return (
    <AbsoluteFill>
      <Veu cor="rgba(4,30,14,1)" forca={0.55} />
      <div style={{ position: 'absolute', top: 330, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={120} /></div>
      <Texto y={560} tamanho={92} italico>ENTRA NO GRUPO</Texto>
      <Texto y={680} tamanho={64} cor={MARCA.amarelo} atraso={8}>E RECEBA AS OFERTAS DO DIA</Texto>
      <div style={{ position: 'absolute', top: 900, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${entra * pulsa})` }}>
        <div style={{ padding: '36px 64px', borderRadius: 100, background: VERDE, color: '#06210F', fontFamily: FONTE, fontWeight: 900, fontSize: caber(t.botao, 80, 780), boxShadow: `0 0 0 14px rgba(37,211,102,.28), 0 24px 60px rgba(0,0,0,.55)`, whiteSpace: 'nowrap' }}>{t.botao}</div>
      </div>
      <div style={{ position: 'absolute', top: 1130 + seta, width: '100%', textAlign: 'center', fontSize: 130, color: '#fff', textShadow: sombra }}>{t.seta}</div>
      <Texto y={1330} tamanho={46} cor="#fff" atraso={20}>{t.rodape}</Texto>
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
      <GrupoRolando />
      {cenas.map((c, i) => (
        <Sequence key={i} from={c.de} durationInFrames={c.ate - c.de}>
          {c.no}
        </Sequence>
      ))}
      {/* Aviso de publicidade em todo o vídeo, dentro da área segura. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1650, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '10px 26px', borderRadius: 30, background: 'rgba(0,0,0,.62)', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 27, color: 'rgba(255,255,255,.92)', whiteSpace: 'nowrap' }}>
          Publi · links de afiliado · exemplos de ofertas · preços podem mudar
        </div>
      </div>
      <Audio src={staticFile(voz)} />
      {musica ? <Audio src={staticFile(musica)} volume={volumeDaMusica} /> : null}
    </AbsoluteFill>
  );
};
