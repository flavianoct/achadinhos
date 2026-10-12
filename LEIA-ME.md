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

- **Dados dos produtos:** o robô lê a página pública de ofertas do Mercado Livre. Quando o site barra com captcha (a página abre, mas sem ofertas), ele usa a **API oficial como reserva**: troca `ML_CLIENT_ID` e `ML_CLIENT_SECRET` (Secrets, do app em developers.mercadolivre.com.br; permissão Items marcada) por um token, lê os 20 mais vendidos de 2 categorias por rodada (`/highlights`), monta cada oferta pelo produto de catálogo (`/products`: nome, foto, preço do anúncio vencedor e preço antigo, de onde vem a porcentagem) e tenta buscar a nota (`/reviews/item`) e as vendas (`/items`). A API **não informa vendas nos mais vendidos**; por isso o Instagram aceita produto do ranking sem esses números (`maisVendido`). Cada rodada escreve no log uma linha `[ml-api]` com o que veio e as falhas dos complementos. Sem o captcha, a leitura da página continua sendo a primeira opção. O teste local `node testar-api-ml.mjs` (com `ml-teste.env`, que não vai para o GitHub) mapeia todos os recursos.
- **Categorias em rodízio:** das páginas lidas por rodada (`ML_PAGINAS`), algumas vão para as ofertas de uma categoria (`ML_PAGINAS_DE_CATEGORIA`, lista em `ML_CATEGORIAS`). O total de pedidos ao site não muda; os guias de compra ganham produtos que a vitrine geral não mostra. Para voltar a ler só a vitrine geral, use `ML_PAGINAS_DE_CATEGORIA=0`.
- **Seu código de afiliado:** gere um link qualquer no painel de afiliados, abra esse link no navegador e olhe a URL final. Copie os valores de `matt_word` e `matt_tool`.

Cadastre os secrets `ML_MATT_WORD` e `ML_MATT_TOOL` e mude `ML_ATIVO=1` em `ajustes.env`.

**Valide antes de confiar:** clique num link do Mercado Livre postado pelo robô e confira no painel de afiliados se o clique foi contado. Se não contar, desligue (`ML_ATIVO=0`) até o formato do link ser ajustado.

O robô pega os mais vendidos de cada categoria. Como essa listagem não traz "ofertas do dia", o Mercado Livre rende mais depois de alguns dias, quando o histórico de preços começa a detectar quedas.

## Datas especiais (10.10, 11.11, Black Friday, Dia das Mães...)

O robô conhece sozinho as datas do varejo: as datas duplas (1.1 a 12.12), Dia da Mulher, Dia do Consumidor, Páscoa, Dia das Mães, Dia dos Namorados, Dia dos Pais, Dia do Cliente, Dia das Crianças, Black Friday com Cyber Monday e Natal. As que mudam de dia a cada ano (Páscoa, Mães, Pais, Black Friday) ele calcula.

Em cada data ele faz três coisas:
- **Lembrete para você, só no painel** (Avisos do robô): `DATAS_AVISO_DIAS` dias antes (padrão 3), para você colar o link da campanha e os cupons. Nunca vai para o canal.
- **Aviso no Telegram**: na véspera às 18h ("Amanhã é 10.10!"), na abertura a partir das 9h e nas últimas horas, a partir das 20h do último dia. Cada um sai uma vez só, sem preço e sem número inventado. O WhatsApp e o Instagram não mudam.
- **Datas grandes** (6.6, 7.7, 9.9, 10.10, 11.11, 12.12, Dia do Consumidor, semanas de Mães, Namorados, Pais, Crianças e Natal, Black Friday) ganham mais três coisas:
  - **A lista dos 5 melhores achados**, no Telegram, a partir das 13h do primeiro dia: os mais vendidos e bem avaliados, só com o que o robô sabe (nota, vendas, menor preço em N dias), sem preço. Se não houver produto bom o bastante, ela espera e não segura os outros avisos.
  - **Mais posts por rodada no Telegram** (`DATAS_POSTS_EXTRA`, padrão 2), com o limite do dia subindo junto. O WhatsApp não muda.
  - **Story no Instagram** a partir das 10h (`INSTAGRAM_DATA_HORA`): só a marca Mata Preço e texto, sem foto de produto, sem logo nem nome de loja.
  No `datas.json`, `"grande": true` ou `"grande": false` liga ou desliga isso para uma data.
