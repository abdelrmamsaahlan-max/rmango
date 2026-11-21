@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Build Rmango Windows Installer

echo.
echo  Rmango - Windows Installer Builder
echo  ---------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22 or newer is required.
  echo         Install it from https://nodejs.org/ and rerun this file.
  goto :fail
)

node -e "const v=process.versions.node.split('.').map(Number); if(v[0] < 22) process.exit(1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22 or newer is required. Current version:
  node --version
  goto :fail
)

if not exist node_modules (
  echo [INFO] Installing project dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)

echo [INFO] Building the Windows NSIS setup executable...
call npm run dist:win
if errorlevel 1 goto :fail

set "FOUND_INSTALLER="
for %%F in ("release\Rmango-Setup-*.exe") do if exist "%%~fF" set "FOUND_INSTALLER=%%~fF"
if not defined FOUND_INSTALLER (
  echo [ERROR] Build completed but no Rmango Setup EXE was found in release\.
  goto :fail
)

echo.
echo [SUCCESS] Rmango installer created:
echo %FOUND_INSTALLER%
echo.
echo This is a Windows setup EXE, not a source ZIP.
pause
exit /b 0

:fail
echo.
echo [FAILED] Rmango installer could not be built.
echo Check the error above. On GitHub, use the Windows Installer workflow to build it on a Windows runner.
pause
exit /b 1
