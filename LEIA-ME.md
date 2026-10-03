# Achadinhos Bot

Robô que busca ofertas, filtra as boas, coloca o seu link de afiliado, posta num canal do Telegram e mantém um **blog online** com posts novos todo dia, escritos por IA.

Ele roda **de graça na nuvem, 24 horas, sem o seu PC ligado**, usando só uma conta do GitHub:

| Peça | O que faz | Custo |
|---|---|---|
| GitHub Actions | Executa o robô a cada meia hora | Grátis em repositório público |
| GitHub Pages | Hospeda o blog na internet | Grátis |
| GitHub Models | A IA que escreve os posts | Grátis, com limite diário |

| Loja | Situação |
|---|---|
| Shopee | Pronta, pela API oficial de afiliados. |
| Mercado Livre | Pronta, mas precisa ser validada com a sua conta (veja abaixo). |
| Amazon | Fase 2. O link com a sua tag já está pronto; a coleta automática depende de uma API que a Amazon só libera para contas com vendas recentes. |

## Colocar no ar (uma vez só)

### 1. Criar o repositório

1. Entre em https://github.com/new.
2. Dê um nome (ex.: `achadinhos`), marque **Public** e clique em **Create repository**. Não marque nenhuma outra opção.

O repositório precisa ser público para o GitHub Actions e o Pages serem gratuitos. O código fica visível, mas as suas chaves não: elas ficam nos Secrets (passo 4).

### 2. Enviar os arquivos

1. Na página do repositório vazio, clique em **uploading an existing file**.
2. No seu PC, abra a pasta `achadinhos-bot` (já extraída do zip), selecione **tudo o que está dentro dela** (Ctrl+A) e arraste para a página.
3. Espere a lista carregar e clique em **Commit changes**.
4. Confira se existe o arquivo `.github/workflows/robo.yml` no repositório. Se a pasta `.github` não tiver subido, clique em **Add file → Create new file**, digite o nome `.github/workflows/robo.yml`, cole o conteúdo desse arquivo e salve.

### 3. Ligar o blog

Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**.

### 4. Cadastrar as chaves

Em **Settings → Secrets and variables → Actions → New repository secret**, crie um secret para cada linha:

| Nome do secret | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | O token que o @BotFather mostrou. |
| `TELEGRAM_CHAT_ID` | O endereço do canal, ex.: `@meusachadinhos`. |
| `SHOPEE_APP_ID` | App ID da Open API de afiliados da Shopee. |
| `SHOPEE_SECRET` | Secret da Open API de afiliados da Shopee. |

O bot precisa ser **administrador do canal**, com permissão de postar. Se a opção Open API não aparecer no painel de afiliados da Shopee, é preciso solicitar a liberação por lá.

### 5. Primeira execução

1. Abra a aba **Actions**. Se aparecer um botão para habilitar os workflows, clique nele.
2. Escolha **Robô de ofertas → Run workflow**.
3. Em um ou dois minutos a execução termina. Clique nela para ver o resumo: quantas ofertas viu, quantas postou e o endereço do blog.

Daí em diante ele roda sozinho a cada meia hora. O blog fica em `https://SEUUSUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Acompanhar e ajustar

- **Ver o que o robô fez:** aba **Actions**. Cada execução tem um resumo. Execução em vermelho significa que algo precisa de atenção, e o resumo diz o quê.
- **Mudar ajustes** (desconto mínimo, horário, posts por rodada, nome do blog): edite o arquivo `ajustes.env` direto no GitHub (ícone do lápis) e salve. Vale na próxima execução.
- **Pausar tudo:** aba Actions → Robô de ofertas → menu "…" → **Disable workflow**.
- **Rodar na hora:** aba Actions → Robô de ofertas → **Run workflow**.

## Como é o blog

- **Posts novos todo dia:** um post geral ("Top 10 ofertas do dia 03/10/2026") e um por categoria com pelo menos 3 ofertas ("Top 5 ofertas de Tecnologia em 03/10/2026"). A lista é Top 3, 5 ou 10 conforme a quantidade de ofertas boas.
- **Ao longo do dia** os posts de hoje são atualizados com preços e ofertas novas.
- **Posts antigos** ficam no ar com endereço fixo, na página **Arquivo**, com um aviso de que os preços são daquele dia e um link para o post mais recente. Depois de 60 dias saem do ar (`BLOG_DIAS_NO_AR`).
- **Cada produto** mostra preço, desconto, selo de menor preço e um gráfico do histórico de preço que o próprio robô registra.
- **Para o Google:** cada página tem título, descrição, dados estruturados, `sitemap.xml` e `feed.xml`. Cadastre o endereço no Google Search Console e envie o sitemap. O tráfego de busca costuma levar meses para aparecer.

### A IA que escreve os posts

- É o **GitHub Models**, gratuito, com o modelo `openai/gpt-4o-mini` (dá para trocar em `ajustes.env`). Não precisa de chave: o próprio GitHub Actions fornece.
- Para cada post, ela escreve a **abertura**, **um parágrafo por produto** e o **fechamento** ("Como escolher").
- Ela recebe só o nome do produto, a categoria, a loja, a nota e as vendas. **Não recebe preços**: preço, desconto e histórico vêm direto dos dados, para não haver número inventado. Se o modelo citar preço ou percentual, o texto é descartado.
- O plano gratuito tem limite de pedidos por dia. O robô escreve no máximo 12 textos por execução e reaproveita o que já escreveu. Se o limite do dia acabar, os posts saem com um texto padrão e a IA completa nas execuções seguintes.

**Limite que você precisa conhecer:** a IA escreve a partir do nome do produto e às vezes afirma coisas que não estão no anúncio. As regras do robô reduzem isso, mas não eliminam. Leia alguns posts nos primeiros dias.

## Como ele decide o que postar

1. Guarda o preço de **tudo** o que vê, todo dia. Esse é o histórico.
2. Aprova a oferta se o desconto anunciado for bom **ou** se o preço caiu contra o histórico.
3. Barra "promoção falsa": desconto anunciado, mas o produto esteve mais barato nos últimos 30 dias.
4. Não repete o mesmo produto no canal por 7 dias, a não ser que o preço caia mais 5%.
5. Posta primeiro as ofertas com mais pontos (desconto, queda real, comissão, nota, vendas, frete grátis).
6. Marca cada oferta com uma categoria (`#tech`, `#casa`...). O blog usa isso para os posts por categoria.

