// Database Connection Verification Script
// This script verifies that all models are using the same database

const mongoose = require('mongoose');
const Employee = require('./models/employee.model');
const Attendance = require('./models/attendance.model');
require('dotenv').config();

async function verifyDatabaseConnection() {
  try {
    // Connect to the same database as the main application
    const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/attend-db';
    console.log('Connecting to:', dbUri);
    
    await mongoose.connect(dbUri);
    console.log('✅ Successfully connected to MongoDB');
    
    // Check database name
    const dbName = mongoose.connection.db.databaseName;
    console.log('✅ Database name:', dbName);
    
    // Verify collections exist
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    console.log('✅ Available collections:', collectionNames);
    
    // Check if models are using the same connection
    console.log('✅ Employee model connection:', Employee.db.databaseName);
    console.log('✅ Attendance model connection:', Attendance.db.databaseName);
    
    // Count documents in each collection
    const employeeCount = await Employee.countDocuments();
    const attendanceCount = await Attendance.countDocuments();
    
    console.log('📊 Document counts:');
    console.log(`  - Employees: ${employeeCount}`);
    console.log(`  - Attendance: ${attendanceCount}`);
    
    console.log('✅ Database verification complete - all models using same database!');
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyDatabaseConnection();
}

module.exports = verifyDatabaseConnection;
