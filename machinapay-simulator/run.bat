@echo off
setlocal
title MachinaPay Robot Simulator

echo ===================================================
echo        MachinaPay - Robot Simulator Runner
echo ===================================================
echo.

:: Change directory to the folder containing this batch script
cd /d "%~dp0"

:: If executed from the parent workspace directory, step into machinapay-simulator
if exist "machinapay-simulator\package.json" (
    cd machinapay-simulator
)

:: Verify package.json is present
if not exist "package.json" (
    echo [ERROR] package.json not found!
    echo Please make sure run.bat is located in the project folder.
    echo.
    pause
    exit /b 1
)

:: Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ and restart your terminal.
    echo.
    pause
    exit /b 1
)

:: Check for npm
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not found in PATH.
    echo Please ensure Node.js is properly installed.
    echo.
    pause
    exit /b 1
)

:: Setup .env if it does not exist
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] .env not found. Creating .env from .env.example...
        copy ".env.example" ".env" >nul
        echo [OK] Default .env created with VITE_MOCK_MODE=true.
    ) else (
        echo [WARN] .env.example not found. Continuing without copying.
    )
    echo.
)

:: Install dependencies if node_modules does not exist
if not exist "node_modules\" (
    echo [INFO] First time setup: node_modules folder missing.
    echo Installing dependencies via npm install...
    echo.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] npm install encountered an error.
        pause
        exit /b %ERRORLEVEL%
    )
    echo.
    echo [OK] Dependencies installed successfully.
    echo.
)

echo ===================================================
echo  Starting MachinaPay Simulator...
echo  Local URL:   http://localhost:5174/
echo  Press Ctrl+C to shut down the server.
echo ===================================================
echo.

:: Start Vite dev server
call npm run dev

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Server exited with code: %ERRORLEVEL%
    pause
)
