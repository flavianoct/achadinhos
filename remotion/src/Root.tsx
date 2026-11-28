import React from 'react';
import { Composition } from 'remotion';
import { Achados, ACHADOS_FPS, duracaoDosAchados, type PropsDosAchados } from './Achados';
import { Carrossel, imagensDoCarrossel, type PropsDoCarrossel } from './Carrossel';
import { Destaque, DESTAQUE_FPS, duracaoDoDestaque, type PropsDoDestaque } from './Destaque';
import { CapaDoGrupo, Destaque as DestaqueDeIdentidade, Folha, Meme, MascoteSozinho, Perfil } from './Identidade';
import { VideoOferta, duracaoDoVideoOferta, VIDEO_OFERTA_FPS, type PropsDoVideoOferta } from './VideoOferta';
import { Oferta, duracaoDaOferta } from './Oferta';
import { duracaoDoReelNarrado, ReelNarrado, type PropsDoReelNarrado } from './ReelNarrado';
import { DestaqueImpacto, duracaoDoDestaqueImpacto } from './DestaqueImpacto';
import { AchadosImpacto, duracaoDosAchadosImpacto } from './AchadosImpacto';
import { Impacto, IMPACTO_FPS, DURACAO_DO_IMPACTO, type PropsDoImpacto } from './Impacto';
import { Divulgacao, DIVULGACAO_FPS, DURACAO_DA_DIVULGACAO, type PropsDaDivulgacao } from './Divulgacao';
import { duracaoDoReel, Reel, REEL_FPS, type PropsDoReel } from './Reel';
import { duracaoDaSolucao, SOLUCAO_FPS, SolucaoReel, type PropsDaSolucao } from './Solucao';
import { duracaoDoTikTok, TikTok, TIKTOK_FPS, type PropsDoTikTok } from './TikTok';

/** Valores de exemplo para o editor visual (`npm run estudio`). O comando `gerar` troca por os do produto. */
const reel: PropsDoReel = {
  produto: 'CHALEIRA',
  produtoCompleto: 'Chaleira elétrica',
  legendas: ['Pra aquele café ☕', 'Ou chá no sofá 🛋️'],
  duracaoS: 8,
};

const tiktok: PropsDoTikTok = {
  gancho: 'POV: sua tarde de sábado ☕',
  passos: ['Liga', 'Espera', 'Mexe', 'Aproveita'],
  duracaoS: 8,
};

/** Vídeo de divulgação do grupo: a narração é a gerada no ElevenLabs (voz Gabriel). */
const divulgacao: PropsDaDivulgacao = { chamada: 'botao', voz: 'voz-divulgacao.mp3', musica: 'musica-pop-leve-1.mp3' };

const videoOferta: PropsDoVideoOferta = { video: 'videos/panela-cacarola.mp4', quadros: 304, nome: ['PANELA CAÇAROLA 24 CM', 'TAMPA DE VIDRO · ANTIADERENTE'], comentaQuero: true };
const impacto: PropsDoImpacto = { voz: 'voz-impacto.mp3', musica: 'musica-funk-leve-1.mp3' };

/** Exemplo do Reel de achados para o editor visual; o robô passa os produtos de verdade em --props. */
const achados: PropsDosAchados = {
  itens: [1, 2, 3].map((n) => ({ nome: [`Produto ${n}`, 'Nome em duas linhas'], imagem: 'https://placehold.co/600x600/png', provas: ['Nota 4,8', '2 mil vendidos'], cor: '#E10600' })),
  fato: '2 MIL VENDIDOS',
  promessa: 'ESPERA O Nº 1',
  comentaQuero: true,
};

/** Exemplo do carrossel para o editor visual; o robô passa os produtos de verdade em --props. Cada quadro é uma imagem. */
const carrossel: PropsDoCarrossel = {
  titulo: ['5 ACHADOS DE PET', 'PRA SALVAR AGORA'],
  fato: '+12 MIL VENDIDOS',
  itens: [1, 2, 3, 4, 5].map((n) => ({ nome: [`Produto ${n}`], imagem: 'https://placehold.co/600x600/png', provas: ['★ 4,8'], cor: '#EA580C' })),
  comentaQuero: true,
};

/** Exemplo do Reel de destaque (um produto só) para o editor visual. */
const destaque: PropsDoDestaque = { nome: ['Vestido Midi', 'Canelado'], imagem: 'https://placehold.co/600x800/png', fato: '2,3 MIL VENDIDOS', provas: ['★ 4,9', '2,3 mil vendidos', 'Frete grátis'], cor: '#E11D48', comentaQuero: true };

/** Exemplo do Reel "problema → solução" para o editor visual; o comando `gerar-solucao` passa o produto de verdade. */
const solucao: PropsDaSolucao = {
  dor: ['TEU FONE MORRE', 'NO SUOR?'],
  resposta: 'Esse é resistente à água.',
  nome: ['Fone Bluetooth', 'à prova d’água'],
  imagem: 'https://placehold.co/800x800/png',
  prova: '14 MIL VENDIDOS',
  nota: '★ 4,7',
  cor: '#E10600',
  comentaQuero: true,
};

/** Exemplo do Reel narrado; o vídeo de verdade e os tempos da narração vêm em --props. */
const narrado: PropsDoReelNarrado = { video: 'videos/panela-cacarola.mp4', quadros: 304, quadrosDoFim: 130, cortes: [], gancho: { linhas: ['GANCHO'], ate: 1.6 }, falas: [], codigo: 101 };