- **Links**: o do Mercado Livre é a página de ofertas com o seu código de afiliado. A Shopee só entra se você colocar o link dela em `datas.json`: um link gerado às cegas já mostrou "oferta expirada".

Para colocar o link oficial de uma campanha, ou acrescentar uma data sua, edite `datas.json` (na raiz, pelo lápis do GitHub). Uma data com o mesmo `inicio` de uma data do calendário só ajusta os links; uma com `inicio` novo é acrescentada:

```json
[
  { "inicio": "2026-11-11", "mercadolivre": "https://www.mercadolivre.com.br/...", "shopee": "https://s.shopee.com.br/..." },
  { "nome": "Aniversário da loja", "emoji": "🎂", "inicio": "2026-11-20", "fim": "2026-11-22" }
]
```

`DATAS_ATIVO=0` desliga tudo. Erros no arquivo (data errada, link de outra loja) aparecem nos Avisos do robô e a data com problema é ignorada.

## Cupons (Mercado Livre e Shopee)

O robô posta no Telegram cupons de duas origens: os que você cadastrar no arquivo `cupons.json` (na raiz do repositório) e os que ele **garimpa sozinho**.

**Garimpo automático** (`CUPONS_GARIMPO=1`, ligado por padrão). Nem o Mercado Livre nem a Shopee têm API de cupom para afiliado, então o robô lê as páginas públicas de cupons do Promobit e só aproveita o que passa em travas rígidas, porque cupom inválido queima a confiança do canal:
- cupom **com código**: só se o site marcou como verificado, o código parece de verdade (nada de "DESCONTO", "ECONOMIA", "RESGATENOLINK"...) e a validade não passou;
- cupom de **ativar na página** (sem código): só com data de validade futura e um benefício concreto (R$ ou %) no título;
- **cashback não é cupom** e fica de fora; entram no máximo 4 cupons por loja, os mais recentes, e o mesmo cupom não repete antes de `CUPONS_REPETIR_DIAS`;
- o link do post é sempre o **seu** de afiliado: no Mercado Livre sai dos seus `ML_MATT_WORD`/`ML_MATT_TOOL` (leva à página de cupons da loja); na Shopee você informa o seu link da página de cupons em `CUPONS_LINK_SHOPEE` (sem ele, a Shopee fica de fora e o painel avisa);
- `CUPONS_BLOQUEAR` descarta qualquer cupom que tenha uma dessas palavras no código ou no título (ex.: `primeira compra`);
- problemas (site fora do ar, página que mudou de formato) aparecem só na seção **Avisos do robô** do painel, nunca no canal.

Os cupons dos sites de terceiros não têm garantia: vale conferir de vez em quando o que o robô postou. Os seus, do `cupons.json`, sempre têm prioridade, e o limite por dia (`CUPONS_POR_DIA`) vale para os dois juntos.

Para os **seus** cupons:

Para cadastrar, abra `cupons.json` no GitHub (ícone do lápis), escreva a lista e salve. Vale na próxima execução:

```json
[
  {
    "loja": "mercadolivre",
    "codigo": "ACHA30",
    "titulo": "R$ 30 OFF em compras acima de R$ 200",
    "detalhe": "Só no app. Uma vez por CPF.",
    "link": "https://meli.la/SEU-LINK-DE-AFILIADO",
    "validoAte": "2026-10-31"
  },
  {
    "loja": "shopee",
    "titulo": "R$ 10 OFF sem mínimo",
    "link": "https://shp.ee/SEU-LINK-DE-AFILIADO"
  }
]
```

- `loja`: `mercadolivre` ou `shopee` (Amazon ainda não). `titulo` e `link` são obrigatórios; o link precisa ser do site da loja (inclusive os encurtadores meli.la e shp.ee) e começar com https.
- `codigo`: deixe de fora quando o cupom é só "ativar na página".
- `validoAte`: último dia, no formato AAAA-MM-DD. Depois dele o cupom some sozinho. Sem data, o cupom vale até você apagá-lo.
- O robô posta primeiro os cupons que ainda não saíram e, depois, repete os que vencem antes. Limites em `ajustes.env`: `CUPONS_POR_DIA` (padrão 3), `CUPONS_REPETIR_DIAS` (padrão 3) e `CUPONS_ATIVO=0` para desligar.
- Erros no arquivo (vírgula faltando, link de outra loja, data errada) aparecem no resumo da rodada, na aba Actions, e o cupom com problema é ignorado.

