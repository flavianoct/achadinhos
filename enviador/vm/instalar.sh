#!/usr/bin/env bash
# Instala o enviador de WhatsApp numa VM Ubuntu (ex.: Oracle Cloud grátis).
# Uso (já conectado por SSH na VM):  bash instalar.sh
set -euo pipefail

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo ">> Instalando o Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs git
fi

DESTINO="$HOME/achadinhos"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" pull --ff-only
else
  git clone --depth=1 https://github.com/flavianoct/achadinhos.git "$DESTINO"
fi

cd "$DESTINO/enviador"
echo ">> Instalando as dependências..."
npm install --omit=dev --no-audit --no-fund

# Serviço que mantém o enviador ligado e o reinicia se cair ou se a VM reiniciar.
sudo tee /etc/systemd/system/achadinhos-enviador.service >/dev/null <<EOF
[Unit]
Description=Enviador de WhatsApp dos Achadinhos
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DESTINO/enviador
ExecStart=$(command -v node) enviador.mjs
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload

cat <<'MSG'

Pronto. Próximos passos (nesta ordem):
  1. cd ~/achadinhos/enviador && node enviador.mjs listar
     -> aparece um QR code. No WhatsApp: Configurações > Aparelhos conectados > Conectar um aparelho.
  2. Edite o config.json (nano config.json) e ponha o link do canal em "destinos".
  3. sudo systemctl enable --now achadinhos-enviador
  4. Para acompanhar: journalctl -u achadinhos-enviador -f
MSG
