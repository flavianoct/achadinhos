import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * Fonte dos vídeos: Archivo Black (licença livre OFL, em public/fontes). Vai junto do projeto para o vídeo sair igual no Windows e no
 * servidor do GitHub (Linux), que não tem a Arial Black. O vídeo só começa a ser desenhado depois que ela carrega.
 */
export const FAMILIA = 'Archivo Black';

let pedida = false;
export function carregarFonte(): void {
  if (pedida || typeof document === 'undefined') return;
  pedida = true;
  const espera = delayRender('Carregando a fonte Archivo Black');
  const fonte = new FontFace(FAMILIA, `url(${staticFile('fontes/ArchivoBlack-Regular.ttf')})`);
  fonte
    .load()
    .then((f) => {
      document.fonts.add(f);
      continueRender(espera);
    })
    .catch(() => continueRender(espera));
}
