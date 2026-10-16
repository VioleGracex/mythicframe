@echo off
setlocal enabledelayedexpansion
title MythicFrame - One-Click Launcher

:: 1. Force working directory to the directory of this batch file
cd /d "%~dp0"

echo ========================================================
echo               MythicFrame Asset Studio
echo ========================================================
echo.

:: 2. Check and locate Node.js & npm in standard installation paths
where node >nul 2>nul
if not errorlevel 1 goto node_ok

if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%APPDATA%\npm\node.exe" set "PATH=%APPDATA%\npm;%PATH%"

where node >nul 2>nul
if not errorlevel 1 goto node_ok

echo [ERROR] Node.js is not found on your system.
echo Please download and install Node.js v18 or higher from https://nodejs.org/
echo.
pause
exit /b 1

:node_ok
echo [OK] Node.js detected:
node -v
echo.

:: 3. Clean up stale zombie processes holding port 3488 or 58925 to prevent EADDRINUSE crash
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3488, 58925 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ('[*] Freeing port ' + $_.LocalPort + ' from stale process PID ' + $_.OwningProcess + '...'); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul

:: 4. Auto-register mythicframe:// protocol in Windows Registry for 1-click extension launching
reg add "HKCU\Software\Classes\mythicframe" /ve /t REG_SZ /d "URL:MythicFrame Protocol" /f >nul 2>nul
reg add "HKCU\Software\Classes\mythicframe" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>nul
reg add "HKCU\Software\Classes\mythicframe\shell\open\command" /ve /t REG_SZ /d "cmd.exe /c start \"\" \"%~dp0run.bat\" --browser-launch" /f >nul 2>nul

:: 5. Check and install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [*] First-time setup detected. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Please check the logs above.
        pause
        exit /b 1
    )
    echo [*] Building MCP server bundle...
    call npm run build:mcp
) else (
    echo [OK] Dependencies already installed.
    if not exist "mcp-server\index.js" (
        echo [*] Building MCP server bundle...
        call npm run build:mcp
    )
)

echo.
echo ========================================================
echo Starting MythicFrame Studio + BEI Bridge Server...
echo Studio URL: http://localhost:3488
echo BEI Bridge: http://localhost:58925
echo ========================================================
echo.

:: 6. Launch browser in background only when the server actually becomes healthy and responds
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready = $false; for ($i=0; $i -lt 35; $i++) { Start-Sleep -Milliseconds 600; try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3488/api/bei/status' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {} }; if ($ready) { Start-Process 'http://localhost:3488' }"

:: 7. Start Server
call npm run dev

if errorlevel 1 (
    echo.
    echo [ERROR] Server terminated unexpectedly.
    pause
)

