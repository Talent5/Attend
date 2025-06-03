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
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins - add your phone's IP if needed
    const allowedOrigins = [
      'http://localhost:3000',
      'http://192.168.2.122:3000',
      'http://192.168.137.160:3000',
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost',
      'http://localhost:8080',
      'http://localhost:8100'
    ];
    
    console.log('Request origin:', origin);
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(null, true); // Temporarily allow all origins for testing
    }
  },
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
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(15 * 60 * 1000 / 1000) // retry after in seconds
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// More lenient rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 200 : 20, // More attempts for auth
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Very lenient rate limiting for QR code scanning
const qrLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: process.env.NODE_ENV === 'development' ? 500 : 50, // More scans allowed
  message: {
    error: 'Too many QR code scans, please wait a moment.',
    retryAfter: Math.ceil(5 * 60 * 1000 / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Basic middleware
app.use(cors(corsOptions));
app.use(express.json());

// Enhanced logging middleware
app.use((req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Client IP:', clientIP);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Origin:', req.headers.origin || 'No origin');
  console.log('User-Agent:', req.headers['user-agent'] || 'No user agent');
  next();
});

// Routes - using standard Express routing with specific rate limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/employees', apiLimiter, employeeRoutes);
app.use('/api/attendance', qrLimiter, attendanceRoutes);
app.use('/api/qrcodes', qrLimiter, qrCodeRoutes);
app.use('/api/locations', apiLimiter, locationRoutes);

// Import and use the network routes with detailed diagnostics
const networkRoutes = require('./routes/network.routes');
app.use('/api', networkRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Attend - QR Code Attendance Tracking API' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle HEAD requests to /api
app.head('/api', (req, res) => {
  res.status(200).end();
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
          
          // Display local IP addresses with more details
          try {
            const { networkInterfaces } = require('os');
            const nets = networkInterfaces();
            const localIPs = [];
            
            for (const name of Object.keys(nets)) {
              for (const net of nets[name]) {
                // Only get IPv4 addresses that are not internal
                if (net.family === 'IPv4' && !net.internal) {
                  localIPs.push({
                    interface: name,
                    address: net.address,
                    netmask: net.netmask,
                    mac: net.mac
                  });
                }
              }
            }
            
            if (localIPs.length > 0) {
              console.log('\nAvailable on local network at:');
              localIPs.forEach(ip => {
                console.log(`  - ${protocol}://${ip.address}:${actualPort} (${ip.interface})`);
              });
              console.log('\nNetwork Configuration:');
              localIPs.forEach(ip => {
                console.log(`  Interface: ${ip.interface}`);
                console.log(`  IP Address: ${ip.address}`);
                console.log(`  Netmask: ${ip.netmask}`);
                console.log(`  MAC: ${ip.mac}`);
              });
              console.log('\nMobile devices can connect to any of these addresses.');
              console.log('Make sure your phone is on the same network as this computer.');
              console.log('If still having issues:');
              console.log('1. Check if you can ping the server IP from your phone');
              console.log('2. Verify your phone is on the same WiFi network');
              console.log('3. Check if your firewall is blocking connections');
              console.log('4. Try disabling mobile data on your phone');
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