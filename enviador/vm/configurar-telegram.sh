#!/usr/bin/env bash
# Liga os avisos do WhatsApp do robô no seu Telegram privado. Roda na VPS; o atalho "Configurar Telegram do robo" do PC chama este
# script por SSH e passa o token do bot pela entrada (ele não aparece no comando nem no histórico).
# Antes: no Telegram, abra o bot do robô e mande "oi" (é assim que o script descobre o seu chat).
set -u
CONFIG="$HOME/achadinhos/enviador/config.json"
read -r TOKEN
TOKEN=$(printf '%s' "$TOKEN" | tr -d '\r[:space:]')
if ! [[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]]; then
  echo "  ⚠️  Isso não parece um token de bot (formato 123456789:ABC...). Confira no @BotFather e tente de novo."
  exit 1
fi

resposta=$(curl -s -m 20 "https://api.telegram.org/bot${TOKEN}/getUpdates")
CHAT=$(python3 - "$resposta" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("ERRO"); sys.exit()
if not d.get("ok"):
    print("TOKEN"); sys.exit()
chats = [u["message"]["chat"]["id"] for u in d.get("result", []) if u.get("message", {}).get("chat", {}).get("type") == "private"]
print(chats[-1] if chats else "")
PY
)
case "$CHAT" in
  TOKEN) echo "  ⚠️  O Telegram recusou esse token. Confira no @BotFather (/mybots -> o bot -> API Token)."; exit 1 ;;
  ERRO) echo "  ⚠️  Não consegui falar com o Telegram. Tente de novo em instantes."; exit 1 ;;
  "") echo "  ⚠️  Não achei sua mensagem. No Telegram, abra o bot do robô, mande \"oi\" e rode de novo."; exit 1 ;;
esac

python3 - "$CONFIG" "$TOKEN" "$CHAT" <<'PY'
import json, sys
caminho, token, chat = sys.argv[1], sys.argv[2], sys.argv[3]
c = json.load(open(caminho))
c["telegram"] = {"token": token, "chat": chat}
json.dump(c, open(caminho, "w"), indent=2, ensure_ascii=False)
PY

curl -s -m 20 "https://api.telegram.org/bot${TOKEN}/sendMessage" -d chat_id="$CHAT" --data-urlencode "text=✅ Pronto! Se o WhatsApp do robô desconectar, o código para conectar de novo chega aqui." >/dev/null
sudo systemctl restart achadinhos-enviador
echo
echo "  ✅ Telegram configurado. Mandei uma mensagem de teste para você no Telegram."
