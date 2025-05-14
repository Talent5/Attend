@echo off
echo Starting Attend backend with HTTPS...
cd /d "%~dp0"
SETLOCAL EnableDelayedExpansion

echo Checking all network interfaces...
echo.

REM Better IP detection by finding the correct network interface
FOR /F "tokens=2 delims=:" %%a IN ('ipconfig ^| findstr /C:"IPv4 Address"') DO (
    SET IP=%%a
    SET IP=!IP:~1!
    
    REM Skip localhost/loopback addresses
    if NOT "!IP:~0,3!"=="127" (
        echo Found potential IP: !IP!
        GOTO :found_ip
    )
)
:found_ip

REM Double-check we have a valid IP address, fallback to localhost if not
IF "%IP%"=="" (
    echo Could not determine IP address! 
    echo Falling back to localhost (only local access will work).
    SET IP=127.0.0.1
) ELSE (
    echo Successfully detected IP address: %IP%
)

:: Set environment variables for the backend server
set NODE_ENV=development
set HTTPS=true
set USE_HTTPS=true
set HOST=0.0.0.0
set CLIENT_URL=https://%IP%:3000
set SERVER_IP=%IP%
set PORT=5000
set ALLOW_EXTERNAL=true
set CERT_PATH=../certificates/cert.pem
set KEY_PATH=../certificates/key.pem

echo Running backend with HTTPS on all network interfaces (0.0.0.0)
echo Backend API will be available at: https://%IP%:5000/api
echo.
echo To access the API from your phone:
echo 1. Make sure your phone is on the same WiFi network
echo 2. The API will be available at https://%IP%:5000/api
echo 3. If it doesn't work, try temporarily disabling Windows Firewall
echo.

npm run start-https