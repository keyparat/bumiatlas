@echo off
title BumiAtlas Local Connector
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 atau lebih baru belum terpasang.
  echo Instal dari https://nodejs.org/ lalu jalankan file ini kembali.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Memasang komponen Local Connector...
  call npm install
  if errorlevel 1 (
    echo Instalasi dependency gagal.
    pause
    exit /b 1
  )
)
call npx playwright install chromium
if errorlevel 1 (
  echo Instalasi browser Chromium gagal.
  pause
  exit /b 1
)
call npm start
pause