export const Root: React.FC = () => (
  <>
    <Composition id="Divulgacao" component={Divulgacao} durationInFrames={DURACAO_DA_DIVULGACAO} fps={DIVULGACAO_FPS} width={1080} height={1920} defaultProps={divulgacao} />
    <Composition
      id="AchadosImpacto"
      component={AchadosImpacto}
      durationInFrames={duracaoDosAchadosImpacto(achados.itens.length)}
      fps={ACHADOS_FPS}
      width={1080}
      height={1920}
      defaultProps={achados}
      calculateMetadata={({ props }) => ({ durationInFrames: duracaoDosAchadosImpacto(props.itens.length) })}
    />
    <Composition id="DestaqueImpacto" component={DestaqueImpacto} durationInFrames={duracaoDoDestaqueImpacto(destaque)} fps={DESTAQUE_FPS} width={1080} height={1920} defaultProps={destaque} calculateMetadata={({ props }) => ({ durationInFrames: duracaoDoDestaqueImpacto(props) })} />
    <Composition id="Oferta" component={Oferta} durationInFrames={duracaoDaOferta(destaque)} fps={DESTAQUE_FPS} width={1080} height={1920} defaultProps={destaque} calculateMetadata={({ props }) => ({ durationInFrames: duracaoDaOferta(props) })} />
    <Composition id="ReelNarrado" component={ReelNarrado} durationInFrames={duracaoDoReelNarrado(narrado)} fps={30} width={1080} height={1920} defaultProps={narrado} calculateMetadata={({ props }) => ({ durationInFrames: duracaoDoReelNarrado(props) })} />
    <Composition id="IdPerfilAmarelo" component={Perfil} durationInFrames={1} fps={30} width={1080} height={1080} defaultProps={{ fundo: 'amarelo' as const }} />
    <Composition id="IdPerfilPreto" component={Perfil} durationInFrames={1} fps={30} width={1080} height={1080} defaultProps={{ fundo: 'preto' as const }} />
    <Composition id="IdMascoteAmarelo" component={MascoteSozinho} durationInFrames={1} fps={30} width={1080} height={1080} defaultProps={{ fundo: 'amarelo' as const }} />
    <Composition id="IdMascotePreto" component={MascoteSozinho} durationInFrames={1} fps={30} width={1080} height={1080} defaultProps={{ fundo: 'preto' as const }} />
    <Composition id="IdDestaque" component={DestaqueDeIdentidade} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{ icone: 'cupom' as const, rotulo: 'CUPONS' }} />
    <Composition id="IdCapaGrupo" component={CapaDoGrupo} durationInFrames={1} fps={30} width={1080} height={1350} />
    <Composition id="IdMeme" component={Meme} durationInFrames={1} fps={30} width={1080} height={1350} defaultProps={{ topo: 'ME: só vou olhar as promoções', base: 'O CARRINHO: 7 itens' }} />
    <Composition id="IdFolha" component={Folha} durationInFrames={1} fps={30} width={1920} height={1080} />
    <Composition id="VideoOferta" component={VideoOferta} durationInFrames={304} fps={VIDEO_OFERTA_FPS} width={1080} height={1920} defaultProps={videoOferta} calculateMetadata={({ props }) => ({ durationInFrames: duracaoDoVideoOferta(props) })} />
    <Composition id="Impacto" component={Impacto} durationInFrames={DURACAO_DO_IMPACTO} fps={IMPACTO_FPS} width={1080} height={1920} defaultProps={impacto} />
    <Composition id="Solucao" component={SolucaoReel} durationInFrames={duracaoDaSolucao(solucao)} fps={SOLUCAO_FPS} width={1080} height={1920} defaultProps={solucao} calculateMetadata={({ props }) => ({ durationInFrames: duracaoDaSolucao(props) })} />
    <Composition id="Destaque" component={Destaque} durationInFrames={duracaoDoDestaque(destaque)} fps={DESTAQUE_FPS} width={1080} height={1920} defaultProps={destaque} calculateMetadata={({ props }) => ({ durationInFrames: duracaoDoDestaque(props) })} />
    <Composition
      id="Carrossel"
      component={Carrossel}
      durationInFrames={imagensDoCarrossel(carrossel.itens.length)}
      fps={1}
      width={1080}
      height={1350}
      defaultProps={carrossel}
      calculateMetadata={({ props }) => ({ durationInFrames: imagensDoCarrossel(props.itens.length) })}
    />
    <Composition
      id="Achados"
      component={Achados}
      durationInFrames={duracaoDosAchados(achados.itens.length)}
      fps={ACHADOS_FPS}
      width={1080}
      height={1920}
      defaultProps={achados}
      calculateMetadata={({ props }) => ({ durationInFrames: duracaoDosAchados(props.itens.length) })}
    />
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={duracaoDoReel(reel.duracaoS)}
      fps={REEL_FPS}
      width={1080}
      height={1920}
      defaultProps={reel}
      calculateMetadata={({ props }) => ({ durationInFrames: duracaoDoReel(props.duracaoS) })}
    />
    <Composition
      id="TikTok"
      component={TikTok}
      durationInFrames={duracaoDoTikTok(tiktok.duracaoS)}
      fps={TIKTOK_FPS}
      width={1080}
      height={1920}
      defaultProps={tiktok}
      calculateMetadata={({ props }) => ({ durationInFrames: duracaoDoTikTok(props.duracaoS) })}
    />
  </>
);
