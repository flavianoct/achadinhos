# Vídeos do Mata Preço com Remotion

Monta o Reel e o TikTok de um produto a partir de um vídeo (por exemplo, gerado no Flow do Google): logo, gancho, legendas,
fecho "o preço está no grupo" e aviso de publi. O preço nunca aparece no vídeo (regra da marca).

## Rotina: um produto, um comando

1. Crie a pasta do produto copiando o modelo:
   `produtos/_modelo` → `produtos/chaleira` (o nome só pode ter letras minúsculas, números e hífen).
2. Coloque o vídeo em `produtos/chaleira/video.mp4` (de 3 a 30 s; o Flow entrega 8 s).
   Pode ser vertical (preenche a tela) ou horizontal 16:9 (o comando detecta sozinho: o vídeo fica no centro, ampliado,
   sobre o próprio vídeo desfocado, com o gancho em cima e as legendas embaixo).
3. Edite `produtos/chaleira/produto.json`:
   - `produto`: nome curto em maiúsculas, usado no gancho do Reel ("ESSA CHALEIRA VALE A PENA?").
   - `produtoCompleto`: nome que aparece no fecho do Reel.
   - `legendas`: textos do Reel; dividem o tempo entre o fim do gancho e o fim do vídeo.
   - `gancho`: frase de abertura do TikTok.
   - `passos`: palavras numeradas do TikTok, uma por vez, na ordem do vídeo.
4. Rode:

```bash
cd remotion
npm install                 # só na primeira vez
npm run gerar -- chaleira   # gera out/chaleira-reel.mp4 e out/chaleira-tiktok.mp4
```

Sem nome (`npm run gerar`), ele lista os produtos disponíveis. A duração do vídeo é medida sozinha.

## As duas edições

- **Reel:** o vídeo inteiro com zoom lento, pergunta de abertura, legendas em pílula amarela e o fecho com a faixa do grupo.
- **TikTok:** abre pelo melhor momento (o fim do vídeo), volta ao começo 1,2x mais rápido com legenda de passos numerados e fecho curto.
  Os textos ficam fora das zonas cobertas pela interface do TikTok (rodapé e lado direito).

## Para publicar no Instagram pelo site

Na etapa "Cortar", escolha **9:16**. O formato padrão é quadrado e corta o topo e o rodapé do vídeo.
Se o vídeo for gerado por IA, ligue "Adicionar rótulo de IA" (no TikTok, o equivalente).

## Outros comandos

```bash
npm run estudio   # editor visual: ver e ajustar as composições ao vivo
npm run reel      # renderiza só o Reel com os valores de exemplo (src/Root.tsx)
npm run tiktok    # renderiza só o TikTok com os valores de exemplo
```

Licença do Remotion: grátis para pessoa física e empresa com até 3 pessoas.
