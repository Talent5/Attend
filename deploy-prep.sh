#!/bin/bash

# Deployment preparation script for Attend App

echo "🚀 Preparing Attend App for deployment..."

# Check if we're in the right directory
if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    echo "❌ Error: This script must be run from the root directory of the Attend app"
    exit 1
fi

echo "📝 Step 1: Installing dependencies..."

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install --production
cd ..

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "🏗️ Step 2: Building frontend for production..."
cd frontend
npm run build
cd ..

echo "✅ Step 3: Deployment preparation complete!"
echo ""
echo "📋 Next steps for deployment:"
echo "1. Set up MongoDB Atlas database"
echo "2. Create GitHub repository and push code"
echo "3. Deploy to your chosen platform (Vercel, Railway, etc.)"
echo "4. Configure environment variables"
echo "5. Create admin account"
echo ""
echo "📖 See DEPLOYMENT-GUIDE.md for detailed instructions"
