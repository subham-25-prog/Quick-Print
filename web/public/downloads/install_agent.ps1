[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$agentDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
Set-Location -LiteralPath $agentDirectory

function Fail-Setup([string]$message) {
  Write-Host "QuickPrint setup could not finish: $message" -ForegroundColor Red
  exit 1
}

function Wait-ForAgentConnection([string]$expectedAgentId) {
  # The background launcher returns as soon as Windows starts it. Confirm the
  # process both started and authenticated with the shop before claiming setup
  # succeeded.
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9191/' -TimeoutSec 2
      if ($health.agentId -eq $expectedAgentId -and $health.status -eq 'ONLINE') {
        return
      }
    } catch {
      # The agent has not opened its local health endpoint yet.
    }
    Start-Sleep -Seconds 2
  }

  Fail-Setup 'The agent did not connect to QuickPrint. Confirm this PC is online, then download a fresh setup package so its shop credentials are current.'
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $agentDirectory '.env'))) {
    Fail-Setup 'The configured .env file is missing. Download a fresh package from QuickPrint Printing settings.'
  }

  $node = Get-Command node -ErrorAction Stop
  $nodeVersion = (& $node.Source --version).Trim()
  if ($nodeVersion -notmatch '^v24\.') {
    Fail-Setup "Node.js 24 LTS is required (found $nodeVersion). Install Node.js 24 LTS, then run Install QuickPrint Agent.cmd again."
  }

  Write-Host 'Installing the QuickPrint agent...' -ForegroundColor Cyan
  $npm = Get-Command npm -ErrorAction Stop

  & $npm.Source ci
  if ($LASTEXITCODE -ne 0) { Fail-Setup 'Package installation failed. Check that this PC is online and try again.' }

  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) { Fail-Setup 'The agent could not be built.' }

  & (Join-Path $agentDirectory 'register_protocol.bat') /quiet
  if ($LASTEXITCODE -ne 0) { Fail-Setup 'Browser launch registration failed.' }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $agentDirectory 'install_service.ps1') -Launch
  if ($LASTEXITCODE -ne 0) { Fail-Setup 'Automatic startup installation failed.' }

  $agentIdLine = Get-Content -LiteralPath (Join-Path $agentDirectory '.env') |
    Where-Object { $_ -match '^AGENT_ID=' } |
    Select-Object -First 1
  $expectedAgentId = ($agentIdLine -replace '^AGENT_ID="?([^"\r\n]*)"?$', '$1').Trim()
  if (-not $expectedAgentId) { Fail-Setup 'The configured agent ID is missing from .env.' }
  Wait-ForAgentConnection $expectedAgentId

  Write-Host ''
  Write-Host 'QuickPrint is ready. Connected Windows printers will appear in the Printing settings shortly.' -ForegroundColor Green
  exit 0
} catch {
  Fail-Setup $_.Exception.Message
}
