# Estúdio de vídeos (no seu PC) — quiz no TikTok e nos Shorts

O robô não depende disto: tudo aqui roda no seu computador e é opcional.

## O caminho do quiz

1. O robô publica o quiz no Instagram e **manda o mesmo vídeo para o seu Telegram privado**, com a legenda pronta para TikTok e Shorts
   (ligue com `QUIZ_ENVIAR_PARA=<seu ID>` no `ajustes.env`: mande /start para o seu bot e pergunte o seu ID ao @userinfobot).
2. (Opcional) Você gera um **gancho de 3 a 5 segundos no Wan2GP** e cola no início do quiz com `juntar-gancho.bat gancho.mp4 quiz.mp4`.
3. Você posta no TikTok (@qisuperior) e nos Shorts, colando a legenda que veio junto. Leva 1 minuto.

O gancho é só uma cena de impacto antes da pergunta. O produto e o preço do quiz continuam sendo os reais: a IA nunca mostra o produto.
Rotule como "conteúdo feito com IA" quando o app pedir (TikTok e YouTube pedem para cena realista).

## Prompts de gancho para o Wan2GP (em inglês, o Wan entende melhor)

Vertical 9:16, 4 a 5 segundos, câmera lenta funciona bem. Escolha um por vídeo e troque de vez em quando.

1. **Preço despencando**
   `A glowing yellow price tag falling and shattering into golden coins on a dark floor, slow motion, cinematic lighting, vertical video`
2. **Caça ao preço**
   `A cartoon detective with a magnifying glass walking through a giant supermarket aisle full of floating price tags, colorful, smooth camera, vertical video`
3. **Mistério da sombra** (para o formato "Que produto é esse?")
   `A mysterious black silhouette of an object rotating slowly in spotlight, dark background, smoke, dramatic lighting, vertical video`
4. **Duelo A x B** (para o formato "Qual você prefere?")
   `Two glowing doors, one blue and one red, in a dark hallway, camera pushing in slowly, dramatic atmosphere, vertical video`
5. **Contagem regressiva**
   `A giant golden stopwatch on a dark background ticking, sparks flying, dramatic zoom in, vertical video`

Dica: gere 3 versões de cada, fique com a melhor e guarde as boas numa pasta para reaproveitar.

## Texto na tela do gancho

O vídeo gerado não tem texto. Se quiser uma frase ("Você acerta o preço?"), coloque no próprio app do TikTok ou do CapCut: sai melhor do que pedir texto à IA.
