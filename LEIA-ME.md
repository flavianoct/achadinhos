# Achadinhos Bot

Robô que busca ofertas, filtra as boas, coloca o seu link de afiliado, posta sozinho num canal do Telegram e mantém um blog de "Top 3/5/10" escrito por IA.

Tudo é controlado por um **painel no navegador**. Não precisa instalar nenhuma biblioteca: o projeto usa só o que já vem no Node.

| Parte | Situação |
|---|---|
| Shopee | Pronta, pela API oficial de afiliados. |
| Mercado Livre | Pronta, mas precisa ser validada com a sua conta (passo 5). |
| Amazon | Fase 2. O link com a sua tag já está pronto; a coleta automática depende de uma API que a Amazon só libera para contas com vendas recentes. |
| Blog | Pronto. A IA (Ollama, grátis, no seu PC) escreve os posts; a publicação é pelo GitHub Pages, também grátis. |

## 1. Requisito

Node.js **22.18 ou mais novo** (recomendado: 24 LTS). Para conferir, abra o terminal e digite:

```
node -v
```

Se aparecer uma versão mais antiga, instale a atual em https://nodejs.org.

## 2. Ver funcionando sem nenhuma chave

Dê dois cliques em `testar.bat`.

Ele abre o painel no navegador com ofertas inventadas: a fila enche, os "posts" aparecem só na janela preta (nada é enviado) e um blog de demonstração é gerado. Use o botão **Ver o blog gerado**, na aba Blog.

## 3. Telegram

1. No Telegram, fale com **@BotFather**, envie `/newbot` e siga os passos. Guarde o **token**.
2. Crie o seu canal de ofertas.
3. No canal, adicione o bot como **administrador**, com permissão de postar mensagens.
4. Anote o endereço do canal (ex.: `@meusachadinhos`).

## 4. Shopee

1. Entre no painel de afiliados da Shopee e procure a área **Open API**.
2. Copie o **App ID** e o **Secret**. Se a opção não aparecer, a API ainda não foi liberada para a sua conta e é preciso solicitar no próprio painel.

## 5. Mercado Livre (ative depois que a Shopee estiver rodando)

O Mercado Livre não tem API oficial para gerar link de afiliado. O robô faz assim:

- **Dados dos produtos:** API oficial, com um app seu. Crie em https://developers.mercadolivre.com.br e copie o **Client ID** e o **Client Secret**.
- **Seu código de afiliado:** gere um link qualquer no painel de afiliados, abra esse link no navegador e olhe a URL final. Copie os valores de `matt_word` e `matt_tool`.

**Valide antes de confiar:** use o botão **Testar chaves**, clique no link de exemplo que ele mostra e confira no painel de afiliados se o clique foi contado. Se não contar, o formato do link precisa ser ajustado antes de ativar.

O robô pega os mais vendidos de cada categoria. Como essa listagem não traz "ofertas do dia", o Mercado Livre rende mais depois de alguns dias, quando o histórico de preços próprio começa a detectar quedas.

## 6. Rodar

1. Dê dois cliques em `iniciar.bat`. O painel abre em http://localhost:3210.
2. Na aba **Configurações**, preencha Telegram e Shopee e clique em **Salvar**.
3. Clique em **Testar chaves**. Ele confere cada chave sem postar nada.
4. Pronto: o robô começa a coletar e a postar sozinho.

O robô só funciona com o computador ligado e a janela preta aberta. O painel só responde neste computador.

### O que tem no painel

- **Resumo:** fila, posts de hoje, quando é a próxima coleta e o próximo post.
- **Botões:** pausar/retomar, coletar agora, postar a próxima agora, testar chaves.
- **Fila:** o que vai ser postado, em ordem. Dá para remover uma oferta.
- **Postados:** o histórico do canal.
- **Blog:** gerar na hora e ver o resultado.
- **Configurações:** todas as chaves e ajustes, sem editar arquivo.
- **Registro:** o que o robô fez e os erros.

## 7. Blog automático

O blog é um site estático montado a partir das ofertas que o robô já aprovou. Ele cria um post geral ("Top 10 ofertas de hoje") e um por categoria que tenha pelo menos 3 ofertas ("Top 5 ofertas de Tecnologia hoje"). Cada post é refeito sozinho a cada 6 horas, então os preços não ficam velhos.

