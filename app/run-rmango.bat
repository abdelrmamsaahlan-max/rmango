@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 or newer, then run this file again.
  echo https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing Rmango dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
call npm run dev
if errorlevel 1 pause
