# Instagram automático: passo a passo

O robô publica no Instagram uma foto de feed (com legenda) e um Story (sem legenda) das melhores ofertas. Ele usa a API oficial, então a conta precisa ser **profissional**. Isso é grátis e dá para desfazer.

## Parte 1: você faz (uns 20 minutos)

1. **Converter a conta para profissional.** No app do Instagram: Configurações → Tipo de conta e ferramentas → Mudar para conta profissional → Criador (ou Empresa).
2. **Criar o app na Meta.** Entre em developers.facebook.com com o seu Facebook, clique em *Meus apps* → *Criar app*. Escolha o caso de uso de **Instagram / "Gerenciar mensagens e conteúdo no Instagram"** (o nome muda; o que importa é ter o produto *API do Instagram com login do Instagram*).
3. **Adicionar a sua conta.** No painel do app, em *Instagram → Configuração da API com login do Instagram*, adicione a conta `mulher_empreededoraoficial` (função de testador/desenvolvedor) e **aceite o convite** no Instagram: Configurações → Apps e sites → Convites de testadores.
4. **Gerar o token.** Na mesma tela do painel, clique em *Gerar token* ao lado da conta e autorize, marcando a permissão `instagram_business_content_publish`. Copie o token (é longo) e o **ID da conta Instagram** que aparece ao lado.
5. **Cadastrar nos Secrets do GitHub** (você mesmo, eu não digito chaves): Settings → Secrets and variables → Actions → *New repository secret*:
   - `INSTAGRAM_TOKEN` = o token
   - `INSTAGRAM_USER_ID` = o ID da conta
6. **Ligar.** Em `ajustes.env`, acrescente:
   ```
   INSTAGRAM_ATIVO=1
   INSTAGRAM_TOKEN_DATA=2026-10-03
   ```
   (a data é o dia em que você gerou o token; o painel avisa quando faltar pouco para vencer).

## Parte 2: o robô faz sozinho

- No máximo **1 foto de feed por rodada** e até **3 por dia**, **6 Stories por dia**, só no horário de postagem. Ajustável em `INSTAGRAM_FEED_POR_DIA` e `INSTAGRAM_STORIES_POR_DIA`. Para não parecer spam, também há um intervalo mínimo entre publicações: **3 horas entre fotos de feed** e **1 hora entre Stories** (`INSTAGRAM_INTERVALO_FEED_MIN` e `INSTAGRAM_INTERVALO_STORY_MIN`, em minutos).
- **Publica só nos horários escolhidos:** feed às 12h, 18h e 21h e Stories às 8h, 10h, 12h, 15h, 18h, 20h e 21h (hora de Brasília), em `INSTAGRAM_HORARIOS_FEED` e `INSTAGRAM_HORARIOS_STORIES`. Antes o robô publicava na primeira rodada permitida, e os 3 posts e 6 Stories do dia saíam todos de manhã e à tarde, antes do horário em que mais gente costuma estar online. **Esses horários são palpites:** o certo é o do seu público. No Instagram, abra Painel profissional → Insights → Total de seguidores → Horários mais ativos e troque os números no `ajustes.env`.
- **Só vai produto que passa confiança:** nota 4,6 ou mais, 300 vendas ou mais e sem palavras como "genérico", "paralelo" ou "similar" no título (`INSTAGRAM_NOTA_MINIMA`, `INSTAGRAM_VENDAS_MINIMAS`, `INSTAGRAM_PALAVRAS_BLOQUEADAS`).
- **Carrossel do dia ("Top 5 até R$ 100"):** uma vez por dia o robô monta um carrossel com os melhores produtos abaixo de um teto de preço (50, 100 e 200 em rodízio, no máximo 2 por categoria). Ele ocupa a vaga do feed da rodada e conta no limite de 3 por dia. Ajuste em `INSTAGRAM_CARROSSEL_POR_DIA` (0 desliga), `INSTAGRAM_CARROSSEL_ITENS` (3 a 9) e `INSTAGRAM_CARROSSEL_TETOS`. Se a Meta recusar o carrossel, o robô tenta no máximo 3 vezes e avisa no resumo da rodada.
- **Dica "Antes de comprar [produto]":** na terça, quinta e sábado (`INSTAGRAM_DICAS_DIAS`) o carrossel do dia é educativo: "5 coisas para olhar antes de comprar air fryers", um critério por imagem e, no fim, os 3 primeiros do guia daquele produto. Cada critério vem com uma explicação prática de como decidir (escrita em `src/dicas.ts`, a mesma que aparece nas páginas dos guias do blog): orientação geral, sem marca, sem fingir teste e com cautela em saúde. A capa e cada imagem pedem para salvar, e a legenda traz uma pergunta para gerar comentários. O mesmo assunto não volta antes de 14 dias; sem assunto novo (guia com 3 produtos ou mais), o dia vira Top.
- **Reel do dia (vídeo):** uma vez por dia o robô monta um vídeo vertical de uns 17 segundos, "Top 3 achadinhos do dia": abertura, uma tela por produto (a mesma arte do Story, com zoom suave e o preço do momento) e fechamento com "Link na bio · Telegram". Ele leva uma trilha de fundo **criada pelo próprio robô** (batida leve sintetizada em código, sem música de terceiros e sem direito autoral). Usa o ffmpeg (o workflow instala) e sai nas horas de INSTAGRAM_HORARIOS_REELS (padrão 19h e 20h), com o limite de INSTAGRAM_REELS_POR_DIA (padrão 1; 0 desliga). O vídeo é montado numa rodada e publicado numa rodada seguinte, quando já está no ar no site. A legenda não traz preço (ele muda) e leva o aviso de publi. O Reel não conta no limite de 3 posts de feed.
- **O que a arte mostra:** o selo do topo traz o motivo (menor preço em N dias, economia em reais ou a categoria), o card traz nota, vendas e frete, e o preço "de" riscado some quando o histórico de 14 dias ou mais mostra que o produto nunca custou perto dele.
- A oferta de maior pontuação sai primeiro. Cada oferta sai uma vez.
- A imagem só é enviada à Meta depois de estar no ar no site, então a primeira publicação acontece na rodada seguinte à da oferta.
- Story pela API não aceita link nem legenda. Na bio do Instagram vai o seu gerenciador de links, com estes botões: **Ofertas de hoje** (https://flavianoct.github.io/achadinhos/bio.html, página que o robô atualiza a cada rodada com as últimas ofertas e os links de afiliado), **Blog** (https://flavianoct.github.io/achadinhos) e **Telegram** (https://t.me/topfera_achadinhos). A legenda e a arte dizem "ofertas no link da bio".

## Manutenção

- **Token vence em 60 dias.** O painel avisa a partir do dia 50. Para renovar, repita o passo 4 e atualize o Secret e a data.
- Se o painel mostrar "Instagram recusou (…/190)", o token venceu ou foi revogado.
- Comece devagar (2 a 3 posts por dia). Conta parada que de repente posta muito com link de afiliado pode ser limitada pela Meta.
- Escreva sempre que é publicidade: a legenda já leva "Publi: link de afiliado".
