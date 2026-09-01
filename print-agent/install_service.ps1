# ==============================================================================
# QuickPrint - Windows Auto-Start Service & Startup Installer
# ==============================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   ⚡ QuickPrint Print Agent Windows Auto-Start Setup ⚡    " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Get-Location }

Write-Host "Setting up automatic background startup for QuickPrint Print Agent..." -ForegroundColor Gray
Write-Host "Agent Directory: $scriptDir`n"

# 1. Option A: Windows Startup Folder Shortcut (User level auto-start)
$startupFolder = [Environment]::GetFolderPath("Startup")
$vbsPath = Join-Path $scriptDir "start_background.vbs"

$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$scriptDir"
WshShell.Run "cmd /c npm start", 0, False
"@

Set-Content -Path $vbsPath -Value $vbsContent -Encoding UTF8

$shortcutPath = Join-Path $startupFolder "QuickPrint-Agent.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$vbsPath`""
$Shortcut.WorkingDirectory = $scriptDir
$Shortcut.WindowStyle = 7
$Shortcut.Description = "QuickPrint Local Windows Print Agent Auto-Start"
$Shortcut.Save()

Write-Host "  ✅ Registered Windows Startup Shortcut: $shortcutPath" -ForegroundColor Green
Write-Host "  ✅ Created silent background launcher: $vbsPath" -ForegroundColor Green

# 2. Option B: Register Windows Task Scheduler Task (Runs at system boot)
try {
    $taskName = "QuickPrint-PrintAgent"
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $scriptDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 8760)

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User $env:USERNAME -Force -ErrorAction SilentlyContinue
    Write-Host "  ✅ Registered Task Scheduler Task '$taskName' (Runs at User Logon)" -ForegroundColor Green
} catch {
    Write-Host "  ℹ️  Task Scheduler notice: Standard startup shortcut configured." -ForegroundColor Gray
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  🎉 Print Agent is configured to auto-start on Windows reboot! " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  • Test Start Agent Now:   npm start"
Write-Host "  • Local Health Dashboard: http://localhost:9191`n"
