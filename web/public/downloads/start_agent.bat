@echo off
title QuickPrint Shop Windows Agent
cd /d "%~dp0"
cls
echo ===================================================
echo     QuickPrint Automatic Cloud Print Agent
echo ===================================================
echo.
:: A newly downloaded package contains the compiled agent, but not its npm
:: dependencies. Check both so first launch cannot skip the required setup.
if not exist .env (
    echo Initial setup is required. Launching the installer...
    call "%~dp0install_agent.cmd"
    if errorlevel 1 exit /b 1
)
if not exist node_modules\dotenv\package.json (
    echo Initial setup is required. Launching the installer...
    call "%~dp0install_agent.cmd"
    if errorlevel 1 exit /b 1
)
if not exist node_modules\pdf-to-printer\package.json (
    echo Initial setup is required. Launching the installer...
    call "%~dp0install_agent.cmd"
    if errorlevel 1 exit /b 1
)
if not exist dist\index.js (
    echo Initial setup is required. Launching the installer...
    call "%~dp0install_agent.cmd"
    if errorlevel 1 exit /b 1
)
echo.
echo [OK] Connecting to QuickPrint Cloud and Listening for Orders...
echo Keep this window open while the shop is open.
echo.
call npm start
pause
