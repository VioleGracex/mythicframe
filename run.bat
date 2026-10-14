@echo off
setlocal enabledelayedexpansion
title MythicFrame - One-Click Launcher

echo ========================================================
echo               MythicFrame Asset Studio
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
    )
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your system.
    echo.
    echo Would you like to install Node.js via winget? (Y/N)
    set /p INSTALL_NODE=
    if /i "!INSTALL_NODE!"=="Y" (
        echo Installing Node.js LTS via winget...
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        echo.
        echo Please restart this script once the Node.js installer finishes.
        pause
        exit /b 1
    ) else (
        echo Please download and install Node.js from: https://nodejs.org/
        pause
        exit /b 1
    )
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Check and install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [*] First-time setup detected. Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Please check the logs above.
        pause
        exit /b 1
    )
    echo [*] Building MCP server bundle...
    call npm run build:mcp
) else (
    echo [OK] Dependencies already installed.
)

echo.
echo ========================================================
echo Starting MythicFrame Studio + BEI Bridge Server...
echo Studio URL: http://localhost:3488
echo BEI Bridge: http://localhost:58925
echo ========================================================
echo.

:: 3. Launch browser in background after short delay
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3488"

:: 4. Start Server
call npm run dev

pause
