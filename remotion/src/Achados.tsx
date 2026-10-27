import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTE, Logo, MARCA } from './marca';
import { carregarFonte } from './fonte';

carregarFonte();

/**
 * Reel "Top 3 de hoje", em contagem regressiva (3 → 2 → 1, o melhor por último):
 *  - gancho: o nº 1 em tela cheia com o fato mais forte dele, de verdade e específico ("−41% OFF", "2,5 MIL VENDIDOS"), e a promessa
 *    "ESPERA O Nº 1": quem quer ver o nº 1 fica até o fim;
 *  - cada produto: a própria foto desfocada de fundo, o número gigante vazado atrás, o produto flutuando, o selo carimbando (com tremor)
 *    e a prova em chips que pipocam; troca de cena com zoom, desfoque e flash no corte;
 *  - fim: os três em leque e "COMENTA 1, 2 OU 3" (o número comentado vira o link no direct).
 * Nunca mostra preço em reais: só o que é verdade por mais tempo (desconto confirmado, menor preço, em alta, vendidos, nota).
 * Os itens chegam em ordem de ranking (o primeiro é o nº 1); a contagem os mostra do último para o primeiro.
 */

export const ACHADOS_FPS = 30;
export const QUADROS = { gancho: 42, item: 72, fim: 78 };

export type Selo = { texto: string; tipo: 'desconto' | 'historico' | 'febre' };
export type ItemDosAchados = {
  nome: string[];
  imagem: string;
  selo?: Selo;
  /** Provas reais, uma por chip ("Nota 4,8", "2,5 mil vendidos", "Frete grátis"). */
  provas: string[];
  cor: string;
};
export type PropsDosAchados = {
  itens: ItemDosAchados[];
  /** O fato mais forte do nº 1, para o gancho ("−41% OFF", "2,5 MIL VENDIDOS"). */
  fato: string;
  /** A promessa do topo, que segura até o fim ("ESPERA O Nº 1" ou "O Nº 1 É O MAIS VENDIDO"). */
  promessa: string;
  comentaQuero: boolean;
  audio?: string;
};

export const duracaoDosAchados = (n: number) => QUADROS.gancho + n * QUADROS.item + QUADROS.fim;

const caber = (s: string, base: number, largura = 940) => Math.min(base, Math.floor(largura / (Math.max(1, s.length) * 0.74)));
const travar = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sombra = '0 6px 22px rgba(0,0,0,.55)';

