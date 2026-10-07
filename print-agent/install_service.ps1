[CmdletBinding()]
param(
  [switch]$Launch
)

# Install exactly one CURRENT-USER startup entry. This is deliberately not a
# Windows service, because the signed-in shop user owns the printer mappings.
$ErrorActionPreference = 'Stop'
$agentDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$entryFile = Join-Path $agentDirectory 'dist\index.js'
if (-not (Test-Path -LiteralPath $entryFile)) { throw 'Run npm ci and npm run build in print-agent first.' }
if (-not (Test-Path -LiteralPath (Join-Path $agentDirectory '.env'))) { throw 'Configure print-agent/.env first.' }
$existingTask = Get-ScheduledTask -TaskName 'QuickPrint-PrintAgent' -ErrorAction SilentlyContinue
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'QuickPrint-Agent.lnk'
if ($existingTask) { throw 'An old QuickPrint scheduled task exists. Stop and remove it explicitly before installing this version.' }
# Interactive logon preserves the shop user printer mappings. A hidden shortcut
# avoids a SYSTEM service, which cannot access the user's network printers.
$launcherPath = Join-Path $agentDirectory 'start_background.vbs'
$escapedDirectory = $agentDirectory.Replace('"','""')
$escapedNode = $nodeExecutable.Replace('"','""')
$escapedEntry = $entryFile.Replace('"','""')
$launcher = @"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$escapedDirectory"
shell.Run Chr(34) & "$escapedNode" & Chr(34) & " " & Chr(34) & "$escapedEntry" & Chr(34), 0, False
"@
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding Unicode
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $launcherPath + '"'
$shortcut.WorkingDirectory = $agentDirectory
$shortcut.WindowStyle = 7
$shortcut.Save()
if ($Launch) {
  Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + $launcherPath + '"') -WindowStyle Hidden
}
Write-Host 'Installed or updated the hidden current-user startup shortcut.'
if ($Launch) { Write-Host 'The QuickPrint agent has been launched.' }
Write-Host 'The agent journal and process lock must be kept. Use npm start for a visible diagnostic run.'
