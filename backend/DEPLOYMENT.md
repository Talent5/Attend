# Backend Deployment Guide

## Deployment Options

### Option 1: Vercel (Recommended for beginners)

#### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

#### Step 2: Deploy Backend
1. Navigate to backend folder:
   ```bash
   cd backend
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel --prod
   ```

#### Step 3: Set Environment Variables
Go to your Vercel dashboard and add these environment variables:

**Required Variables:**
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: A strong secret (generate at https://generate-secret.vercel.app/32)
- `NODE_ENV`: production
- `CORS_ORIGIN`: Your frontend domain (get this after frontend deployment)

**Optional Variables:**
- `USE_HTTPS`: false
- `RATE_LIMIT_WINDOW_MS`: 900000
- `RATE_LIMIT_MAX_REQUESTS`: 100

### Option 2: Railway

1. Go to [Railway](https://railway.app)
2. Connect your GitHub repository
3. Select backend folder as root directory
4. Add environment variables
5. Deploy

### Option 3: Render

1. Go to [Render](https://render.com)
2. Create new Web Service
3. Connect GitHub repository
4. Set root directory to `backend`
5. Add environment variables
6. Deploy

### Option 4: Heroku

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create your-app-name`
4. Add MongoDB addon or use MongoDB Atlas
5. Set environment variables: `heroku config:set VARIABLE_NAME=value`
6. Deploy: `git push heroku main`

## Pre-Deployment Checklist

### 1. MongoDB Setup
- [ ] Create MongoDB Atlas cluster
- [ ] Create database user
- [ ] Whitelist IP addresses (0.0.0.0/0 for production)
- [ ] Get connection string

### 2. Environment Variables
- [ ] MONGODB_URI set
- [ ] JWT_SECRET generated (32+ characters)
- [ ] NODE_ENV set to production
- [ ] CORS_ORIGIN configured

### 3. Code Preparation
- [ ] All dependencies in package.json
- [ ] Start script points to server.js
- [ ] Health check endpoint working
- [ ] Error handling in place

## Post-Deployment Steps

### 1. Test the API
```bash
# Health check
curl https://your-backend-domain.com/api/health

# Test basic endpoint
curl https://your-backend-domain.com/
```

### 2. Create Admin Account
Use one of these methods:

**Method A: Use deployed admin creation endpoint**
```bash
curl -X POST https://your-backend-domain.com/api/admin/create \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Super",
    "lastName": "Admin",
    "email": "admin@yourcompany.com",
    "phoneNumber": "+1234567890",
    "employeeId": "ADMIN001"
  }'
```

**Method B: Run script locally connected to production DB**
```bash
# Set production MONGODB_URI in .env
node create-super-admin.js
```

### 3. Update Frontend Configuration
After backend deployment, update your frontend's API URL to point to your deployed backend.

### 4. Test Mobile Connectivity
- Ensure CORS is configured for your frontend domain
- Test QR code scanning functionality
- Verify Socket.IO connections work

## Troubleshooting

### Common Issues:

1. **CORS Errors**
   - Add your frontend domain to CORS_ORIGIN
   - Include both http and https variants if needed

2. **Database Connection Errors**
   - Verify MONGODB_URI format
   - Check MongoDB Atlas IP whitelist
   - Ensure database user has correct permissions

3. **JWT Errors**
   - Ensure JWT_SECRET is set and long enough
   - Verify JWT_SECRET is the same across all instances

4. **Port Issues**
   - Most platforms automatically set PORT environment variable
   - Ensure your app listens on process.env.PORT

### Environment Variable Format Examples:

```bash
# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/attend?retryWrites=true&w=majority

# JWT Secret (generate a strong one)
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long-random-string

# CORS Origins (multiple domains)
CORS_ORIGIN=https://yourapp.vercel.app,https://yourcustomdomain.com

# Node Environment
NODE_ENV=production
```

## Security Notes

1. **Never commit .env files to version control**
2. **Use strong JWT secrets (32+ characters)**
3. **Restrict CORS origins to your actual domains**
4. **Use HTTPS in production**
5. **Enable rate limiting**
6. **Regularly update dependencies**

## Monitoring

### Health Check Endpoint
Your backend includes a health check at `/api/health` that returns:
```json
{
  "status": "ok",
  "service": "attendance-system",
  "timestamp": "2025-01-13T...",
  "server": "Attend Backend API",
  "version": "1.0.0"
}
```

### Logs
Monitor your deployment platform's logs for:
- Connection issues
- Database errors
- Authentication failures
- CORS problems
