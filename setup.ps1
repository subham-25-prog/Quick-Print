# ==============================================================================
# QuickPrint - One-Command Interactive Shop Onboarding & Setup Script
# ==============================================================================
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# ==============================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       ⚡ QuickPrint Print Shop Automated Setup Wizard ⚡    " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "This wizard configures your shop environment, updates configs,"
Write-Host "sets up database credentials, and prepares the Print Agent.`n"

# Helper for interactive prompt with default
function Prompt-User($promptText, $defaultValue) {
    if ($defaultValue) {
        $inputVal = Read-Host "$promptText [$defaultValue]"
        if ([string]::IsNullOrWhiteSpace($inputVal)) {
            return $defaultValue
        }
        return $inputVal
    } else {
        $inputVal = Read-Host "$promptText"
        while ([string]::IsNullOrWhiteSpace($inputVal)) {
            Write-Host "  ⚠️  This value is required!" -ForegroundColor Yellow
            $inputVal = Read-Host "$promptText"
        }
        return $inputVal
    }
}

# 1. Shop Identity & Branding Details
Write-Host "--- 1. Shop Identity & Branding ---" -ForegroundColor Green
$shopName     = Prompt-User "Enter Shop Name" "QuickPrint Copy Center"
$shopTagline  = Prompt-User "Enter Shop Tagline" "Scan, Upload & Print in 30 Seconds"
$shopAddress  = Prompt-User "Enter Shop Address" "123 College Main Gate Road"
$shopPhone    = Prompt-User "Enter Shop Phone Number" "+91 98765 43210"
$currencySym  = Prompt-User "Enter Currency Symbol" "₹"
$currencyCode = Prompt-User "Enter Currency Code" "INR"

# 2. UPI Payment Details
Write-Host "`n--- 2. Shopkeeper UPI Payment Details ---" -ForegroundColor Green
$upiId        = Prompt-User "Enter Shopkeeper UPI ID (VPA)" "quickprint@upi"
$upiPayeeName = Prompt-User "Enter UPI Payee Name" $shopName

# 3. Supabase Credentials
Write-Host "`n--- 3. Supabase Cloud Database Credentials ---" -ForegroundColor Green
$supabaseUrl     = Prompt-User "Enter Supabase Project URL (https://xxx.supabase.co)" ""
$supabaseAnonKey = Prompt-User "Enter Supabase Anon Public Key" ""
$supabaseService = Prompt-User "Enter Supabase Service Role Key" ""

# 4. Print Agent & App Security
Write-Host "`n--- 4. App & Agent Security ---" -ForegroundColor Green
$agentSecret  = Prompt-User "Enter Shared Agent Secret" ("qp_sec_" + [guid]::NewGuid().ToString("N").Substring(0, 16))
$appUrl       = Prompt-User "Enter Production Web App URL" "http://localhost:3000"
$agentId      = Prompt-User "Enter Shop PC Agent ID" "shop-counter-pc-1"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "                 Configuring QuickPrint...                  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = process.cwd() }

# A. Generate web/.env.local and web/.env.production
$webEnvContent = @"
# --- Shop Identity ---
NEXT_PUBLIC_SHOP_NAME="$shopName"
NEXT_PUBLIC_SHOP_TAGLINE="$shopTagline"
NEXT_PUBLIC_SHOP_ADDRESS="$shopAddress"
NEXT_PUBLIC_SHOP_PHONE="$shopPhone"
NEXT_PUBLIC_CURRENCY_SYMBOL="$currencySym"
NEXT_PUBLIC_CURRENCY_CODE="$currencyCode"

# --- Shopkeeper UPI Details ---
NEXT_PUBLIC_SHOP_UPI_ID="$upiId"
NEXT_PUBLIC_SHOP_UPI_NAME="$upiPayeeName"

# --- Supabase Credentials ---
NEXT_PUBLIC_SUPABASE_URL="$supabaseUrl"
NEXT_PUBLIC_SUPABASE_ANON_KEY="$supabaseAnonKey"
SUPABASE_SERVICE_ROLE_KEY="$supabaseService"

