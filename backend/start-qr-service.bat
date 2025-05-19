@echo off
echo Starting Python QR Scanner Service...

:: Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Python is not installed or not in the PATH.
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Install setuptools first
echo Installing setuptools...
pip install setuptools

:: Check if requirements are installed
echo Checking and installing required packages...
pip install -r requirements-qr.txt

:: Start the QR scanner service
echo Starting QR scanner service on port 5005...
python qr_scanner_service_simple.py

pause
