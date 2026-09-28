# MachinaPay - PowerShell Orchestration Script
$ErrorActionPreference = "Stop"
$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location $PSScriptRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                    MachinaPay — Local Demo Launcher                   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$env:HARDHAT_DISABLE_TELEMETRY = "true"
$env:HARDHAT_TELEMETRY_DISABLED = "true"

# 1. Check Node.js and npm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not found in PATH. Please install Node.js v18, v20, or v22 LTS."
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not found in PATH."
    exit 1
}

# 2. Check and install dependencies
Write-Host "[1/6] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "[INFO] Installing root blockchain dependencies..." -ForegroundColor Gray
    npm.cmd install
}

if (-not (Test-Path "$PSScriptRoot\Backend-service\node_modules")) {
    Write-Host "[INFO] Installing Backend-service dependencies..." -ForegroundColor Gray
    Push-Location "$PSScriptRoot\Backend-service"
    npm.cmd install
    Pop-Location
}

if (-not (Test-Path "$PSScriptRoot\machinapay-frontend\node_modules")) {
    Write-Host "[INFO] Installing Frontend dependencies..." -ForegroundColor Gray
    Push-Location "$PSScriptRoot\machinapay-frontend"
    npm.cmd install
    Pop-Location
}

if (Test-Path "$PSScriptRoot\machinapay-simulator") {
    if (-not (Test-Path "$PSScriptRoot\machinapay-simulator\node_modules")) {
        Write-Host "[INFO] Installing Simulator dependencies..." -ForegroundColor Gray
        Push-Location "$PSScriptRoot\machinapay-simulator"
        npm.cmd install
        Pop-Location
    }
}

# 3. Confirm .env files exist
if (-not (Test-Path "$PSScriptRoot\.env")) {
    Copy-Item "$PSScriptRoot\.env.example" "$PSScriptRoot\.env"
}

if (-not (Test-Path "$PSScriptRoot\Backend-service\.env")) {
    Copy-Item "$PSScriptRoot\Backend-service\.env.example" "$PSScriptRoot\Backend-service\.env"
    Write-Warning "Backend-service\.env was created from example. Please configure your MACHINE_PRIVATE_KEY and VERIFIER_PRIVATE_KEY."
    Read-Host "Press Enter to continue..."
}

if (-not (Test-Path "$PSScriptRoot\machinapay-frontend\.env")) {
    if (Test-Path "$PSScriptRoot\machinapay-frontend\.env.example") {
        Copy-Item "$PSScriptRoot\machinapay-frontend\.env.example" "$PSScriptRoot\machinapay-frontend\.env"
    }
}

if (Test-Path "$PSScriptRoot\machinapay-simulator") {
    if (-not (Test-Path "$PSScriptRoot\machinapay-simulator\.env")) {
        if (Test-Path "$PSScriptRoot\machinapay-simulator\.env.example") {
            Copy-Item "$PSScriptRoot\machinapay-simulator\.env.example" "$PSScriptRoot\machinapay-simulator\.env"
        }
    }
}

# 4. Compile contracts
Write-Host "`n[2/6] Compiling smart contracts..." -ForegroundColor Yellow
npx.cmd hardhat compile

# 5. Start Hardhat node in new window if not already listening
Write-Host "`n[3/6] Checking Hardhat node..." -ForegroundColor Yellow
$nodeListening = Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue
if ($nodeListening) {
    Write-Host "[INFO] Hardhat node is already running on 127.0.0.1:8545." -ForegroundColor Green
} else {
    Write-Host "[INFO] Spawning Hardhat node in a new window..." -ForegroundColor Gray
    Start-Process cmd.exe -ArgumentList "/k title MachinaPay Hardhat Node && npx.cmd hardhat node" -WorkingDirectory $PSScriptRoot

    Write-Host "[INFO] Waiting for Hardhat node to listen on 127.0.0.1:8545..." -ForegroundColor Gray
    $retries = 0
    while (-not (Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue)) {
        Start-Sleep -Seconds 1
        $retries++
        if ($retries -ge 35) {
            Write-Error "Hardhat node failed to start within 35 seconds."
            exit 1
        }
    }
    Write-Host "[SUCCESS] Hardhat node is ready!" -ForegroundColor Green
}

