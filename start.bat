@echo off
REM ===========================================================================
REM  Alien Platformer - one-click launcher
REM  Double-click this file to install dependencies (first run only) and start
REM  the game. A browser tab opens automatically at http://localhost:5173/
REM ===========================================================================

REM Run from this script's own folder, wherever it's launched from.
cd /d "%~dp0"

REM Install dependencies the first time (when node_modules is missing).
if not exist "node_modules\" (
  echo Installing dependencies ^(first run, this may take a minute^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Make sure Node.js is installed: https://nodejs.org
    pause
    exit /b 1
  )
)

echo.
echo Starting the game... a browser tab will open at http://localhost:5173/
echo Press Ctrl+C in this window to stop the server.
echo.
call npm run dev

REM Keep the window open if the server exits unexpectedly.
pause
