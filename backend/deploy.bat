@echo off
echo ========================================
echo    ATTEND BACKEND DEPLOYMENT SCRIPT
echo ========================================
echo.

echo Checking if Vercel CLI is installed...
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Vercel CLI not found. Installing...
    npm install -g vercel
)

echo.
echo Installing production dependencies...
npm ci --production

echo.
echo Building project...
npm run vercel-build

echo.
echo Deploying to Vercel...
vercel --prod

echo.
echo ========================================
echo    DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Set up your environment variables in Vercel dashboard
echo 2. Update CORS origins with your frontend domain
echo 3. Create admin account using the deployed backend
echo.
pause
