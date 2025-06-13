// Test script to verify dashboard API endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// You'll need to get a valid JWT token first by logging in
const TEST_TOKEN = 'your_jwt_token_here'; // Replace with actual token

const testEndpoints = async () => {
  const headers = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Testing attendance endpoints...\n');

    // Test /attendance/me endpoint (for regular users)
    console.log('1. Testing /attendance/me endpoint:');
    try {
      const response = await axios.get(`${BASE_URL}/attendance/me?limit=5`, { headers });
      console.log('Response status:', response.status);
      console.log('Data structure:');
      console.log('- Records count:', response.data.records?.length || 0);
      console.log('- todayCheckedIn:', response.data.todayCheckedIn);
      console.log('- todayStatus:', response.data.todayStatus);
      if (response.data.records && response.data.records.length > 0) {
        console.log('- First record sample:', {
          id: response.data.records[0]._id,
          type: response.data.records[0].type,
          timestamp: response.data.records[0].timestamp,
          location: response.data.records[0].location
        });
      }
    } catch (error) {
      console.error('Error:', error.response?.data || error.message);
    }

    console.log('\n2. Testing /attendance/me/monthly endpoint:');
    try {
      const response = await axios.get(`${BASE_URL}/attendance/me/monthly`, { headers });
      console.log('Response status:', response.status);
      console.log('Monthly stats:');
      console.log('- Present days:', response.data.presentDays);
      console.log('- Absent days:', response.data.absentDays);
      console.log('- Total days:', response.data.totalDays);
      console.log('- Attendance percentage:', response.data.attendancePercentage);
    } catch (error) {
      console.error('Error:', error.response?.data || error.message);
    }

    console.log('\n3. Testing /attendance/stats/summary endpoint (admin):');
    try {
      const response = await axios.get(`${BASE_URL}/attendance/stats/summary`, { headers });
      console.log('Response status:', response.status);
      console.log('Stats summary:');
      console.log('- Today attendance:', response.data.todayAttendance);
      console.log('- On time:', response.data.onTime);
      console.log('- Late:', response.data.late);
      console.log('- Total employees:', response.data.totalEmployees);
      console.log('- Active employees:', response.data.activeEmployees);
    } catch (error) {
      console.error('Error:', error.response?.data || error.message);
    }

    console.log('\n4. Testing /attendance endpoint (admin):');
    try {
      const response = await axios.get(`${BASE_URL}/attendance?limit=5`, { headers });
      console.log('Response status:', response.status);
      console.log('Recent attendance records:');
      console.log('- Records count:', response.data.records?.length || 0);
      if (response.data.records && response.data.records.length > 0) {
        console.log('- First record sample:', {
          id: response.data.records[0]._id,
          type: response.data.records[0].type,
          timestamp: response.data.records[0].timestamp,
          employee: response.data.records[0].employee?.name || response.data.records[0].employeeId?.name
        });
      }
    } catch (error) {
      console.error('Error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('Overall error:', error.message);
  }
};

console.log('Dashboard API Test Script');
console.log('========================');
console.log('Before running this script:');
console.log('1. Make sure the backend server is running on port 5000');
console.log('2. Replace TEST_TOKEN with a valid JWT token');
console.log('3. Run: node test-dashboard-api.js');
console.log('');

// Uncomment the line below after setting up the token
// testEndpoints();
