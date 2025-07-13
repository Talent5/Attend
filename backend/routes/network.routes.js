const express = require('express');
const router = express.Router();
const os = require('os');

/**
 * @route GET /api/network-test
 * @desc Test network connectivity
 * @access Public
 */
router.get('/test', (req, res) => {
  try {
    // Get network interfaces for debugging
    const getNetworkIPs = () => {
      const interfaces = os.networkInterfaces();
      const addresses = [];
      
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          // Skip over non-IPv4 and internal (loopback) addresses
          if (iface.family === 'IPv4' && !iface.internal) {
            addresses.push({
              name: name,
              address: iface.address
            });
          }
        }
      }
      
      return addresses;
    };

    // Get connection details
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    // Response data
    const responseData = {
      status: "success",
      message: "Network connection test successful",
      server: {
        timestamp: new Date().toISOString(),
        hostname: os.hostname(),
        platform: os.platform(),
        interfaces: getNetworkIPs()
      },
      client: {
        ip: clientIP,
        userAgent: userAgent,
        headers: req.headers
      }
    };
    
    // Log the successful test
    console.log(`Network test from ${clientIP} (${userAgent.substring(0, 50)}...)`);
    
    // Send response
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Network test error:', error);
    res.status(500).json({ 
      status: "error",
      message: "Network test failed",
      error: error.message
    });
  }
});

/**
 * @route GET /api/network-test
 * @desc Simple network connectivity test
 * @access Public
 */
router.get('/network-test', (req, res) => {
  res.json({
    status: "success",
    message: "Network connection successful",
    timestamp: new Date().toISOString(),
    server: "Attend Backend API"
  });
});

// Alternative route for HEAD requests
router.head('/network-test', (req, res) => {
  res.status(200).end();
});

module.exports = router;