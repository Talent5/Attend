// Simplified Vercel-compatible API entry point
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Initialize environment variables
dotenv.config();

// Import routes
const authRoutes = require('../routes/auth.routes');
const employeeRoutes = require('../routes/employee.routes');
const attendanceRoutes = require('../routes/attendance.routes');
const qrCodeRoutes = require('../routes/qrcode.routes');
const locationRoutes = require('../routes/location.routes');

// Create Express app
const app = express();

// Basic CORS configuration for Vercel
const corsOptions = {
  origin: function(origin, callback) {
    console.log('CORS check - Request origin:', origin);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://attendqr-nine.vercel.app',
      'https://attendqr-f3faonw1r-talent5s-projects.vercel.app',
      'https://attendqr.vercel.app',
      process.env.CORS_ORIGIN
    ].filter(Boolean);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log('CORS: Allowing origin:', origin);
      callback(null, true);
    } else {
      console.log('CORS: Blocking origin:', origin);
      console.log('CORS: Allowed origins:', allowedOrigins);
      // For debugging, temporarily allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Explicit CORS preflight handler
app.options('*', cors(corsOptions));

// Additional CORS headers middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// Connect to MongoDB (with connection caching for serverless)
let isConnected = false;

const connectToDatabase = async () => {
  if (isConnected) {
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/attend-db';
    await mongoose.connect(mongoUri, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0
    });
    isConnected = true;
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

// Middleware to ensure database connection
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('Database connection failed:', error);
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(500).json({ 
      error: 'Database connection failed',
      message: error.message,
      mongoUri: process.env.MONGODB_URI ? 'Set' : 'Not set'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.json({
    status: 'ok',
    service: 'attendance-system',
    timestamp: new Date().toISOString(),
    server: 'Attend Backend API (Vercel)',
    version: '1.0.0',
    mongodb: isConnected ? 'connected' : 'disconnected',
    env: {
      nodeEnv: process.env.NODE_ENV,
      mongoUri: process.env.MONGODB_URI ? 'configured' : 'missing',
      jwtSecret: process.env.JWT_SECRET ? 'configured' : 'missing',
      corsOrigin: process.env.CORS_ORIGIN || 'not set'
    }
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Attend - QR Code Attendance Tracking API',
    version: '1.0.0',
    status: 'running'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/qrcodes', qrCodeRoutes);
app.use('/api/locations', locationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle 404
app.use((req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(404).json({
    message: 'Endpoint not found',
    path: req.path
  });
});

module.exports = app;
