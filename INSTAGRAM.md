# Instagram automático: passo a passo

> **Formato Mata Preço (atual).** As artes não mostram **nenhum preço em reais**: a pergunta grande ("CAIU MESMO?", ou "QUANTO CUSTA AGORA?" quando não há motivo para afirmar queda) chama a atenção, o produto aparece com nota e vendas, e a faixa vermelha "O PREÇO ESTÁ NO GRUPO · LINK NA BIO" leva quem quer o preço para o grupo. Um só visual para todos os assuntos (as cores da marca ficam em `MARCA`, no começo de `src/moldes.ts`). O Instagram está **desligado** (`INSTAGRAM_ATIVO=0`) até as artes serem conferidas e o perfil novo ser configurado.
>
> **O Instagram é a vitrine do grupo.** Além dos posts de produto (amostras do que chega no grupo), há dois formatos que vendem o próprio grupo, sempre com números de verdade tirados do robô:
> - **Story "Hoje no grupo"** (todo dia, a partir de `INSTAGRAM_RESUMO_HORA`, padrão 21h): quantos achados o grupo recebeu hoje, o maior desconto em %, quantos estavam no menor preço do mês, os assuntos do dia e fotos de alguns achados, com "ENTRE NO GRUPO · é grátis · link na bio". Com menos de 3 achados no dia, não sai.
> - **Carrossel "Por que entrar no grupo"** (uma vez por semana, nos dias de `INSTAGRAM_GRUPO_DIAS`, padrão segunda): achados da semana, os 30 dias de histórico de preço (o que já esteve mais barato no último mês fica de fora), as regras do filtro (desconto mínimo, queda no histórico, nota e vendas, nada de réplica ou usado) e os assuntos. Bom para **fixar no perfil** (isso é manual, no app). Com menos de 10 achados na semana, espera.
> - As legendas e o fechamento do Reel convidam para o grupo. Sem grupo de WhatsApp configurado, nada promete grupo.

O robô publica no Instagram uma foto de feed (com legenda) e um Story (sem legenda) das melhores ofertas, sempre sem o preço em reais (ele fica no grupo). Ele usa a API oficial, então a conta precisa ser **profissional**. Isso é grátis e dá para desfazer.

## Parte 1: você faz (uns 20 minutos)

1. **Converter a conta para profissional.** No app do Instagram: Configurações → Tipo de conta e ferramentas → Mudar para conta profissional → Criador (ou Empresa).
2. **Criar o app na Meta.** Entre em developers.facebook.com com o seu Facebook, clique em *Meus apps* → *Criar app*. Escolha o caso de uso de **Instagram / "Gerenciar mensagens e conteúdo no Instagram"** (o nome muda; o que importa é ter o produto *API do Instagram com login do Instagram*).
3. **Adicionar a sua conta.** No painel do app, em *Instagram → Configuração da API com login do Instagram*, adicione a conta `mataprecooficial` (função de testador/desenvolvedor) e **aceite o convite** no Instagram: Configurações → Apps e sites → Convites de testadores.
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

