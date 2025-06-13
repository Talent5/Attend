# Attend System Startup Scripts

This folder contains several scripts to easily start the Attend system with different configurations.

## Available Startup Options

### Basic Startup (Local Development)

To start the system for local development:

```
startall.bat
```

This will start both the backend and frontend servers on your local machine:
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

### HTTPS Startup (Secure)

To start the system with secure HTTPS connections:

```
startall-https.bat
```

This requires certificate files in the `certificates` folder. The system will be available at:
- Backend: https://localhost:5000
- Frontend: https://localhost:3000

### Network Startup (LAN Access)

To make the system available to other devices on your network:

```
startall-network.bat
```

This binds the servers to all network interfaces (0.0.0.0), making them accessible from other devices on the same network.
- Backend: http://[YOUR-IP-ADDRESS]:5000
- Frontend: http://[YOUR-IP-ADDRESS]:3000

### Network Auto-Detection Mode

The system now uses auto-detection mode for network connectivity:

```
update-network-auto.bat
```

This script updates the network configuration to use auto-detection mode, which:
1. Automatically detects the best IP address for your current network
2. Works better when switching between different networks
3. Remembers successful connection settings between sessions
4. Helps troubleshoot connection issues with diagnostic tools

Auto-detection mode is now enabled by default when using any of the startup scripts.

### PowerShell Version

If you prefer PowerShell, you can use the PowerShell script instead:

```
.\startall.ps1
```

## Requirements

- Node.js and npm must be installed and available in your system PATH
- All necessary dependencies must be installed in both frontend and backend folders
  - Run `npm install` in both folders if you haven't already

## Troubleshooting

If you encounter issues:

1. Make sure all dependencies are installed in both frontend and backend folders
2. Check that no other services are using ports 3000 or 5000
3. For HTTPS mode, verify that certificate files exist and are properly configured
4. If experiencing network connectivity issues:
   - Ensure your device is on the same WiFi network as the server
   - Use the built-in NetworkDiagnostics tool in the app
   - Check if Windows Firewall is blocking connections
   - Try the auto-fix option in the NetworkDiagnostics tool 
5. If your IP address changes frequently:
   - The auto-detect mode will handle this automatically
   - Manual IP updates are no longer necessary

## Stopping the System

Press `Ctrl+C` in each terminal window to stop the servers, then type `Y` when prompted to terminate the batch job.
