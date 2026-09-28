@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ======================================================================
echo                     MachinaPay — Local Demo Launcher
echo ======================================================================
echo.

REM Disable Hardhat telemetry prompt
set HARDHAT_DISABLE_TELEMETRY=true
set HARDHAT_TELEMETRY_DISABLED=true

REM 1. Check Node.js and npm
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js v18, v20, or v22 LTS.
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not found in PATH.
    exit /b 1
)

REM 2. Check and install dependencies
echo [1/6] Checking dependencies...
if not exist "node_modules" (
    echo [INFO] Installing root blockchain dependencies...
    call npm.cmd install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install root dependencies.
        exit /b 1
    )
)

if not exist "Backend-service\node_modules" (
    echo [INFO] Installing Backend-service dependencies...
    cd Backend-service
    call npm.cmd install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install Backend-service dependencies.
        cd ..
        exit /b 1
    )
    cd ..
)

if not exist "machinapay-frontend\node_modules" (
    echo [INFO] Installing Frontend dependencies...
    cd machinapay-frontend
    call npm.cmd install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install frontend dependencies.
        cd ..
        exit /b 1
    )
    cd ..
)

if exist "machinapay-simulator" (
    if not exist "machinapay-simulator\node_modules" (
        echo [INFO] Installing Simulator dependencies...
        cd machinapay-simulator
        call npm.cmd install
        if !ERRORLEVEL! neq 0 (
            echo [ERROR] Failed to install simulator dependencies.
            cd ..
            exit /b 1
        )
        cd ..
    )
)

REM 3. Confirm .env files exist

if not exist ".env" (
    echo [INFO] Creating root .env from .env.example...
    copy ".env.example" ".env" >nul
)

if not exist "Backend-service\.env" (
    echo [WARNING] Backend-service\.env is missing! Creating from .env.example...
    copy "Backend-service\.env.example" "Backend-service\.env" >nul
    echo.
    echo ======================================================================
    echo [ACTION REQUIRED] Please edit Backend-service\.env and configure
    echo MACHINE_PRIVATE_KEY and VERIFIER_PRIVATE_KEY before proceeding.
    echo The verifier address must match the configured verifier contract address.
    echo ======================================================================
    echo.
    pause
)

if not exist "machinapay-frontend\.env" (
    if exist "machinapay-frontend\.env.example" (
        copy "machinapay-frontend\.env.example" "machinapay-frontend\.env" >nul
    )
)

if not exist "machinapay-simulator\.env" (
    if exist "machinapay-simulator\.env.example" (
        copy "machinapay-simulator\.env.example" "machinapay-simulator\.env" >nul
    )
)

REM 4. Compile smart contracts

echo.
echo [2/6] Compiling smart contracts...
call npx.cmd hardhat compile
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Smart contract compilation failed.
    exit /b 1
)

REM 5. Start Hardhat node in new window if not already listening
echo.
echo [3/6] Checking Hardhat node...
netstat -ano | findstr ":8545 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Hardhat node is already running on 127.0.0.1:8545.
) else (
    echo [INFO] Spawning Hardhat node in a new window...
    start "MachinaPay Hardhat Node" cmd /k npx.cmd hardhat node
    
    echo [INFO] Waiting for Hardhat node to listen on 127.0.0.1:8545...
    set RETRIES=0
    :WAIT_NODE
    netstat -ano | findstr ":8545 " | findstr "LISTENING" >nul 2>&1
    if !ERRORLEVEL! equ 0 goto NODE_READY
    set /a RETRIES+=1
    if !RETRIES! geq 35 (
        echo [ERROR] Hardhat node failed to start within 35 seconds.
        exit /b 1
    )
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_NODE
    :NODE_READY
    echo [SUCCESS] Hardhat node is ready!
)

REM 6. Deploy and seed contracts locally
echo.
echo [4/6] Deploying and seeding contracts...
call npm.cmd run deploy:local
if %ERRORLEVEL% neq 0 (
    if exist "integration\machinapay.contracts.json" (
        echo [INFO] Contracts deployed and synced successfully.
    ) else (
        echo [ERROR] Contract deployment failed.
        exit /b 1
    )
)

call npm.cmd run seed:local
if %ERRORLEVEL% neq 0 (
    echo [INFO] Seed completed with warning. Proceeding with service startup...
)

REM 7. Start Backend-service in new window if not already running
echo.
echo [5/6] Checking Backend-service...
netstat -ano | findstr ":4000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Backend-service is already running on port 4000.
) else (
    echo [INFO] Spawning Backend-service in a new window...
    start "MachinaPay Backend Service" cmd /k "cd /d "%~dp0Backend-service" && npm.cmd run dev"
    
    echo [INFO] Waiting for Backend-service on port 4000...
    set RETRIES=0
    :WAIT_BACKEND
    netstat -ano | findstr ":4000 " | findstr "LISTENING" >nul 2>&1
    if !ERRORLEVEL! equ 0 goto BACKEND_READY
    set /a RETRIES+=1
    if !RETRIES! geq 30 (
        echo [WARNING] Backend-service is still starting up, proceeding...
        goto BACKEND_READY
    )
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_BACKEND
    :BACKEND_READY
    echo [SUCCESS] Backend-service is ready!
)

REM 8. Start Frontend in new window if not already running
echo.
echo [6/6] Checking Frontend...
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Frontend is already running on port 5173.
) else (
    echo [INFO] Spawning Frontend in a new window...
    start "MachinaPay Frontend" cmd /k "cd /d "%~dp0machinapay-frontend" && npm.cmd run dev"
    
    echo [INFO] Waiting for Frontend on port 5173...
    set RETRIES=0
    :WAIT_FRONTEND
    netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul 2>&1
    if !ERRORLEVEL! equ 0 goto FRONTEND_READY
    set /a RETRIES+=1
    if !RETRIES! geq 30 (
        echo [WARNING] Frontend is still starting up, proceeding...
        goto FRONTEND_READY
    )
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_FRONTEND
    :FRONTEND_READY
    echo [SUCCESS] Frontend is ready!
)

REM 9. Start 3D Simulator in new window if available
if exist "machinapay-simulator" (
    echo.
    echo [BONUS] Checking 3D Robot Simulator...
    netstat -ano | findstr ":5174 " | findstr "LISTENING" >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo [INFO] 3D Robot Simulator is already running on port 5174.
    ) else (
        echo [INFO] Spawning 3D Robot Simulator in a new window...
        start "MachinaPay 3D Robot Simulator" cmd /k "cd /d "%~dp0machinapay-simulator" && npm.cmd run dev"
        echo [SUCCESS] 3D Robot Simulator spawned on port 5174!
    )
)

echo.
echo ======================================================================
echo                     MachinaPay Demo is RUNNING!
echo ======================================================================
echo   - Frontend UI:          http://localhost:5173
echo   - 3D Robot Simulator:   http://localhost:5174
echo   - Backend Service:      http://localhost:4000/health
echo   - Hardhat Local Node:   http://127.0.0.1:8545
echo.
echo   To stop all services, run stop.bat or close the command windows.
echo ======================================================================
echo.
exit /b 0

