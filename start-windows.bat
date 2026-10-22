@echo off
cd /d "%~dp0"
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo Node.js 20+ is needed. Please install from https://nodejs.org/
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
