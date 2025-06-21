# Deployment Guide for Attend App

## Prerequisites
1. GitHub account
2. Vercel account (free)
3. MongoDB Atlas account (free)

## Step-by-Step Deployment

### 1. Prepare MongoDB Database

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account and new cluster
3. Create a database user with read/write permissions
4. Whitelist all IP addresses (0.0.0.0/0) for production
5. Get your connection string

### 2. Push to GitHub

```bash
# Initialize git repository (if not already done)
git init
git add .
git commit -m "Initial commit"

# Create GitHub repository and push
git remote add origin https://github.com/your-username/attend-app.git
git push -u origin main
```

### 3. Deploy Backend to Vercel

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Set up environment variables in Vercel dashboard:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: A strong secret key (generate at https://generate-secret.vercel.app/32)
   - `NODE_ENV`: production
   - `CORS_ORIGIN`: https://your-frontend-domain.vercel.app (you'll get this after frontend deployment)

### 4. Deploy Frontend to Vercel

1. Create another Vercel project for frontend
2. Set root directory to `frontend`
3. Set environment variables:
   - `REACT_APP_API_URL`: https://your-backend-domain.vercel.app/api
   - `REACT_APP_SOCKET_URL`: https://your-backend-domain.vercel.app

### 5. Update CORS Settings

After both deployments, update your backend environment variables:
- `CORS_ORIGIN`: Add your frontend domain
- `SOCKET_CORS_ORIGIN`: Add your frontend domain

### 6. Create Admin Account

Use Vercel's serverless function feature or run locally:
```bash
cd backend
node create-super-admin.js
```

## Alternative Deployment Options

### Option 1: Railway (Backend) + Netlify (Frontend)

#### Railway Backend:
1. Go to [Railway](https://railway.app)
2. Connect GitHub repository
3. Set root directory to `backend`
4. Add environment variables
5. Deploy

#### Netlify Frontend:
1. Go to [Netlify](https://netlify.com)
2. Connect GitHub repository
3. Set build directory to `frontend`
4. Build command: `npm run build`
5. Publish directory: `build`

### Option 2: DigitalOcean App Platform

1. Go to [DigitalOcean](https://www.digitalocean.com)
2. Create new App
3. Connect GitHub repository
4. Configure both backend and frontend components
5. Set environment variables
6. Deploy

### Option 3: Render

1. Go to [Render](https://render.com)
2. Create web service for backend
3. Create static site for frontend
4. Configure environment variables
5. Deploy

## Environment Variables Checklist

### Backend (.env):
- [x] MONGODB_URI
- [x] JWT_SECRET  
- [x] NODE_ENV=production
- [x] CORS_ORIGIN
- [x] SOCKET_CORS_ORIGIN

### Frontend (.env.production):
- [x] REACT_APP_API_URL
- [x] REACT_APP_SOCKET_URL

## Post-Deployment Steps

1. Test all functionality:
   - User registration/login
   - QR code generation
   - QR code scanning
   - Attendance tracking
   - Admin dashboard

2. Set up monitoring (optional):
   - Vercel Analytics
   - Error tracking (Sentry)
   - Uptime monitoring

3. Configure custom domain (optional):
   - Add custom domain in Vercel
   - Update CORS settings with new domain

## Troubleshooting

### Common Issues:
1. **CORS errors**: Update CORS_ORIGIN environment variable
2. **Database connection**: Check MongoDB URI and network access
3. **Build failures**: Check Node.js version compatibility
4. **Environment variables**: Ensure all required variables are set

### Debug Steps:
1. Check Vercel function logs
2. Test API endpoints directly
3. Verify environment variables
4. Check MongoDB Atlas connection

## Security Considerations

1. Use strong JWT secrets
2. Limit MongoDB IP access in production
3. Enable HTTPS only
4. Regular security updates
5. Monitor for unusual activity

## Scaling Considerations

1. MongoDB Atlas auto-scaling
2. Vercel automatic scaling
3. CDN for static assets
4. Database indexing optimization
5. Caching strategies