# 6. Deploy and seed contracts locally
Write-Host "`n[4/6] Deploying and seeding contracts..." -ForegroundColor Yellow
npm.cmd run deploy:local
npm.cmd run seed:local

# 7. Start Backend-service in new window if not already running
Write-Host "`n[5/6] Checking Backend-service..." -ForegroundColor Yellow
$backendListening = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($backendListening) {
    Write-Host "[INFO] Backend-service is already running on port 4000." -ForegroundColor Green
} else {
    Write-Host "[INFO] Spawning Backend-service in a new window..." -ForegroundColor Gray
    Start-Process cmd.exe -ArgumentList "/k title MachinaPay Backend Service && npm.cmd run dev" -WorkingDirectory "$PSScriptRoot\Backend-service"

    Write-Host "[INFO] Waiting for Backend-service on port 4000..." -ForegroundColor Gray
    $retries = 0
    while (-not (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue)) {
        Start-Sleep -Seconds 1
        $retries++
        if ($retries -ge 30) {
            Write-Warning "Backend-service is taking longer than expected to bind port 4000."
            break
        }
    }
    Write-Host "[SUCCESS] Backend-service is ready!" -ForegroundColor Green
}

# 8. Start Frontend in new window if not already running
Write-Host "`n[6/6] Checking Frontend..." -ForegroundColor Yellow
$frontendListening = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($frontendListening) {
    Write-Host "[INFO] Frontend is already running on port 5173." -ForegroundColor Green
} else {
    Write-Host "[INFO] Spawning Frontend in a new window..." -ForegroundColor Gray
    Start-Process cmd.exe -ArgumentList "/k title MachinaPay Frontend && npm.cmd run dev" -WorkingDirectory "$PSScriptRoot\machinapay-frontend"

    Write-Host "[INFO] Waiting for Frontend on port 5173..." -ForegroundColor Gray
    $retries = 0
    while (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
        Start-Sleep -Seconds 1
        $retries++
        if ($retries -ge 30) {
            Write-Warning "Frontend is taking longer than expected to bind port 5173."
            break
        }
    }
    Write-Host "[SUCCESS] Frontend is ready!" -ForegroundColor Green
}

# 9. Start 3D Simulator in new window if available
if (Test-Path "$PSScriptRoot\machinapay-simulator") {
    Write-Host "`n[BONUS] Checking 3D Robot Simulator..." -ForegroundColor Yellow
    $simListening = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
    if ($simListening) {
        Write-Host "[INFO] 3D Simulator is already running on port 5174." -ForegroundColor Green
    } else {
        Write-Host "[INFO] Spawning 3D Robot Simulator in a new window..." -ForegroundColor Gray
        Start-Process cmd.exe -ArgumentList "/k title MachinaPay 3D Robot Simulator && npm.cmd run dev" -WorkingDirectory "$PSScriptRoot\machinapay-simulator"
        Write-Host "[SUCCESS] 3D Robot Simulator spawned on port 5174!" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                     MachinaPay Demo is RUNNING!                      " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  - Frontend UI:          http://localhost:5173" -ForegroundColor White
Write-Host "  - 3D Robot Simulator:   http://localhost:5174" -ForegroundColor White
Write-Host "  - Backend Service:      http://localhost:4000/health" -ForegroundColor White
Write-Host "  - Hardhat Local Node:   http://127.0.0.1:8545" -ForegroundColor White
Write-Host ""
Write-Host "  To stop all services, run .\stop.bat (or .\stop.ps1) or close the command windows." -ForegroundColor Gray
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
