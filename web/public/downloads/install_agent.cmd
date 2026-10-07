@echo off
setlocal
cd /d "%~dp0"

:: A browser can download this package but cannot safely execute it itself.
:: This is the single, user-initiated setup step for a new Windows PC.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_agent.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo QuickPrint setup did not finish. Read the message above, then run this file again.
  pause
)
exit /b %EXIT_CODE%