O histórico, a fila e os posts ficam num banco de dados (`dados.db`) guardado no ramo `dados` do repositório. Não apague esse ramo.

## Mercado Livre (ative depois que a Shopee estiver rodando)

O Mercado Livre não tem API oficial para gerar link de afiliado. O robô faz assim:

- **Dados dos produtos:** o robô lê a página pública de ofertas do Mercado Livre (a API oficial bloqueia a listagem para apps comuns). Não precisa de app.
- **Seu código de afiliado:** gere um link qualquer no painel de afiliados, abra esse link no navegador e olhe a URL final. Copie os valores de `matt_word` e `matt_tool`.

Cadastre os secrets `ML_MATT_WORD` e `ML_MATT_TOOL` e mude `ML_ATIVO=1` em `ajustes.env`.

**Valide antes de confiar:** clique num link do Mercado Livre postado pelo robô e confira no painel de afiliados se o clique foi contado. Se não contar, desligue (`ML_ATIVO=0`) até o formato do link ser ajustado.

O robô pega os mais vendidos de cada categoria. Como essa listagem não traz "ofertas do dia", o Mercado Livre rende mais depois de alguns dias, quando o histórico de preços começa a detectar quedas.

## Avisos

- **Um lugar só:** não rode o robô no PC e na nuvem ao mesmo tempo com o mesmo canal, senão as ofertas saem repetidas.
- **Horários:** o GitHub pode atrasar as execuções agendadas em alguns minutos, às vezes mais em horários de pico.
- **Pausa automática:** o GitHub pode desligar agendamentos de repositórios sem atividade por 60 dias. Se o robô parar, reative na aba Actions.
- **Regras do GitHub:** o Actions gratuito é pensado para construir e publicar projetos. Publicar o blog se encaixa bem nisso; as postagens no Telegram são um uso menos típico. Se o GitHub restringir, o robô continua funcionando no PC (abaixo).
- Escreva na descrição do canal que os links são de afiliado. O blog já mostra esse aviso no rodapé, e também avisa quando o texto é de IA.
- Os testes automáticos (`npm test`) usam respostas simuladas das lojas, do Telegram e da IA. A primeira execução com as suas chaves reais é o teste de verdade.

## Rodar no PC (opcional)

O mesmo robô também roda no seu computador, com um painel no navegador. Precisa do Node.js 22.18 ou mais novo.

- `testar.bat`: demonstração com ofertas inventadas. Abre o painel e gera um blog de exemplo, sem enviar nada.
- `iniciar.bat`: robô de verdade, com painel em http://localhost:3210. As chaves e ajustes ficam na aba **Configurações**.
- No PC, a IA pode ser o **Ollama** (local e gratuito) ou a do GitHub (com um token pessoal com a permissão "models").

| Comando | O que faz |
|---|---|
| `npm start` | Robô + painel. |
| `npm run teste` | Demonstração com ofertas inventadas. |
| `npm run checar` | Testa as chaves e sai. |
| `npm run nuvem` | Uma rodada completa, como o GitHub Actions faz (usa `ajustes.env`). |
| `npm test` | Testes automáticos. |

## Painel e WhatsApp

- **Painel:** depois de cada rodada o robô publica `painel.html` no seu site (ex.: `.../achadinhos/painel.html`). Mostra fila, posts, erros, ajustes e as mensagens de WhatsApp prontas para copiar. É só leitura; os botões levam ao GitHub (onde só você, logado, altera algo). Não tem senha nem segredo nele.
- **WhatsApp:** `WHATSAPP_ATIVO=1` (padrão) faz o robô guardar cada oferta postada no Telegram em `whatsapp.json`. Quem posta no WhatsApp é o programa da pasta `enviador/`, no seu PC (veja `enviador/LEIA-ME.txt`). Use `WHATSAPP_ATIVO=0` em `ajustes.env` para desligar.
