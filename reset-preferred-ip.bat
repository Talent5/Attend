@echo off
REM reset-preferred-ip.bat - Reset any saved IP preferences
REM Created June 4, 2025

echo ========================================================
echo    RESETTING PREFERRED IP CONFIGURATION
echo ========================================================

echo This script will clear any saved IP preferences
echo in your browser's localStorage and ensure that
echo auto-detect mode works properly.

echo.
echo To complete this process:
echo 1. Open the Attend application in your browser
echo 2. Press F12 to open browser developer tools
echo 3. Go to the "Application" or "Storage" tab
echo 4. Find "Local Storage" in the sidebar
echo 5. Delete the "preferredServerIP" item if it exists
echo 6. Reload the page
echo.
echo Alternatively, you can:
echo 1. Clear your browser data for this site
echo 2. Then reload the page
echo.
echo This will allow the application to fully use
echo the auto-detect network feature.
echo ========================================================

pause
