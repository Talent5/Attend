@echo off
rem startall-https.bat - Batch script to start both frontend and backend of Attend System with HTTPS
rem Author: GitHub Copilot
rem Created: June 4, 2025

echo Starting Attend System with HTTPS...
echo ------------------------------

rem Define paths
set FRONTEND_PATH=%~dp0frontend
set BACKEND_PATH=%~dp0backend

rem Check if paths exist
if not exist "%FRONTEND_PATH%" (
    echo ERROR: Frontend folder not found at %FRONTEND_PATH%
    exit /b 1
)

if not exist "%BACKEND_PATH%" (
    echo ERROR: Backend folder not found at %BACKEND_PATH%
    exit /b 1
)

rem Check npm installation
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    echo Please install Node.js and npm before running this script.
    exit /b 1
)

echo Starting backend server with HTTPS...
start "Attend Backend HTTPS" cmd /k "cd /d "%BACKEND_PATH%" && npm run start-https"

rem Wait a moment to let backend initialize
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo Starting frontend server with HTTPS...
start "Attend Frontend HTTPS" cmd /k "cd /d "%FRONTEND_PATH%" && npm run start-https"

echo.
echo Attend System startup complete with HTTPS!
echo Backend URL: https://localhost:5000
echo Frontend URL: https://localhost:3000
echo.
echo Press Ctrl+C in each terminal window to stop the servers
