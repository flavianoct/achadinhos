# Resumo da sessão de 07 e 08/10/2026

Para quem for continuar o trabalho (por exemplo, o Claude Code no desktop). Tudo o que está aqui já foi juntado na `main`. Os testes (`npm test`) passam: 153.

## Como o projeto funciona

- **Stack:** Node 22+/TypeScript sem build (`node src/index.ts`), SQLite (`node:sqlite`), sem framework web. Mais detalhes no `LEIA-ME.md`.
- **Robô na nuvem:** o GitHub Actions (`.github/workflows/robo.yml`) roda a cada 30 minutos (`--nuvem`). Coleta ofertas da Shopee e do Mercado Livre, filtra, posta no Telegram, gera o blog (GitHub Pages) e deixa mensagens prontas para o WhatsApp. O banco fica no ramo `dados`.
- **Ajustes:** `ajustes.env` na `main` (público, sem chaves). As chaves ficam nos Secrets do GitHub.
- **WhatsApp:** o enviador (`enviador/`) roda numa VM da Oracle Cloud, lê `whatsapp.json` do site e posta nos grupos e canais.
- **Painéis:** `painel.html` (só leitura, publicado no site, gerado em `src/exportar.ts`) e `configurar.html` (seletores, `src/configurar.html`). Existe também o painel local do PC (`src/painel.ts`, `src/painel.html`).

## O que foi feito

### 1. Cupons (Mercado Livre e Shopee)
- `cupons.json` (mantido pelo dono): loja, código opcional, título, detalhe, link, validade. O link precisa ser do site da loja (`meli.la`, `shp.ee` etc.). `src/cupons.ts`.
- Posta só cupom vigente, até `CUPONS_POR_DIA`, repetindo a cada `CUPONS_REPETIR_DIAS`. Erros do arquivo viram aviso no resumo da rodada.
- **Não existe busca automática de cupom.** Nem a API de afiliados da Shopee nem a do Mercado Livre expõem cupons (confirmado pela introspecção da Shopee, ver "Descobertas").

### 2. Nichos (categorização e canais)
- **Classificador** (`src/categoria.ts`): cada nicho soma pontos pelas palavras do título (palavra nas 4 primeiras vale o dobro); vence quem tem mais pontos, no empate a ordem da lista. Nichos: `tech`, `games`, `moda`, `casa`, `esporte`, `beleza`, `bebe`, `pet`, `ferramentas`, `geral`. É só regra, sem IA.
- **Palavras editáveis:** `NICHO_PALAVRAS_<NICHO>=palavra,-palavra` (o `-` tira a palavra do nicho).
- **Canal do Telegram por nicho:** `ROTAS_TELEGRAM=tech=@canal,moda=@canal` (`src/rotas.ts`). Sem rota, vai para o canal geral (`TELEGRAM_CHAT_ID`). Se o canal de um nicho recusar o post, a oferta cai no geral com aviso.
- **Filtro do canal geral:** `GERAL_NICHOS` (só estes) e `GERAL_SEM_NICHOS` (nunca estes). Oferta sem destino sai da fila e a próxima é tentada.
- **Limites por dia:** `NICHO_MAX_POR_DIA` e `NICHO_LIMITES=moda=8,tech=15`. O que passar do teto fica na fila.
- **WhatsApp por nicho:** `WHATSAPP_ROTAS=nicho=link`. Os destinos de `WHATSAPP_DESTINOS` são gerais e seguem o filtro do geral. O `whatsapp.json` leva os `nichos` de cada destino e a `categoria` de cada mensagem, e o enviador escolhe os alvos por isso (`destinoAceita` em `enviador/logica.mjs`).
- **Banco:** `postados.canal`, `whatsapp_saida.categoria` (colunas migradas sem perder dados), tabelas `vendas`, `campanhas_postadas`, `cupons_postados`.

### 3. Painéis
- `painel.html`: seção "Ofertas por nicho" (nicho que mais disparou, maior fila, nicho que mais rendeu, rosca dos 7 dias, tabela com posts, fila, aprovadas, vendas, comissão e canal) e filtro por nicho nos últimos posts. Cabe no celular.
- `configurar.html`: seletores para lojas, filtro, horário, tabela de nichos (canal Telegram, "no geral", WhatsApp do nicho, limite, palavras), WhatsApp geral e editor de cupons. Lê `ajustes.env` e `cupons.json` pela API do GitHub, valida, mostra as mudanças e **copia o arquivo novo e abre o editor do GitHub** (não salva sozinho: o site é estático e público, sem token).
- Painel local: todos os ajustes foram incluídos em `CAMPOS`.
- **Cliques não aparecem.** O link de afiliado vai direto para a loja. Só a Shopee tem relatório de vendas por API.