- No máximo **1 foto de feed por rodada** e até **2 por dia**, **5 Stories por dia**, só no horário de postagem. Ajustável em `INSTAGRAM_FEED_POR_DIA` e `INSTAGRAM_STORIES_POR_DIA`. Para não parecer spam, também há um intervalo mínimo entre publicações: **3 horas entre fotos de feed** e **1 hora entre Stories** (`INSTAGRAM_INTERVALO_FEED_MIN` e `INSTAGRAM_INTERVALO_STORY_MIN`, em minutos).
- **Publica só nos horários escolhidos:** feed às 12h, 18h e 21h e Stories às 8h, 10h, 12h, 15h, 18h, 20h e 21h (hora de Brasília), em `INSTAGRAM_HORARIOS_FEED` e `INSTAGRAM_HORARIOS_STORIES`. Antes o robô publicava na primeira rodada permitida, e os 3 posts e 6 Stories do dia saíam todos de manhã e à tarde, antes do horário em que mais gente costuma estar online. **Esses horários são palpites:** o certo é o do seu público. No Instagram, abra Painel profissional → Insights → Total de seguidores → Horários mais ativos e troque os números no `ajustes.env`.
- **Só vai produto que passa confiança:** nota 4,6 ou mais, 300 vendas ou mais e sem palavras como "genérico", "paralelo" ou "similar" no título (`INSTAGRAM_NOTA_MINIMA`, `INSTAGRAM_VENDAS_MINIMAS`, `INSTAGRAM_PALAVRAS_BLOQUEADAS`).
- **Carrossel do dia = dica "Antes de comprar [produto]":** o "Top 5 até R$ X" saiu (mostrava preço). Na terça, quinta e sábado (`INSTAGRAM_DICAS_DIAS`) o carrossel do dia, que ocupa a vaga do feed e conta no limite de posts de feed, é educativo (`INSTAGRAM_CARROSSEL_POR_DIA=0` desliga): "5 coisas para olhar antes de comprar air fryers", um critério por imagem e, no fim, os 3 primeiros do guia daquele produto. Cada critério vem com uma explicação prática de como decidir (escrita em `src/dicas.ts`, a mesma que aparece nas páginas dos guias do blog): orientação geral, sem marca, sem fingir teste e com cautela em saúde. A capa e cada imagem pedem para salvar, e a legenda traz uma pergunta para gerar comentários. O mesmo assunto não volta antes de 14 dias; sem assunto novo (guia com 3 produtos ou mais), não há carrossel nesse dia. O fechamento mostra os 3 do guia com foto, nota e vendas, sem preço, e a faixa do grupo.
- **Reel do dia (vídeo):** uma vez por dia o robô monta um vídeo vertical de uns 17 segundos, "Caiu mesmo? 3 achados de hoje": abertura com a pergunta, uma tela por produto (a mesma arte do Story, com zoom suave) e fechamento "O preço está no grupo · link na bio". Ele leva uma trilha de fundo **criada pelo próprio robô** (batida leve sintetizada em código, sem música de terceiros e sem direito autoral). Usa o ffmpeg (o workflow instala) e sai nas horas de INSTAGRAM_HORARIOS_REELS (padrão 19h e 20h), com o limite de INSTAGRAM_REELS_POR_DIA (padrão 1; 0 desliga). O vídeo é montado numa rodada e publicado numa rodada seguinte, quando já está no ar no site. A legenda não traz preço (ele fica no grupo) e leva o aviso de publi. O Reel não conta no limite de 3 posts de feed.
- **O que a arte mostra:** a pergunta grande, o selo do topo com o motivo (menor preço em N dias, desconto em % ou a categoria), o círculo com o desconto em % quando ele é confiável, o card com nota, vendas e frete, e a faixa do grupo. O desconto some quando o histórico de 14 dias ou mais mostra que o produto nunca custou perto do preço "de" (e a pergunta passa a ser "QUANTO CUSTA AGORA?"). Valor em reais nunca aparece.
- A oferta de maior pontuação sai primeiro. Cada oferta sai uma vez.
- A imagem só é enviada à Meta depois de estar no ar no site, então a primeira publicação acontece na rodada seguinte à da oferta.
- Story pela API não aceita link nem legenda. Na bio do Instagram vai o seu gerenciador de links, com estes botões: **Ofertas de hoje** (https://flavianoct.github.io/achadinhos/bio.html, página que o robô atualiza a cada rodada com as últimas ofertas e os links de afiliado), **Blog** (https://flavianoct.github.io/achadinhos) e **Telegram** (https://t.me/topfera_achadinhos). A legenda e a arte dizem "ofertas no link da bio".

## Manutenção

- **Token vence em 60 dias.** O painel avisa a partir do dia 50. Para renovar, repita o passo 4 e atualize o Secret e a data.
- Se o painel mostrar "Instagram recusou (…/190)", o token venceu ou foi revogado.
- Comece devagar (2 a 3 posts por dia). Conta parada que de repente posta muito com link de afiliado pode ser limitada pela Meta.
- Escreva sempre que é publicidade: a legenda já leva "Publi: link de afiliado".
