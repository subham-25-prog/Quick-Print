@echo off
title QuickPrint Simulation Agent
cd /d "%~dp0"
cls
echo ===================================================
echo      QuickPrint Simulated Print Agent
echo ===================================================
echo.
echo No physical printer is required in simulation mode.
echo Test jobs are simulated without printing paper.
echo.
if not exist node_modules (
    echo [1/2] Installing required agent packages...
    call npm install
    if errorlevel 1 goto failed
)
echo [2/2] Compiling simulated agent...
call npm run build
if errorlevel 1 goto failed
set "AGENT_MODE=sandbox"
set "SIMULATE_PRINT=true"
echo Starting sandbox agent...
echo.
call npm start
goto end
:failed
echo Agent setup failed. Review the error above.
:end
pause