### 4. Shopee: vendas e campanhas (`src/shopee-extra.ts`)
- **Vendas/comissão** (`conversionReport`): lidas a cada `VENDAS_HORAS` e gravadas por nicho. A rodada real leu 0 itens em 30 dias (ainda sem vendas, ou não aparecem nesse relatório).
- **Campanhas** (`shopeeOfferV2`): **desligadas** (`CAMPANHAS_POR_DIA=0`). A listagem real mostrou que a API devolve 30 páginas de categoria em inglês ("- - Health", `offerType: 2`), e não campanhas. O código ignora essas páginas. Uma delas já foi postada no canal por engano (mensagem "CAMPANHA SHOPEE - - Health") e **vale apagar na mão**.
- As consultas montam os campos pela introspecção da API, para um nome de campo errado não derrubar a rodada.
- Workflow manual **"Descobrir API da Shopee"** (`--shopee-schema`): lista consultas, ações e campanhas.

### 5. WhatsApp
- **Grupos recebem a foto do produto** (a mesma do Telegram), em vez da arte do Instagram. A foto do Mercado Livre é pedida em JPEG (troca `.webp` por `.jpg`). Se a foto não baixar, vai o texto com prévia (a arte só entra com `"imagemDoGrupo": "arte"`). Canais seguem só com texto e prévia (o WhatsApp rejeita imagem em canal).
- **Atualização automática do enviador:** como serviço do systemd, uma vez por hora confere a `main` (`git reset --keep FETCH_HEAD`, funciona no clone raso), reinstala dependências se o `package.json` mudou e encerra; o systemd religa. `"atualizarSozinho": false` desliga. Só vale depois de a versão nova entrar na VPS uma vez.

### 6. Manutenção
- `checkout` e `setup-node` na v5 e `deploy-pages` na v5 (Node 24). `configure-pages@v5`, `upload-pages-artifact@v3` e `upload-artifact@v4` ainda avisam sobre Node 20 e **não foram atualizados**, porque não confirmei versões novas.

## Descobertas importantes
- A API da Shopee tem 8 consultas e 2 ações (produtos, lojas, `shopeeOfferV2`, relatórios de conversão, feeds, links curtos). **Nenhuma de cupom ou voucher.**
- O Mercado Livre não tem API de cupom para afiliados. Os cupons de vendedor da documentação são para quem vende.
- O ambiente da nuvem onde esta sessão rodou **bloqueia** o Mercado Livre e o site publicado (`github.io`). Não deu para testar nada contra eles de lá.
- Avisos que apareceram na rodada real e **não foram investigados**: `Instagram recusou (400/24): The requested resource does not exist`, "15 imagens ainda não estão no ar" e `[ml-api] ... falhas dos complementos: x68`.

## A VM da Oracle (o que falta, e é o foco de amanhã)
- Instância `enviador-whatsapp`, IP **147.15.38.204**, usuário `ubuntu`, Ubuntu 24.04, `VM.Standard.E2.1.Micro` (1 GB), região São Paulo. Projeto em `~/achadinhos`, serviço `achadinhos-enviador`, login do WhatsApp em `~/.achadinhos-enviador`.
- **O SSH não funciona.** O arquivo `ssh-key-2026-10-06.key` enviado ao Cloud Shell está corrompido (1679 bytes ilegíveis, "invalid format"). A Oracle Cloud Agent está **Enabled** e o **Run command** da Oracle serve como alternativa sem chave.
- Há dois comandos presos em "Accepted" no Run command: `agent-command-20261007-2226` e `atualizar-enviador`. O primeiro provavelmente bloqueia o segundo.
- A VM travou durante a tentativa (falta de memória, provável). Foi reiniciada e voltou a **Running**.
- **O WhatsApp parou de postar por volta das 22h.** A hipótese mais forte é o horário: o enviador só envia das 8h às 22h (`horaFim` no `config.json`). Não foi confirmado pelo log. Deve voltar às 8h.
- **Pendente:** atualizar o enviador na VPS (foto do produto, nichos, atualização automática), conferir o log, testar com `node enviador.mjs testar` (serviço parado), confirmar que o serviço está com `systemctl enable`, e talvez trazer `horaFim`, `maximoPorHora` e `horaInicio` para o `ajustes.env`.
- Comando de atualização (usar quando houver acesso): `cd ~/achadinhos && git pull --ff-only && cd enviador && npm install --omit=dev --no-audit --no-fund && sudo systemctl restart achadinhos-enviador`.

## Pontos de atenção
- Nunca pedir nem colar a chave SSH ou os Secrets. Para diagnosticar a chave, mostrar só a primeira linha (`head -1`).
- Não clicar em **Terminate** na instância: apagaria a VM e o login do WhatsApp.
- O dono ainda **não preencheu** `ROTAS_TELEGRAM`, `WHATSAPP_ROTAS` nem `cupons.json`. Tudo isso está pronto e vazio. Os canais por nicho já existem, mas o dono vai conectá-los aos poucos pela página Configurar.
- O enviador roda o código que está na VPS: mudanças no GitHub só valem lá depois da atualização.
- Os testes do enviador e do robô ficam em `test/` (`npm test`). O teste do conversor de imagens precisa do `@resvg/resvg-js` (`npm install --omit=dev`).
