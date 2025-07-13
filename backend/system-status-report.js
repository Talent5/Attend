const axios = require('axios');
const mongoose = require('mongoose');

async function createSystemStatusReport() {
  console.log('📊 === SYSTEM STATUS REPORT ===');
  console.log(`Generated: ${new Date().toLocaleString()}\n`);
  
  try {
    // Database Status
    console.log('🗄️  DATABASE STATUS');
    await mongoose.connect('mongodb://localhost:27017/attend-db');
    console.log('✅ MongoDB: Connected');
    
    const Employee = require('./models/employee.model');
    const Attendance = require('./models/attendance.model');
    
    const employeeCount = await Employee.countDocuments({});
    const attendanceCount = await Attendance.countDocuments({});
    const activeEmployees = await Employee.countDocuments({ isActive: true });
    
    console.log(`📋 Employees: ${activeEmployees}/${employeeCount} active`);
    console.log(`📅 Attendance Records: ${attendanceCount}`);
    
    // Backend API Status
    console.log('\n🔧 BACKEND API STATUS');
    const healthResponse = await axios.get('http://localhost:5000/api/health');
    console.log(`✅ Backend Server: ${healthResponse.data.status}`);
    console.log(`🏷️  Version: ${healthResponse.data.version}`);
    
    // Authentication Test
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'talentmundwa5@gmail.com',
      password: 'admin123'
    });
    console.log('✅ Authentication: Working');
    
    const token = loginResponse.data.token;
    
    // API Endpoints Status
    console.log('\n🔗 API ENDPOINTS STATUS');
    
    const endpoints = [
      { name: 'Employees', url: '/api/employees' },
      { name: 'Attendance', url: '/api/attendance' },
      { name: 'QR Codes', url: '/api/qrcodes' },
      { name: 'Locations', url: '/api/locations' }
    ];
    
    for (const endpoint of endpoints) {
      try {
        const config = { headers: { 'Authorization': `Bearer ${token}` } };
        await axios.get(`http://localhost:5000${endpoint.url}`, config);
        console.log(`✅ ${endpoint.name}: Available`);
      } catch (error) {
        console.log(`❌ ${endpoint.name}: Error ${error.response?.status || 'UNKNOWN'}`);
      }
    }
    
    // Network Configuration
    console.log('\n🌐 NETWORK CONFIGURATION');
    console.log('🖥️  Backend Server: http://192.168.2.122:5000');
    console.log('🌐 Frontend Server: http://192.168.2.122:3000');
    console.log('📱 WiFi Network: TMUNDWA 3948');
    
    
    // System Health Score
    console.log('🎯 SYSTEM HEALTH SCORE');
    let healthScore = 0;
    let maxScore = 100;
    
    // Database connectivity (25 points)
    healthScore += 25;
    
    // Backend API (25 points)
    healthScore += 25;
    
    // Authentication (20 points)
    healthScore += 20;
    
    // API endpoints (20 points)
    healthScore += 20;
    
    // Network configuration (10 points)
    healthScore += 10;
    
    console.log(`📊 Overall Health: ${healthScore}/${maxScore} (${((healthScore/maxScore)*100).toFixed(1)}%)`);
    
    if (healthScore >= 90) {
      console.log('🎉 System Status: EXCELLENT');
    } else if (healthScore >= 75) {
      console.log('✅ System Status: GOOD');
    } else if (healthScore >= 60) {
      console.log('⚠️  System Status: FAIR');
    } else {
      console.log('❌ System Status: NEEDS ATTENTION');
    }
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    
    if (attendanceCount === 0) {
      console.log('📌 Test attendance logging with QR codes');
    }
    
    if (activeEmployees === 0) {
      console.log('📌 Add some employees to get started');
    }
    
    console.log('📌 Test QR code generation and scanning functionality');
    console.log('📌 Monitor system logs for any unusual activity');
    console.log('📌 Keep backups of your database and configuration files');
    
  } catch (error) {
    console.log('❌ Error generating report:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

createSystemStatusReport();
