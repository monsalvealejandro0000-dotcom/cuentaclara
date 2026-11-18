@echo off
rem Doble clic para abrir CuentaClara: arranca el servidor (si no esta en marcha) y abre el navegador.
rem Deja abierta esta ventana mientras uses la app: al cerrarla, la app se apaga.
cd /d "%~dp0"
title CuentaClara
where node >nul 2>nul
if errorlevel 1 (
  echo Para usar CuentaClara necesitas instalar Node.js 22.13 o superior: https://nodejs.org
  pause
  exit /b 1
)
node scripts\abrir.js %*
if errorlevel 1 pause