## Nichos e canais por categoria

Toda oferta que entra no robô é classificada sozinha em um nicho, pelas palavras do título: **Eletrônicos** (`tech`), **Games**, **Moda**, **Casa & Cozinha** (`casa`), **Esportes** (`esporte`), **Beleza**, **Bebê & Infantil** (`bebe`), **Pet**, **Ferramentas** e **Geral**. Cada nicho soma pontos pelas palavras que aparecem (palavra no começo do título vale o dobro) e vence o que tiver mais; título sem palavra conhecida fica em Geral. O nicho vai junto com a oferta na fila, no histórico e no blog. As palavras ficam em `src/categoria.ts`.

**Um canal por nicho (opcional).** Em `ajustes.env`, preencha `ROTAS_TELEGRAM` com `nicho=canal` separados por vírgula:

```
ROTAS_TELEGRAM=tech=@meucanaltech,moda=@meucanalmoda
```

- O bot precisa ser administrador de cada canal (a opção "Testar chaves" do painel local confere todos).
- Nicho sem rota vai para o canal geral (`TELEGRAM_CHAT_ID`). Assim o geral recebe tudo o que não tem canal próprio.
- `ROTAS_TAMBEM_NO_GERAL=1` faz as ofertas de nichos com canal próprio saírem também no geral.
- **Filtro do canal geral:** `GERAL_NICHOS=tech,casa` deixa entrar no geral só esses nichos (vazio = todos); `GERAL_SEM_NICHOS=bebe,pet` tira esses nichos do geral. Uma oferta de nicho sem canal próprio que o geral não aceita não é postada no Telegram (continua no blog). O filtro vale também para `ROTAS_TAMBEM_NO_GERAL` e para o desvio quando um canal de nicho recusa. Na tabela do painel, esses nichos aparecem como "não enviado".
- Se um canal de nicho recusar o post (bot sem permissão, canal apagado), a oferta não se perde: vai para o canal geral e a rodada mostra um aviso.
- Nome de nicho que não existe ou canal escrito errado é ignorado e aparece como aviso no resumo da rodada e no painel.

**Mais ajustes por nicho** (todos em `ajustes.env`, ou pela página Configurar):
- `NICHO_MAX_POR_DIA` e `NICHO_LIMITES=moda=8,tech=15`: teto de posts por dia de cada nicho. O que passar do teto fica na fila e outro nicho é postado.
- `NICHO_PALAVRAS_MODA=cropped,biquini,-relogio`: acrescenta palavras ao classificador do nicho; com `-` na frente, tira. Vale para qualquer nicho (`NICHO_PALAVRAS_TECH`, `_CASA`, `_BELEZA`...).
- `WHATSAPP_ROTAS=moda=https://chat.whatsapp.com/XXXX`: grupos e canais de WhatsApp de um nicho (um nicho pode ter vários). Os de `WHATSAPP_DESTINOS` são gerais e seguem o filtro do canal geral. Uma oferta de nicho sem canal no Telegram mas com grupo de WhatsApp vai só para o WhatsApp. O enviador do PC precisa estar atualizado para separar por nicho.

**Página Configurar** (`configurar.html`, link no painel): seletores para lojas, filtro, horário, a tabela de nichos (canal do Telegram, "no geral", WhatsApp do nicho, limite e palavras), os canais e grupos gerais do WhatsApp e o editor de cupons. Ela lê os arquivos do repositório, mostra o que mudou e o botão copia o arquivo novo e abre o editor do GitHub: apague tudo, cole e salve. Nenhuma senha ou chave passa pela página. Funciona com o repositório público.

