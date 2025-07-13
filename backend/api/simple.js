// Ultra-simplified Vercel API for testing
const express = require('express');
const cors = require('cors');

const app = express();

// Ultra-simple CORS - allow everything
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

app.use(express.json());

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'attendance-system-simplified',
    timestamp: new Date().toISOString()
  });
});

// Simple auth endpoint for testing
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Simple test credentials
  if (email === 'admin@test.com' && password === 'test123') {
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: '1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin'
      },
      token: 'test-jwt-token'
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Attend API - Simplified Version',
    version: '1.0.0'
  });
});

// Catch all
app.use((req, res) => {
  res.status(404).json({
    message: 'Not found',
    path: req.path
  });
});

module.exports = app;
