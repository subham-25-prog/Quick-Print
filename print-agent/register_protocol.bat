@echo off
title QuickPrint Browser Protocol Setup
cd /d "%~dp0"
cls
echo ==========================================================
echo       QuickPrint 1-Click Browser Launcher Setup
echo ==========================================================
echo.
echo This registers the "quickprint://" protocol on this PC so
echo you can launch the Print Agent directly by clicking 
echo "Start Agent" on the QuickPrint website.
echo.

set "BAT_PATH=%~dp0start_agent.bat"

reg add "HKCU\Software\Classes\quickprint" /ve /t REG_SZ /d "URL:QuickPrint Protocol" /f >nul 2>&1
reg add "HKCU\Software\Classes\quickprint" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKCU\Software\Classes\quickprint\shell\open\command" /ve /t REG_SZ /d "cmd.exe /c start \"\" \"%BAT_PATH%\"" /f >nul 2>&1

if %errorlevel% equ 0 (
    echo [SUCCESS] Browser integration registered successfully!
    echo.
    echo Now when you click "Start Print Agent" on the website,
    echo your browser will automatically launch the agent!
) else (
    echo [ERROR] Failed to register protocol.
)
echo.
pause
