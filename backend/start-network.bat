@echo off
SETLOCAL EnableDelayedExpansion

echo ======================================================
echo    Starting Attend Backend with Network Access
echo ======================================================
echo.

REM Get the computer's IP address (more reliable method)
FOR /F "tokens=4 delims= " %%i IN ('route print ^| find "0.0.0.0" ^| find /v "127.0.0.1"') DO (
    IF "!IP!"=="" SET IP=%%i
)

REM Fallback method if the above fails
IF "!IP!"=="" (
    FOR /F "tokens=2 delims=:" %%a IN ('ipconfig ^| findstr /C:"IPv4 Address"') DO (
        SET IP=%%a
        SET IP=!IP:~1!
        GOTO :found_ip
    )
)
:found_ip

REM Check if we found an IP
IF "!IP!"=="" (
    echo ERROR: Could not detect your computer's IP address.
    echo Please enter your IP address manually:
    set /p IP=Enter your computer's IP address: 
)

echo IP Address detected: %IP%
echo.
echo Mobile devices should connect using:
echo Backend API: http://%IP%:5000/api
echo.
echo Make sure that:
echo 1. Your phone and computer are on the same WiFi network
echo 2. Windows Firewall is not blocking port 5000
echo.
echo Press Ctrl+C to stop the server
echo ======================================================

REM Set environment variables
SET PORT=5000
SET HOST=0.0.0.0

REM Start the backend server
node server.js