**Shopee: campanhas e vendas.** `CAMPANHAS_POR_DIA=1` posta no canal geral uma campanha da própria Shopee por dia (as páginas tipo "10.10" ou "Frete Grátis", com o seu link), sem repetir por `CAMPANHAS_REPETIR_DIAS`. `VENDAS_ATIVO=1` lê o relatório de vendas de afiliado da Shopee a cada `VENDAS_HORAS` horas e o painel mostra vendas e comissão dos últimos 7 dias por nicho. O Mercado Livre não tem esses dados por API.

**No painel online** (`painel.html`), a seção "Ofertas por nicho" mostra o nicho que mais disparou hoje, a maior fila, a distribuição dos posts dos últimos 7 dias (gráfico de rosca) e uma tabela com posts de hoje e da semana, ofertas na fila, aprovadas nas últimas 24 h e o canal de cada nicho. A lista de últimas ofertas tem filtro por nicho. O painel não mostra cliques: o link de afiliado vai direto para a loja, então os cliques só aparecem nos painéis de afiliado da Shopee e do Mercado Livre.

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

## Bio, Reel e WhatsApp na nuvem

- **Avisos do robô (só para o dono):** o painel (`painel.html`) tem a seção **Avisos do robô**, no topo, com o que está errado agora (em vermelho ou amarelo, com há quanto tempo e em quantas rodadas), e os avisos resolvidos dos últimos 7 dias. Os avisos vêm da coleta que falhou 3 vezes seguidas, fila vazia, problemas de configuração, Instagram, Reel, blog e cupons. **Nunca vão para o Telegram, o WhatsApp nem o blog.** Um aviso que não aparece por 3 horas vira resolvido sozinho.

- **Página do link da bio** (`bio.html`): as ofertas mais recentes primeiro (guarda até 60, mostra 12) e um **buscador** que filtra no aparelho, sem acento. O link do Instagram do blog vem de `BLOG_INSTAGRAM`.
- **Reel do dia:** vídeo vertical de uns 17 segundos montado com ffmpeg a partir das artes de Story, com trilha sintetizada pelo próprio robô (sem direitos de terceiros). Horas em `INSTAGRAM_HORARIOS_REELS`; 0 em `INSTAGRAM_REELS_POR_DIA` desliga.
- **WhatsApp:** o enviador (pasta `enviador/`) roda numa VM grátis da Oracle Cloud (Ubuntu, serviço `achadinhos-enviador`), instalada por `enviador/vm/instalar.sh`. Acompanhar: `journalctl -u achadinhos-enviador -f` na VM. O login do WhatsApp fica em `~/.achadinhos-enviador` na VM.
- **Acordar o robô:** o agendador do GitHub atrasa; o cron-job.org chama o workflow às 8h05 (token só com Actions: leitura e escrita neste repositório).
- **Página Amazon:** `amazon.json` lista produtos escolhidos à mão (sem preço, pelo contrato de Associados).

## Painel e WhatsApp

- **Painel:** depois de cada rodada o robô publica `painel.html` no seu site (ex.: `.../achadinhos/painel.html`). Mostra fila, posts, erros, ajustes e as mensagens de WhatsApp prontas para copiar. É só leitura; os botões levam ao GitHub (onde só você, logado, altera algo). Não tem senha nem segredo nele.
- **WhatsApp:** `WHATSAPP_ATIVO=1` (padrão) faz o robô guardar cada oferta postada no Telegram em `whatsapp.json`. Quem posta no WhatsApp é o programa da pasta `enviador/`, no seu PC (veja `enviador/LEIA-ME.txt`). Use `WHATSAPP_ATIVO=0` em `ajustes.env` para desligar.

## Conteúdo para Stories e Reels

Para cada oferta postada no Telegram o robô cria, no painel, a arte do Story (1080x1920, com a foto do produto), a legenda (com aviso de publi e hashtags) e o roteiro de 15 segundos. No painel você baixa o PNG e copia os textos. `SOCIAL_ATIVO=0` em `ajustes.env` desliga. A publicação automática no Instagram e no TikTok depende das APIs oficiais (conta profissional, app aprovado) e fica para uma próxima etapa.

## Instagram automático

Veja `INSTAGRAM.md`. Desligado por padrão (`INSTAGRAM_ATIVO=0`). Precisa de conta profissional e de dois Secrets (`INSTAGRAM_TOKEN`, `INSTAGRAM_USER_ID`).