/** A foto do produto, grande e desfocada, como fundo da cena (dá a cor e o clima do produto), escurecida embaixo para o texto ler bem. */
const FundoDoProduto: React.FC<{ imagem: string; cor: string; zoom?: number }> = ({ imagem, cor, zoom = 1 }) => (
  <AbsoluteFill style={{ background: MARCA.fundo, overflow: 'hidden' }}>
    <Img src={imagem} style={{ position: 'absolute', inset: -200, width: 'calc(100% + 400px)', height: 'calc(100% + 400px)', objectFit: 'cover', filter: 'blur(60px) saturate(1.6) brightness(0.55)', transform: `scale(${1.2 * zoom})` }} />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, ${cor}55 0%, transparent 60%), linear-gradient(180deg, rgba(14,14,16,.35) 0%, rgba(14,14,16,.15) 35%, rgba(14,14,16,.92) 72%, ${MARCA.fundo} 100%)` }} />
  </AbsoluteFill>
);

/** Entrada e saída de cena: entra de um zoom com desfoque, sai crescendo e desfocando (o "whip" dos editores). */
function useTransicao(duracao: number) {
  const frame = useCurrentFrame();
  const entra = interpolate(frame, [0, 7], [0, 1], travar);
  const sai = interpolate(frame, [duracao - 5, duracao], [0, 1], travar);
  return {
    transform: `scale(${1.25 - entra * 0.25 + sai * 0.3})`,
    filter: `blur(${(1 - entra) * 18 + sai * 22}px)`,
    opacity: 1 - sai * 0.4,
  };
}

/** Flash branco curtinho no corte, no tempo da batida. */
const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#fff', opacity: interpolate(frame, [0, 4], [0.55, 0], travar), pointerEvents: 'none' }} />;
};

/** Tremor de câmera depois de um impacto (o carimbo do selo), que some rápido. */
const tremor = (frame: number, inicio: number) => {
  const t = frame - inicio;
  if (t < 0 || t > 8) return '';
  const forca = (8 - t) * 1.6;
  return `translate(${Math.sin(t * 5.1) * forca}px, ${Math.cos(t * 4.3) * forca}px)`;
};

const Linha: React.FC<{ y: number; tamanho: number; cor: string; italico?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ y, tamanho, cor, italico, children, style }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONTE, fontWeight: 900, fontStyle: italico ? 'italic' : 'normal', fontSize: tamanho, lineHeight: 1.05, color: cor, whiteSpace: 'nowrap', textShadow: sombra, ...style }}>
    {children}
  </div>
);

/** Texto que entra palavra por palavra, cada uma pulando (tipografia cinética). */
const Palavras: React.FC<{ texto: string; y: number; tamanho: number; cor: string; inicio: number; italico?: boolean; passo?: number }> = ({ texto, y, tamanho, cor, inicio, italico, passo = 3 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Linha y={y} tamanho={tamanho} cor={cor} italico={italico}>
      {texto.split(' ').map((p, i) => {
        const s = spring({ frame: frame - inicio - i * passo, fps, config: { damping: 10, stiffness: 220 } });
        return (
          <span key={i} style={{ display: 'inline-block', margin: '0 0.14em', transform: `translateY(${(1 - s) * tamanho * 0.7}px) scale(${0.6 + s * 0.4})`, opacity: Math.min(1, s * 1.8) }}>
            {p}
          </span>
        );
      })}
    </Linha>
  );
};

/** Promessa fixa do topo, numa pílula, para a pessoa lembrar por que está assistindo. */
const Promessa: React.FC<{ texto: string }> = ({ texto }) => (
  <div style={{ position: 'absolute', top: 300, width: '100%', display: 'flex', justifyContent: 'center' }}>
    <div style={{ padding: '14px 34px', borderRadius: 50, background: 'rgba(14,14,16,.72)', border: `3px solid ${MARCA.amarelo}`, color: MARCA.amarelo, fontFamily: FONTE, fontWeight: 900, fontSize: caber(texto, 38, 760), letterSpacing: 1 }}>{texto}</div>
  </div>
);

/** Barra do topo: um traço por produto, enchendo na ordem da contagem. */
const Barra: React.FC<{ feitos: number; total: number }> = ({ feitos, total }) => {
  const frame = useCurrentFrame();
  const enchido = interpolate(frame, [0, QUADROS.item - 4], [0, 1], travar);
  const gap = 12;
  const w = (960 - gap * (total - 1)) / total;
  return (
    <>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ position: 'absolute', top: 258, left: 60 + i * (w + gap), width: w, height: 12, borderRadius: 6, background: 'rgba(255,255,255,.22)', overflow: 'hidden' }}>
          <div style={{ width: `${i < feitos ? 100 : i === feitos ? enchido * 100 : 0}%`, height: '100%', background: MARCA.amarelo }} />
        </div>
      ))}
    </>
  );
};

/** Cartão branco do produto, flutuando de leve. */
const Cartao: React.FC<{ imagem: string; largura: number; altura: number; zoom: number; flutua: number; inclina?: number }> = ({ imagem, largura, altura, zoom, flutua, inclina = 0 }) => (
  <div style={{ width: largura, height: altura, borderRadius: 44, background: '#fff', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,.55), 0 0 0 6px rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateY(${flutua}px) rotate(${inclina}deg)` }}>
    <Img src={imagem} style={{ width: '90%', height: '90%', objectFit: 'contain', transform: `scale(${zoom})` }} />
  </div>
);

