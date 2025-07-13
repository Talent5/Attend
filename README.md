# Attend - QR Code Attendance System

A modern attendance tracking system using QR codes for seamless check-ins and check-outs with comprehensive administration tools.

![Attend Logo](frontend/src/assets/logo.png)

## Overview

Attend is a full-stack web application designed to streamline attendance tracking in organizations. The system supports QR code scanning for flexible attendance recording, with real-time tracking, reporting, and analytics features.

## Features

### Employee Features
- **📱 QR Code Scanning**: Quick check-in/check-out via smartphone camera
- **✏️ Manual Entry Option**: Alternative check-in method when QR scanning isn't possible
- **📍 Location-based Attendance**: Records location data with each authentication
- **📊 Attendance History**: View personal attendance records with filtering options
- **👤 Profile Management**: Edit personal information and view attendance stats
- **⚡ Real-time Status**: Instant confirmation of attendance status

### Admin Features
- **📈 Dashboard Overview**: At-a-glance view of attendance statistics and recent activity
- ** QR Code Management**: Generate, activate/deactivate, and delete QR codes for different locations
- **👥 Employee Management**: Add, edit, and manage employee profiles
- **🏢 Location Management**: Create and manage multiple locations for attendance tracking
- **🔍 Attendance Monitoring**: View and filter attendance records by date, employee, location
- **📋 Reports & Analytics**: View attendance statistics, trends, and generate comprehensive reports
- **⚙️ System Settings**: Configure attendance rules and notifications

### Technical Features
- **🔄 Real-time Updates**: Socket.io integration for live attendance updates
- **🌐 Network Auto-Detection**: Smart IP address detection for seamless connectivity across different networks
- **🔗 Cross-Network Compatibility**: Works across different devices on the same network with minimal configuration
- **📱 Responsive UI**: Works on desktop and mobile devices
- **🔒 Secure Authentication**: JWT-based authentication with role-based access control
- **📊 Data Export**: Export attendance data to CSV for further analysis
- **⚙️ Customizable Settings**: Configure attendance rules and late check-in thresholds
- **🌙 Dark/Light Mode**: Support for system theme preferences

## Tech Stack

### Frontend
- React.js
- React Router for navigation
- Context API for state management
- Tailwind CSS for styling
- HTML5 QR Code Scanner for QR scanning
- Chart.js for data visualization

### Backend
- Node.js with Express
- MongoDB for database
- Mongoose for object modeling
- JWT for authentication
- Socket.io for real-time updates
- QRCode.js for QR code generation

## Installation & Setup

### Prerequisites
- Node.js (v14+)
- MongoDB
- npm or yarn

### Backend Setup
1. Navigate to the backend directory
   ```
   cd backend
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the backend directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/attend-db
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRY=24h
   CLIENT_URL=http://localhost:3000
   ```

