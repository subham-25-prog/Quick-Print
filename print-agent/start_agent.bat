@echo off
title QuickPrint Shop Windows Agent
cd /d "%~dp0"
cls
echo ===================================================
echo     QuickPrint Automatic Cloud Print Agent
echo ===================================================
echo.
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
