import React from 'react';
import { Composition } from 'remotion';
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

export const Root: React.FC = () => (
  <>
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
