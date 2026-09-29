@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ======================================================================
echo             MachinaPay — MST Testnet Demo Launcher
echo ======================================================================
echo [NETWORK] Targeting MST Testnet (Chain ID: 91562037)
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH.
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not found in PATH.
    exit /b 1
)

echo [1/4] Verifying MST Testnet contract configuration...
node -e "const c = require('./integration/machinapay.contracts.json'); if (c.chainId !== 91562037) { const fs = require('fs'); const mst = fs.readFileSync('./deployments/mst-testnet.json', 'utf8'); const parsed = JSON.parse(mst); c.network = 'mst'; c.chainId = 91562037; c.rpcUrl = 'https://testnetrpc.mstblockchain.com'; c.explorerUrl = 'https://testnet.mstscan.com'; c.nativeToken = 'tMSTC'; c.addresses.MachineRegistry = parsed.MachineRegistry; c.addresses.JobEscrow = parsed.JobEscrow; c.eip712.chainId = 91562037; c.eip712.verifyingContract = parsed.JobEscrow; const str = JSON.stringify(c, null, 2); fs.writeFileSync('./integration/machinapay.contracts.json', str); fs.writeFileSync('./Backend-service/integration/machinapay.contracts.json', str); fs.writeFileSync('./machinapay-frontend/integration/machinapay.contracts.json', str); console.log('Synchronized MST Testnet addresses to all integration files.'); }"

echo.
echo [2/4] Checking Backend-service on port 4000...
netstat -ano | findstr ":4000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Backend-service is already running on port 4000.
) else (
    echo [INFO] Starting Backend-service on port 4000...
    start "MachinaPay Backend-service (MST Testnet)" cmd /k "cd /d \"%~dp0Backend-service\" && npm run dev"
    set RETRIES=0
    :WAIT_BACKEND
    netstat -ano | findstr ":4000 " | findstr "LISTENING" >nul 2>&1
    if !ERRORLEVEL! equ 0 goto BACKEND_READY
    set /a RETRIES+=1
    if !RETRIES! geq 25 (
        echo [ERROR] Backend-service failed to start within 25 seconds.
        exit /b 1
    )
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_BACKEND
    :BACKEND_READY
    echo [SUCCESS] Backend-service is ready on port 4000!
)

echo.
echo [3/4] Checking 3D Robot Simulator on port 5174...
netstat -ano | findstr ":5174 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] 3D Robot Simulator is already running on port 5174.
) else (
    echo [INFO] Starting 3D Robot Simulator...
    start "MachinaPay Simulator" cmd /k "cd /d \"%~dp0machinapay-simulator\" && npm run dev"
    set RETRIES=0
    :WAIT_SIM
    netstat -ano | findstr ":5174 " | findstr "LISTENING" >nul 2>&1
    if !ERRORLEVEL! equ 0 goto SIM_READY
    set /a RETRIES+=1
    if !RETRIES! geq 25 (
        echo [ERROR] Simulator failed to start within 25 seconds.
        exit /b 1
    )
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_SIM
    :SIM_READY
    echo [SUCCESS] 3D Robot Simulator is ready on port 5174!
)

echo.
echo [4/4] Checking Frontend on port 5173...
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Frontend is already running on port 5173.
) else (
    echo [INFO] Starting Frontend...
    start "MachinaPay Frontend" cmd /k "cd /d \"%~dp0machinapay-frontend\" && npm run dev"
    set RETRIES=0
    :WAIT_FE
    netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
    if !ERRORLEVEL! equ 0 goto FE_READY
    set /a RETRIES+=1
    if !RETRIES! geq 25 (
        echo [ERROR] Frontend failed to start within 25 seconds.
        exit /b 1
    )
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_FE
    :FE_READY
    echo [SUCCESS] Frontend is ready on port 5173!
)

echo.
echo ======================================================================
echo             MachinaPay MST Testnet Demo is LIVE!
echo ======================================================================
echo   - Customer Frontend:    http://localhost:5173
echo   - 3D Robot Simulator:   http://localhost:5174
echo   - Backend Service:      http://localhost:4000/health
echo   - Network:              MST Testnet (Chain ID: 91562037)
echo   - Escrow Contract:      0x07134fd3d167f5E331A273722A54A88536331C2e
echo ======================================================================