/** Selo que entra carimbando. */
const Carimbo: React.FC<{ selo: Selo; inicio: number; style?: React.CSSProperties }> = ({ selo, inicio, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - inicio, fps, config: { damping: 9, stiffness: 230 } });
  const base: React.CSSProperties = { position: 'absolute', transform: `scale(${2.4 - s * 1.4}) rotate(-9deg)`, opacity: Math.min(1, s * 2.5), fontFamily: FONTE, fontWeight: 900, ...style };
  if (selo.tipo === 'desconto') {
    return (
      <div style={{ ...base, width: 250, height: 250, borderRadius: '50%', background: MARCA.vermelho, border: '8px solid #fff', boxShadow: '0 16px 40px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: 78, lineHeight: 1 }}>{selo.texto}</div>
        <div style={{ color: MARCA.amarelo, fontSize: 36, letterSpacing: 5 }}>OFF</div>
      </div>
    );
  }
  const amarelo = selo.tipo === 'historico';
  return <div style={{ ...base, padding: '18px 36px', borderRadius: 18, background: amarelo ? MARCA.amarelo : MARCA.vermelho, color: amarelo ? MARCA.fundo : '#fff', border: '6px solid #fff', fontSize: 44, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }}>{selo.texto}</div>;
};

/** Gancho: o nº 1 em tela cheia, o fato mais forte dele carimbado e a promessa de ver o nº 1 no fim. */
const Gancho: React.FC<{ props: PropsDosAchados }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n1 = props.itens[0]!;
  const entra = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const fato = spring({ frame: frame - 6, fps, config: { damping: 8, stiffness: 260 } });
  const t = useTransicao(QUADROS.gancho);
  return (
    <AbsoluteFill style={{ transform: tremor(frame, 9) }}>
      <FundoDoProduto imagem={n1.imagem} cor={n1.cor} zoom={1 + frame * 0.002} />
      <AbsoluteFill style={{ ...t, transform: `${t.transform}` }}>
        <div style={{ position: 'absolute', left: 90, top: 400, transform: `scale(${0.7 + entra * 0.3})`, opacity: entra }}>
          <Cartao imagem={n1.imagem} largura={900} altura={860} zoom={1 + frame * 0.003} flutua={Math.sin(frame / 8) * 8} inclina={-2} />
        </div>
        <Linha y={1300} tamanho={caber(props.fato, 132)} cor={MARCA.amarelo} italico style={{ transform: `scale(${2.2 - fato * 1.2}) rotate(-3deg)`, opacity: Math.min(1, fato * 2), WebkitTextStroke: `3px ${MARCA.fundo}` }}>
          {props.fato}
        </Linha>
        <Palavras texto="TOP 3 DE HOJE: ESPERA O Nº 1" y={1470} tamanho={caber('TOP 3 DE HOJE: ESPERA O Nº 1', 54)} cor="#fff" inicio={12} passo={2} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 270, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={58} /></div>
    </AbsoluteFill>
  );
};