4. Start the server
   ```
   npm start
   ```
   For development with auto-restart:
   ```
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory
   ```
   cd frontend
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the frontend directory with the following variables:
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   REACT_APP_SOCKET_URL=http://localhost:5000
   ```

4. Start the development server
   ```
   npm start
   ```

5. Build for production
   ```
   npm run build
   ```

## System Architecture

The application follows a client-server architecture:

- **Client-side**: React.js application served statically
- **Server-side**: Node.js + Express API server connected to MongoDB
- **Communication**: RESTful API + WebSocket for real-time updates

### Database Schema

The main entities in the system are:

1. **Employee**: User accounts with roles (admin/employee) and fingerprint enrollment status
2. **Attendance**: Check-in/check-out records linked to employees, QR codes, or fingerprint IDs
3. **QRCode**: Generated QR codes with validity periods (legacy support)
4. **Fingerprint**: Biometric registration linking fingerprint IDs to employees
5. **Location**: Physical locations where attendance is tracked
6. **Settings**: System-wide configuration options

## API Endpoints

### Authentication
- `POST /api/auth/register`: Register a new employee
- `POST /api/auth/login`: Authenticate user and get token
- `GET /api/auth/me`: Get current user profile
- `POST /api/auth/change-password`: Change user password (first-time or regular change)

### Attendance
- `POST /api/attendance`: Log attendance (check-in/check-out)
- `GET /api/attendance/me`: Get current employee's attendance history
- `GET /api/attendance`: Get all attendance records (admin only)
- `GET /api/attendance/stats/summary`: Get attendance statistics (admin only)
- `GET /api/attendance/stats`: Get detailed attendance statistics (admin only)
- `GET /api/attendance/export`: Export attendance data as CSV (admin only)

### QR Codes
- `POST /api/qrcodes`: Create a new QR code (admin only)
- `GET /api/qrcodes`: Get all QR codes (admin only)
- `GET /api/qrcodes/:id`: Get QR code by ID
- `PUT /api/qrcodes/:id`: Update QR code (admin only)
- `DELETE /api/qrcodes/:id`: Delete QR code (admin only)
- `POST /api/qrcodes/validate`: Validate a QR code

### Locations
- `POST /api/locations`: Create a new location (admin only)
- `GET /api/locations`: Get all locations
- `PUT /api/locations/:id`: Update location (admin only)
- `DELETE /api/locations/:id`: Delete location (admin only)

### Employees
- `GET /api/employees`: Get all employees (admin only)
- `GET /api/employees/stats`: Get employee statistics (admin only)
- `GET /api/employees/:id`: Get employee by ID (admin only)
- `PUT /api/employees/:id`: Update employee (admin only)
- `DELETE /api/employees/:id`: Delete employee (admin only)

## Dashboard Features

The admin dashboard provides a comprehensive overview of the attendance system:

- **Key Statistics**: Shows total employees, attendance percentages, active QR codes, and locations
- **Quick Actions**: Fast access to common tasks like adding employees or generating QR codes
- **Recent Activity**: Real-time view of the latest check-ins and check-outs
- **Data Visualization**: Charts showing attendance trends and patterns
- **Status Indicators**: Visual indicators for on-time, late, and absent employees

## Deployment

### Backend Deployment
1. Set up a production MongoDB database
2. Configure environment variables for production
3. Deploy the Node.js application to your preferred hosting platform (AWS, Heroku, DigitalOcean, etc.)

### Frontend Deployment
1. Build the React application:
   ```
   cd frontend
   npm run build
   ```
2. Deploy the static files in the `build` folder to a web server or CDN

## Admin Account Setup

To create an initial admin account, use the `create-super-admin.js` script:

```bash
cd backend
node create-super-admin.js
```

Follow the prompts to create the first admin user.

## QR Code Generation

QR codes can be generated using the admin interface or the command-line script for testing:

```bash
cd backend
node generate-qrcode.js
```

QR codes contain encrypted information about:
- Location ID
- Timestamp of generation
- Unique identifier
- Expiration details

## Security Considerations

- All API endpoints are protected with JWT authentication
- Admin-only routes are protected with role-based middleware
- QR codes have expiration dates and can be deactivated
- Passwords are hashed using bcrypt
- Rate limiting is implemented to prevent brute force attacks
- First-time login requires password change
- Session timeout for inactive users

## Mobile Responsiveness

The application is fully responsive and works well on:
- Desktop computers
- Tablets
- Mobile phones (optimized for QR scanning)

## Mobile Connection Troubleshooting

When using the mobile app in a local network environment, you might encounter connection issues. The application includes built-in network diagnostics to help troubleshoot these problems:

### Common Issues and Solutions

1. **Same Network Requirement**: Ensure your mobile device and the server are connected to the same WiFi network
2. **Firewall Settings**: Check that your computer's firewall allows connections on ports 3000 (frontend) and 5000 (backend)
3. **Direct IP Connection**: For local networks, you may need to connect using the server's local IP address instead of localhost
4. **Network Diagnostics Tool**: Access the built-in network diagnostics by clicking the logo 5 times on the login screen

### Using the Network Diagnostics Feature

The application includes a special network diagnostics mode that helps identify and fix connection issues:

1. On the login screen, tap the logo icon 5 times quickly
2. Review the connection details displayed
3. Follow the suggested fixes for your specific connection problem
4. Use the "Diagnose Connection Issues" option when prompted for more detailed analysis

## Local Network Setup

To optimize the application for use in a local network environment:

1. Run the backend server script:
   ```
   cd backend
   npm run start-network
   ```

2. In a separate terminal, start the frontend:
   ```
   cd frontend
   npm run start-network
   ```

3. These scripts will automatically configure the correct IP addresses for your local network environment

## Future Enhancements

- **Geofencing**: Restrict check-ins to specific geographic boundaries
- **Biometric Integration**: Add support for fingerprint or facial recognition
- **Automated Reporting**: Scheduled email reports to administrators
- **Leave Management**: Integrate with vacation and sick leave tracking
- **Mobile App**: Native mobile applications for iOS and Android
- **Webhooks**: Integration with third-party HR and payroll systems

## License

[MIT License](LICENSE)

## Contributors

- Takunda Mundwa - Lead Developer

## Support

For issues, feature requests, or questions, please open an issue on the GitHub repository or contact support@attend-app.com.

## Last Updated

May 11, 2025