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
- A oferta de maior pontuação sai primeiro. Cada oferta sai uma vez.
- A imagem só é enviada à Meta depois de estar no ar no site, então a primeira publicação acontece na rodada seguinte à da oferta.
- Story pela API não aceita link nem legenda. Na bio do Instagram vai o seu gerenciador de links, com estes botões: **Ofertas de hoje** (https://flavianoct.github.io/achadinhos/bio.html, página que o robô atualiza a cada rodada com as últimas ofertas e os links de afiliado), **Blog** (https://flavianoct.github.io/achadinhos) e **Telegram** (https://t.me/topfera_achadinhos). A legenda e a arte dizem "ofertas no link da bio".

## Manutenção

- **Token vence em 60 dias.** O painel avisa a partir do dia 50. Para renovar, repita o passo 4 e atualize o Secret e a data.
- Se o painel mostrar "Instagram recusou (…/190)", o token venceu ou foi revogado.
- Comece devagar (2 a 3 posts por dia). Conta parada que de repente posta muito com link de afiliado pode ser limitada pela Meta.
- Escreva sempre que é publicidade: a legenda já leva "Publi: link de afiliado".