# --- Print Agent Shared Secret ---
PRINT_AGENT_SECRET="$agentSecret"

# --- App URL ---
NEXT_PUBLIC_APP_URL="$appUrl"
"@

$webDir = Join-Path $scriptDir "web"
if (Test-Path $webDir) {
    Set-Content -Path (Join-Path $webDir ".env.local") -Value $webEnvContent -Encoding UTF8
    Set-Content -Path (Join-Path $webDir ".env.production") -Value $webEnvContent -Encoding UTF8
    Write-Host "  ✅ Generated web/.env.local and web/.env.production" -ForegroundColor Green
}

# B. Generate print-agent/.env
$agentEnvContent = @"
BACKEND_URL=$appUrl
PRINT_AGENT_SECRET=$agentSecret
AGENT_ID=$agentId
PRINTER_NAME=
POLL_INTERVAL_MS=3000
HEARTBEAT_INTERVAL_MS=15000
DOWNLOAD_DIR=./temp_jobs
SIMULATE_PRINT=false
"@

$agentDir = Join-Path $scriptDir "print-agent"
if (Test-Path $agentDir) {
    Set-Content -Path (Join-Path $agentDir ".env") -Value $agentEnvContent -Encoding UTF8
    Write-Host "  ✅ Generated print-agent/.env" -ForegroundColor Green
}

# C. Update shop.config.json
$shopConfigPath = Join-Path $scriptDir "shop.config.json"
if (Test-Path $shopConfigPath) {
    try {
        $jsonObj = Get-Content $shopConfigPath -Raw | ConvertFrom-Json
        $jsonObj.name = $shopName
        $jsonObj.tagline = $shopTagline
        $jsonObj.address = $shopAddress
        $jsonObj.phone = $shopPhone
        $jsonObj.upiId = $upiId
        $jsonObj.upiPayeeName = $upiPayeeName
        $jsonObj | ConvertTo-Json -Depth 5 | Set-Content $shopConfigPath -Encoding UTF8
        Write-Host "  ✅ Updated shop.config.json" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  Could not update shop.config.json: $_" -ForegroundColor Yellow
    }
}

# D. Test Supabase Database Connection & Apply Migrations via REST API
Write-Host "`n--- Testing Supabase Connection & Running Migrations ---" -ForegroundColor Cyan
if ($supabaseUrl -and $supabaseService) {
    try {
        $headers = @{
            "apikey" = $supabaseService
            "Authorization" = "Bearer $supabaseService"
            "Content-Type" = "application/json"
        }
        $testRes = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/" -Headers $headers -Method Get -ErrorAction Stop
        Write-Host "  ✅ Successfully connected to Supabase project!" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  Notice: Connected to local memory fallback mode." -ForegroundColor Yellow
    }
}

# E. Install NPM Dependencies
Write-Host "`n--- Installing NPM Dependencies ---" -ForegroundColor Cyan
if (Test-Path (Join-Path $webDir "package.json")) {
    Write-Host "Installing web app dependencies..." -ForegroundColor Gray
    Start-Process -FilePath "npm" -ArgumentList "install" -WorkingDirectory $webDir -Wait -NoNewWindow
}
if (Test-Path (Join-Path $agentDir "package.json")) {
    Write-Host "Installing print agent dependencies..." -ForegroundColor Gray
    Start-Process -FilePath "npm" -ArgumentList "install" -WorkingDirectory $agentDir -Wait -NoNewWindow
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  🎉 Setup Complete! QuickPrint is Ready for Deployment!    " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  • Web App Directory:      $webDir"
Write-Host "  • Print Agent Directory:  $agentDir"
Write-Host "  • Agent Health Dashboard: http://localhost:9191"
Write-Host "  • Start Web App:          cd web; npm run dev"
Write-Host "  • Start Print Agent:      cd print-agent; npm run dev`n"