/** Um produto da contagem: número gigante vazado atrás, produto flutuando, selo carimbando, nome cinético e provas em chips. */
const Item: React.FC<{ item: ItemDosAchados; rank: number; feitos: number; total: number; promessa: string }> = ({ item, rank, feitos, total, promessa }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 13, stiffness: 160 } });
  const numero = spring({ frame: frame - 2, fps, config: { damping: 10, stiffness: 120 } });
  const t = useTransicao(QUADROS.item);
  return (
    <AbsoluteFill style={{ transform: item.selo ? tremor(frame, 14) : '' }}>
      <FundoDoProduto imagem={item.imagem} cor={item.cor} zoom={1 + frame * 0.0015} />
      <AbsoluteFill style={t}>
        {/* Número gigante vazado atrás do produto: dá profundidade e diz a posição na contagem. */}
        <div style={{ position: 'absolute', left: -40, top: 640, fontFamily: FONTE, fontWeight: 900, fontStyle: 'italic', fontSize: 640, lineHeight: 1, color: 'transparent', WebkitTextStroke: `9px ${MARCA.amarelo}`, opacity: 0.6 * numero, transform: `translateX(${(1 - numero) * -200}px)` }}>
          {rank}
        </div>
        <div style={{ position: 'absolute', left: 130, top: 440, transform: `translateY(${(1 - entra) * 500}px) scale(${0.85 + entra * 0.15})`, opacity: Math.min(1, entra * 1.6) }}>
          <Cartao imagem={item.imagem} largura={820} altura={780} zoom={1 + frame * 0.0012} flutua={Math.sin(frame / 9) * 10} inclina={rank % 2 ? -1.5 : 1.5} />
        </div>
        {/* Etiqueta da posição, no canto do cartão. */}
        <div style={{ position: 'absolute', left: 80, top: 400, padding: '10px 30px', borderRadius: 22, background: MARCA.amarelo, color: MARCA.fundo, fontFamily: FONTE, fontWeight: 900, fontSize: 64, transform: `scale(${spring({ frame: frame - 6, fps, config: { damping: 7, stiffness: 260 } })}) rotate(-6deg)`, boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
          Nº {rank}
        </div>
        {item.selo ? <Carimbo selo={item.selo} inicio={12} style={{ right: 70, top: 420 }} /> : null}
        {item.nome.map((linha, k) => (
          <Palavras key={k} texto={linha} y={1270 + k * 78} tamanho={caber(linha, 64)} cor="#fff" inicio={9 + k * 4} />
        ))}
        <div style={{ position: 'absolute', top: 1290 + item.nome.length * 78, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', padding: '0 60px' }}>
          {item.provas.map((p, i) => {
            const s = spring({ frame: frame - 18 - i * 4, fps, config: { damping: 9, stiffness: 240 } });
            return (
              <div key={i} style={{ padding: '12px 26px', borderRadius: 40, background: i === 0 ? MARCA.amarelo : 'rgba(255,255,255,.14)', border: i === 0 ? 'none' : '2px solid rgba(255,255,255,.35)', color: i === 0 ? MARCA.fundo : '#fff', fontFamily: FONTE, fontWeight: 900, fontSize: 36, transform: `scale(${s})` }}>
                {p}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', top: 1590, left: 0, right: 0, textAlign: 'center', color: MARCA.suave, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 24 }}>{MARCA.aviso}</div>
      </AbsoluteFill>
      <Barra feitos={feitos} total={total} />
      <Promessa texto={promessa} />
      <Flash />
    </AbsoluteFill>
  );
};

const listaDeNumeros = (n: number) => Array.from({ length: n }, (_, i) => i + 1).join(', ').replace(/, (\d+)$/, ' OU $1');

/** Fim: os três em leque (o nº 1 no meio, maior) e o pedido de comentário pulsando. */
const Fim: React.FC<{ props: PropsDosAchados }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = props.itens.length;
  const chamada = `COMENTA ${listaDeNumeros(n)}`;
  const apoio = props.comentaQuero ? 'QUE EU TE MANDO O LINK NO DIRECT' : 'O LINK DE TODOS ESTÁ NA BIO';
  const pulso = 1 + 0.05 * Math.sin(frame / 2.4);
  // Ordem no leque: 2, 1, 3 (o nº 1 no centro, na frente).
  const ordem = n >= 3 ? [1, 0, 2] : props.itens.map((_, i) => i);
  return (
    <AbsoluteFill>
      <FundoDoProduto imagem={props.itens[0]!.imagem} cor={MARCA.vermelho} />
      <div style={{ position: 'absolute', top: 270, width: '100%', display: 'flex', justifyContent: 'center' }}><Logo altura={58} /></div>
      <Palavras texto="QUAL VOCÊ LEVARIA?" y={400} tamanho={caber('QUAL VOCÊ LEVARIA?', 96)} cor={MARCA.amarelo} italico inicio={2} />
      {ordem.map((idx, pos) => {
        const s = spring({ frame: frame - 4 - pos * 3, fps, config: { damping: 12, stiffness: 170 } });
        const centro = idx === 0;
        const x = [120, 290, 610][pos] ?? 290;
        const rot = [-10, 0, 10][pos] ?? 0;
        return (
          <div key={idx} style={{ position: 'absolute', left: x, top: centro ? 560 : 640, zIndex: centro ? 2 : 1, transform: `translateY(${(1 - s) * 600}px) rotate(${rot * s}deg) scale(${centro ? 1 : 0.86})`, opacity: Math.min(1, s * 1.5) }}>
            <Cartao imagem={props.itens[idx]!.imagem} largura={centro ? 500 : 380} altura={centro ? 560 : 440} zoom={1} flutua={Math.sin((frame + pos * 7) / 9) * 8} />
            <div style={{ position: 'absolute', left: -20, top: -34, width: 96, height: 96, borderRadius: '50%', background: MARCA.amarelo, color: MARCA.fundo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTE, fontWeight: 900, fontSize: 62, boxShadow: '0 8px 0 #B38F00' }}>{idx + 1}</div>
          </div>
        );
      })}
      <Linha y={1260} tamanho={caber(chamada, 104)} cor={MARCA.amarelo} italico style={{ transform: `scale(${pulso})`, WebkitTextStroke: `3px ${MARCA.fundo}` }}>{chamada}</Linha>
      <Palavras texto={apoio} y={1390} tamanho={caber(apoio, 44)} cor="#fff" inicio={10} passo={2} />
      <Flash />
    </AbsoluteFill>
  );
};

export const Achados: React.FC<PropsDosAchados> = (props) => {
  const n = props.itens.length;
  return (
    <AbsoluteFill style={{ background: MARCA.fundo }}>
      <Sequence durationInFrames={QUADROS.gancho}>
        <Gancho props={props} />
      </Sequence>
      {/* Contagem regressiva: o último do ranking primeiro, o nº 1 por último. */}
      {Array.from({ length: n }, (_, k) => {
        const idx = n - 1 - k;
        return (
          <Sequence key={k} from={QUADROS.gancho + k * QUADROS.item} durationInFrames={QUADROS.item}>
            <Item item={props.itens[idx]!} rank={idx + 1} feitos={k} total={n} promessa={props.promessa} />
          </Sequence>
        );
      })}
      <Sequence from={QUADROS.gancho + n * QUADROS.item} durationInFrames={QUADROS.fim}>
        <Fim props={props} />
      </Sequence>
      {props.audio ? <Audio src={staticFile(props.audio)} /> : null}
    </AbsoluteFill>
  );
};
