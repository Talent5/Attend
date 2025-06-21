@echo off
echo 🚀 Preparing Attend App for deployment...

REM Check if we're in the right directory
if not exist "backend\package.json" (
    echo ❌ Error: This script must be run from the root directory of the Attend app
    exit /b 1
)
if not exist "frontend\package.json" (
    echo ❌ Error: This script must be run from the root directory of the Attend app
    exit /b 1
)

echo 📝 Step 1: Installing dependencies...

REM Install backend dependencies
echo Installing backend dependencies...
cd backend
call npm install --production
cd ..

REM Install frontend dependencies
echo Installing frontend dependencies...
cd frontend
call npm install
cd ..

echo 🏗️ Step 2: Building frontend for production...
cd frontend
call npm run build
cd ..

echo ✅ Step 3: Deployment preparation complete!
echo.
echo 📋 Next steps for deployment:
echo 1. Set up MongoDB Atlas database
echo 2. Create GitHub repository and push code
echo 3. Deploy to your chosen platform (Vercel, Railway, etc.)
echo 4. Configure environment variables
echo 5. Create admin account
echo.
echo 📖 See DEPLOYMENT-GUIDE.md for detailed instructions
pause
