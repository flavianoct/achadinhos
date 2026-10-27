import React from 'react';
import { Composition } from 'remotion';
import { Achados, ACHADOS_FPS, duracaoDosAchados, type PropsDosAchados } from './Achados';
import { duracaoDoReel, Reel, REEL_FPS, type PropsDoReel } from './Reel';
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

/** Exemplo do Reel de achados para o editor visual; o robô passa os produtos de verdade em --props. */
const achados: PropsDosAchados = {
  itens: [1, 2, 3].map((n) => ({ nome: [`Produto ${n}`, 'Nome em duas linhas'], imagem: 'https://placehold.co/600x600/png', provas: ['Nota 4,8', '2 mil vendidos'], cor: '#E10600' })),
  fato: '2 MIL VENDIDOS',
  promessa: 'ESPERA O Nº 1',
  comentaQuero: true,
};

export const Root: React.FC = () => (
  <>
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
