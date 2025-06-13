# startall.ps1 - Script to start both frontend and backend of Attend System
# Author: GitHub Copilot
# Created: June 4, 2025

Write-Host "Starting Attend System..." -ForegroundColor Green
Write-Host "------------------------------" -ForegroundColor Green

# Define paths
$frontendPath = Join-Path $PSScriptRoot "frontend"
$backendPath = Join-Path $PSScriptRoot "backend"

# Check if paths exist
if (-not (Test-Path $frontendPath)) {
    Write-Host "ERROR: Frontend folder not found at $frontendPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendPath)) {
    Write-Host "ERROR: Backend folder not found at $backendPath" -ForegroundColor Red
    exit 1
}

# Function to check if npm is installed
function Check-NpmInstalled {
    try {
        $npmVersion = npm --version
        Write-Host "npm version $npmVersion detected" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "ERROR: npm is not installed or not in PATH" -ForegroundColor Red
        return $false
    }
}

# Check npm installation
if (-not (Check-NpmInstalled)) {
    Write-Host "Please install Node.js and npm before running this script." -ForegroundColor Yellow
    exit 1
}

# Start backend server
Write-Host "Starting backend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendPath'; npm start"

# Wait a moment to let backend initialize
Write-Host "Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start frontend development server
Write-Host "Starting frontend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm start"

Write-Host "`nAttend System startup complete!" -ForegroundColor Green
Write-Host "Backend URL: http://localhost:5000" -ForegroundColor Green
Write-Host "Frontend URL: http://localhost:3000" -ForegroundColor Green
Write-Host "`nPress Ctrl+C in each terminal window to stop the servers" -ForegroundColor Yellow
