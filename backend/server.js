const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const https = require('https'); 
const fs = require('fs');
const path = require('path');
const socketIo = require('socket.io');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const qrCodeRoutes = require('./routes/qrcode.routes');
const locationRoutes = require('./routes/location.routes');

// Initialize environment variables
dotenv.config();

// Set to development mode by default if not specified
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Express app
const app = express();

// Check if SSL certificates exist for HTTPS
const certsPath = path.join(__dirname, '..', 'certificates');
const useHttps = process.env.USE_HTTPS === 'true' || false;

let server;

if (useHttps && fs.existsSync(path.join(certsPath, 'cert.pem')) && fs.existsSync(path.join(certsPath, 'key.pem'))) {
  // HTTPS options
  const httpsOptions = {
    key: fs.readFileSync(path.join(certsPath, 'key.pem')),
    cert: fs.readFileSync(path.join(certsPath, 'cert.pem'))
  };
  console.log('Starting server with HTTPS...');
  server = https.createServer(httpsOptions, app);
} else {
  console.log('Starting server with HTTP...');
  server = http.createServer(app);
}

// Basic CORS configuration - simplified to avoid potential issues
const corsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'X-Mobile-Device'],
  optionsSuccessStatus: 204,
  maxAge: 86400 // CORS preflight results cache time (24 hours)
};

// Initialize Socket.io with safe settings
const io = socketIo(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  path: '/socket.io'
});

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per IP
});

// Basic middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', apiLimiter);

// Simple logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// Routes - using standard Express routing
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/qrcodes', qrCodeRoutes);
app.use('/api/locations', locationRoutes);

// Import and use the network routes with detailed diagnostics
const networkRoutes = require('./routes/network.routes');
app.use('/api', networkRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Attend - QR Code Attendance Tracking API' });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Make io accessible throughout the app
app.set('io', io);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attend-db')
  .then(() => {
    console.log('Connected to MongoDB database');
    
    // Start server
    const PORT = process.env.PORT || 5000;
    
    // Improved port handling - will try alternate ports if default is in use
    const startServer = (port) => {
      server.listen(port, '0.0.0.0')
        .on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            // Port is in use, try the next one
            console.warn(`Port ${port} is already in use. Trying port ${port + 1}...`);
            startServer(port + 1);
          } else {
            console.error('Server error:', err);
            process.exit(1);
          }
        })
        .on('listening', () => {
          const actualPort = server.address().port;
          console.log(`Server running on port ${actualPort}`);
          const protocol = useHttps ? 'https' : 'http';
          console.log(`Access locally via: ${protocol}://localhost:${actualPort}`);
          
          // Display local IP addresses
          try {
            const { networkInterfaces } = require('os');
            const nets = networkInterfaces();
            const localIPs = [];
            
            for (const name of Object.keys(nets)) {
              for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                  localIPs.push(net.address);
                }
              }
            }
            
            if (localIPs.length > 0) {
              console.log('Available on local network at:');
              localIPs.forEach(ip => {
                console.log(`  - ${protocol}://${ip}:${actualPort}`);
              });
              console.log('\nMobile devices can connect to any of these addresses.');
            }
          } catch (err) {
            console.log('Could not determine local IP addresses:', err.message);
          }
        });
    };
    
    // Start the server with the initial port
    startServer(PORT);
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Simple error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

module.exports = { app, server, io };