@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning src/index.ts --abrir
echo.
pause
