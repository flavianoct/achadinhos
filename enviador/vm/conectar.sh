#!/usr/bin/env bash
# Conferir e reconectar o WhatsApp do robô. Roda na VPS; o atalho "Conectar WhatsApp do robô" do PC chama este script por SSH.
# Se o WhatsApp está conectado e enviando, só avisa. Se caiu, reinicia o enviador e mostra o código de 8 letras para digitar no celular.
set -u
SERVICO=achadinhos-enviador
log_desde() { journalctl -u "$SERVICO" --since "$1" --no-pager -o cat 2>/dev/null; }

echo
echo "Conferindo o WhatsApp do robô..."
recente=$(log_desde "3 minutes ago")
if systemctl is-active --quiet "$SERVICO" && ! grep -qE "aguardando a conexão|desconectado|Escaneie|digite o código" <<<"$recente"; then
  echo
  echo "  ✅ O WhatsApp do robô está CONECTADO. Nada a fazer."
  ultima=$(log_desde "6 hours ago" | grep -E "aceito pelo WhatsApp" | tail -1 | grep -oE "^\[[0-9:]+\]")
  [ -n "$ultima" ] && echo "     Última mensagem enviada às ${ultima//[\[\]]/}."
  exit 0
fi

echo "O WhatsApp do robô está desconectado. Reiniciando o enviador..."
inicio=$(date '+%Y-%m-%d %H:%M:%S')
sudo systemctl restart "$SERVICO"

# Espera o código (ou a reconexão sozinha) por até 1 minuto.
codigo=""
for _ in $(seq 1 30); do
  sleep 2
  saida=$(log_desde "$inicio")
  if grep -q "WhatsApp conectado" <<<"$saida"; then
    echo
    echo "  ✅ Reconectou sozinho. Pronto!"
    exit 0
  fi
  codigo=$(grep -oE "digite o código [A-Z0-9]{4}-[A-Z0-9]{4}" <<<"$saida" | tail -1 | awk '{print $NF}')
  [ -n "$codigo" ] && break
done

if [ -z "$codigo" ]; then
  echo
  echo "  ⚠️  Não apareceu o código. Confira se o \"numero\" está no config.json do enviador."
  exit 1
fi

echo
echo "  ================================================"
echo "     SEU CÓDIGO:   $codigo"
echo "  ================================================"
echo
echo "  No celular do robô: WhatsApp -> Aparelhos conectados -> Conectar um aparelho"
echo "  -> \"Conectar com número de telefone\" -> digite o código acima."
echo
echo "  Esperando você digitar (até 3 minutos)..."
for _ in $(seq 1 90); do
  sleep 2
  if log_desde "$inicio" | grep -q "WhatsApp conectado"; then
    echo
    echo "  ✅ CONECTADO! Pode fechar esta janela."
    exit 0
  fi
done
echo
echo "  ⏱️  O código expirou. Clique no atalho de novo para pegar outro."
exit 1
