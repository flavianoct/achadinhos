# Pinterest: pins que levam gente para o grupo e os canais

O robô cria até **5 pins por dia** (`PINTEREST_PINS_POR_DIA`), em imagem vertical 2:3 (1000x1500), cada um com uma estratégia:

| Pin | O que mostra | Para que serve |
|---|---|---|
| **produto** | Foto do produto + "CAIU MESMO?" + selo "MENOR PREÇO EM 30 DIAS" (só quando o robô provou) | Parar o dedo de quem busca o produto |
| **lista** | "3 achados de hoje" com 3 fotos | Mostra variedade |
| **beneficio** | "Ofertas sem mostrar seu número" e a lista de vantagens do canal | Vende o canal para quem não curte grupo |
| **dica** | "5 coisas antes de comprar [produto]" (texto fixo dos guias) | Conteúdo que o Pinterest guarda e mostra por meses |
| **quiz** | Foto + "Você acerta o preço?" com A, B, C | Curiosidade |
| **sombra** | Silhueta do produto + "Que produto é esse?" | Curiosidade |

Todos terminam com o botão amarelo **"ENTRE NO CANAL GRÁTIS"** + "WhatsApp e Telegram · sem mostrar seu número", e **nenhum mostra preço**.
O link de cada pin abre a página `…/bio.html` (botões dos canais e as ofertas de hoje), com `utm_source=pinterest` para você ver de onde vem a visita.

## O que o robô gera sozinho (funciona sem configurar nada)

Depois de cada rodada, no site:

- **`/pinterest.html`**: galeria com cada pin, o texto pronto para copiar e o botão **"Salvar no Pinterest"** (abre o Pinterest com imagem, título, descrição e link já preenchidos: um toque por pin).
- **`/pinterest/pins.csv`**: planilha para **"Criar Pins em massa"** no Pinterest (as imagens são buscadas no endereço do site). Se o Pinterest reclamar das colunas, baixe o modelo oficial dele e copie as colunas.
- **`/pinterest/feed.xml`**: feed RSS dos pins, para publicar automaticamente (veja abaixo).
- As imagens em `/pinterest/*.png`. Ficam as dos últimos 7 dias.

## Passo a passo

1. Crie (ou converta) a conta para **Conta empresarial** no Pinterest e crie um quadro, por exemplo "Achadinhos e ofertas do dia". Coloque o mesmo nome em `PINTEREST_QUADRO`.
2. **Reivindique o site** (Configurações → Reivindicar → Site). Escolha a opção da **meta tag** e copie só o valor do `content="..."`. Cole em `PINTEREST_VERIFICACAO` no `ajustes.env`; na rodada seguinte a tag estará nas páginas, e aí você clica em "Verificar".
3. Escolha como publicar:
   - **Manual (1 minuto por dia):** abra `/pinterest.html` no celular e toque em "Salvar no Pinterest" nos pins do dia.
   - **Em massa:** baixe `pins.csv` e envie em "Criar Pins" → "Criar em massa" (dá para enviar a semana toda de uma vez).
   - **Automático por RSS:** com o site reivindicado, em Configurações → Publicação automática, informe `…/pinterest/feed.xml` e o quadro. O Pinterest publica os pins novos sozinho.
   - **Pela API (opcional):** veja a seção abaixo.

## Publicar pela API (opcional)

1. Em [developers.pinterest.com](https://developers.pinterest.com) crie um app e peça acesso. Um app novo começa em **acesso de teste (Trial)**: ele funciona, mas os pins criados por ele, na prática, só aparecem para o dono da conta. Para os pins ficarem públicos é preciso o acesso **Standard**, que o Pinterest aprova depois de ver um vídeo seu mostrando o login e a criação de um pin.
2. Gere o token com os acessos `boards:read` e `pins:write` e salve no GitHub como Secret **`PINTEREST_TOKEN`**. O token vale **30 dias**; quando vencer, o painel mostra "Pinterest recusou (401)" e você gera outro.
3. Coloque o número do quadro em `PINTEREST_BOARD_ID` (`ajustes.env`). Enquanto o app estiver em teste, use também `PINTEREST_SANDBOX=1`.
4. O robô publica **1 pin por rodada**, até `PINTEREST_PINS_POR_DIA` por dia, só depois que a imagem já está no ar.

Eu não consegui testar contra o Pinterest de verdade daqui (o ambiente não alcança o site de desenvolvedores): a publicação pela API foi testada com um Pinterest simulado. Se a primeira publicação falhar, o texto do erro aparece no painel.

## Dicas para render

- Pins novos todo dia valem mais do que muitos de uma vez: de 3 a 5 por dia.
- O título e a descrição já levam palavras de busca ("ofertas", "achadinhos", o nome do produto), porque no Pinterest as pessoas **buscam**.
- Salve também o pin de **dica** em quadros temáticos ("Casa e cozinha", "Tecnologia"): é o que mais continua rendendo com o tempo.
