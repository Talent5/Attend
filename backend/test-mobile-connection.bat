@echo off
echo Starting mobile connectivity test server...
cd /d "%~dp0"

echo This simple test server will help diagnose network connectivity issues
echo from your mobile device to your computer.
echo.

node mobile-test-server.js