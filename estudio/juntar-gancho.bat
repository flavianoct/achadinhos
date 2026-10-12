@echo off
chcp 65001 >nul
rem Cola um clipe de IA (feito no Wan2GP) no INICIO do video do quiz.
rem Uso: juntar-gancho.bat gancho.mp4 quiz.mp4 [saida.mp4]
rem Precisa do ffmpeg e do ffprobe instalados (https://ffmpeg.org). O clipe vira vertical 1080x1920; o som do quiz continua.
if "%~2"=="" (
  echo Uso: juntar-gancho.bat gancho.mp4 quiz.mp4 [saida.mp4]
  pause
  exit /b 1
)
set SAIDA=%~3
if "%SAIDA%"=="" set SAIDA=quiz-com-gancho.mp4
for /f %%d in ('ffprobe -v error -show_entries format^=duration -of csv^=p^=0 "%~1"') do set DURACAO=%%d
ffmpeg -y -loglevel error -i "%~1" -i "%~2" -f lavfi -t %DURACAO% -i anullsrc=r=44100:cl=stereo ^
  -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p[g];[1:v]scale=1080:1920,fps=30,setsar=1,format=yuv420p[q];[1:a]aresample=44100[aq];[2:a]aresample=44100[ag];[g][ag][q][aq]concat=n=2:v=1:a=1[v][a]" ^
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k -movflags +faststart "%SAIDA%"
if errorlevel 1 (
  echo Deu erro no ffmpeg.
  pause
  exit /b 1
)
echo Pronto: %SAIDA%
pause
