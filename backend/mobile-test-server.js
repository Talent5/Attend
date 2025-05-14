const express = require('express');
const app = express();
const os = require('os');

// Get the server's IP addresses
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

// Simple root endpoint with detailed info
app.get('/', (req, res) => {
  // Get connection info
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const origin = req.headers.origin || 'No origin';
  
  // Get server info
  const serverIPs = getNetworkIPs();
  
  // Prepare response data
  const data = {
    message: 'Connection test successful!',
    serverTime: new Date().toISOString(),
    connection: {
      clientIP,
      userAgent,
      origin,
      headers: req.headers
    },
    server: {
      networkInterfaces: serverIPs,
      hostname: os.hostname(),
      platform: os.platform(),
      nodeVersion: process.version
    }
  };
  
  // Log the connection
  console.log(`Connection from ${clientIP} (${userAgent})`);
  
  // Send the response
  res.json(data);
});

// CORS middleware to allow all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Start the server on port 5050 (different from your main app)
const PORT = 5050;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
=========================================
  MOBILE CONNECTION TEST SERVER
=========================================
Server running on port ${PORT}

Available on the following addresses:
${getNetworkIPs().map(ip => `- http://${ip.address}:${PORT}`).join('\n')}

To test:
1. On your mobile device, open a browser
2. Visit one of the above URLs
3. You should see connection details if successful

If you can't connect:
- Ensure your phone is on the same WiFi network
- Check if Windows Firewall is blocking connections
- Try temporarily disabling the firewall

Press Ctrl+C to stop the server
=========================================
`);
});