@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando pela primeira vez, aguarde...
  call npm install
)
node enviador.mjs listar
pause
