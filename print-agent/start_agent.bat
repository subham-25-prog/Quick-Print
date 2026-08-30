@echo off
title QuickPrint Shop Windows Agent
cd /d "%~dp0"
cls
echo ===================================================
echo     QuickPrint Automatic Cloud Print Agent
echo ===================================================
echo.
if not exist node_modules (
    echo [1/2] Installing required agent packages...
    call npm install
)
echo [2/2] Compiling agent...
call npm run build
echo.
echo [OK] Connecting to QuickPrint Cloud & Listening for Orders...
echo Keep this window open while the shop is open.
echo.
call npm start
pause
