@echo off
title QuickPrint Simulation Agent
cd /d "%~dp0"
cls
echo ===================================================
echo      QuickPrint Simulated Print Agent
echo ===================================================
echo.
echo No physical printer is required in simulation mode.
echo Jobs are downloaded, processed, and marked printed without paper.
echo.
if not exist node_modules (
    echo [1/2] Installing required agent packages...
    call npm install
)
echo [2/2] Starting simulated agent...
echo.
call npm run test-print
pause