Em **Configurações → Blog**:

1. Ligue **Gerar o blog automaticamente**.
2. Escolha **Quem escreve os posts → IA local e gratuita (Ollama)**.
3. Salve e clique em **Testar chaves**: ele diz se o Ollama está no ar e qual modelo vai usar.

### A IA que escreve os posts

- Usa o **Ollama**, que roda no seu computador e não tem custo. Ele precisa estar aberto e com um modelo baixado (ex.: `ollama pull llama3.1`). Veja os seus com `ollama list`.
- Para cada post, a IA escreve a **abertura**, **um parágrafo por produto** e o **fechamento** ("Como escolher").
- Ela recebe só o nome do produto, a categoria, a loja, a nota e as vendas. **Não recebe preços**: preço, desconto e histórico vêm direto dos dados, para não haver número inventado. Se o modelo citar preço ou percentual, o texto é descartado.
- Os textos ficam guardados: o de um produto vale 14 dias, e a abertura só é reescrita quando a lista de produtos do post muda. Assim a IA só trabalha no que é novo.
- Se o Ollama estiver fechado, o blog sai do mesmo jeito, com um texto padrão.

**Limite que você precisa conhecer:** a IA escreve a partir do nome do produto. Modelos pequenos às vezes afirmam coisas que não estão no anúncio. As regras do robô reduzem isso, mas não eliminam. Leia alguns posts nos primeiros dias; se o modelo inventar muito, troque por um modelo maior.

### Publicar de graça (GitHub Pages)

Precisa do Git instalado e de uma conta no GitHub.

1. Crie um repositório **público** no GitHub (ex.: `achadinhos`).
2. Gere o blog uma vez pelo painel. Isso cria a pasta `blog`.
3. Abra o terminal dentro da pasta `blog` e rode, trocando `SEUUSUARIO`:

```
git init -b main
git remote add origin https://github.com/SEUUSUARIO/achadinhos.git
git add -A
git commit -m "Primeira versão"
git push -u origin main
```

4. No GitHub: **Settings → Pages → Deploy from a branch → main / (root)**.
5. No painel, em **Configurações → Blog**: coloque o **Endereço público** (`https://SEUUSUARIO.github.io/achadinhos`) e escolha **Publicar → Enviar com Git**.

A partir daí, cada vez que o blog é refeito, o robô envia as mudanças sozinho.

Para o Google encontrar o blog, cadastre o endereço no Google Search Console e envie o `sitemap.xml`. O tráfego de busca costuma levar meses para aparecer.

## Como ele decide o que postar

1. Guarda o preço de **tudo** o que vê, todo dia, em `dados.db`. Esse é o histórico.
2. Aprova a oferta se o desconto anunciado for bom **ou** se o preço caiu contra o histórico.
3. Barra "promoção falsa": desconto anunciado, mas o produto esteve mais barato nos últimos 30 dias.
4. Não repete o mesmo produto no canal por 7 dias, a não ser que o preço caia mais 5%.
5. Posta primeiro as ofertas com mais pontos (desconto, queda real, comissão, nota, vendas, frete grátis).
6. Marca cada oferta com uma categoria (`#tech`, `#casa`...). O blog usa isso para os posts por categoria.

## Avisos

- Escreva na descrição do canal que os links são de afiliado. O blog já mostra esse aviso no rodapé, e também avisa quando o texto é de IA.
- Não compartilhe o arquivo `.env` nem o `dados.db`.
- Os testes automáticos (`npm test`) usam respostas simuladas das lojas e do Ollama. A primeira execução com as suas chaves reais é o teste de verdade: use o botão **Testar chaves**.

## Comandos (para quem prefere o terminal)

| Comando | O que faz |
|---|---|
| `npm start` | Robô + painel. |
| `npm run teste` | Demonstração com ofertas inventadas. |
| `npm run checar` | Testa as chaves e sai. |
| `npm run blog` | Gera o blog uma vez e sai. |
| `npm run uma-vez` | Uma coleta e um post, sem painel. |
| `npm test` | Testes automáticos. |
