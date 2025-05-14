// Check for an admin user and create one if none exists
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Employee = require('./models/employee.model');

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attend';

async function checkAndCreateAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Check if any admin exists
    const adminExists = await Employee.findOne({
      role: { $in: ['admin', 'super_admin'] },
      isActive: true
    });
    
    if (adminExists) {
      console.log('Admin user already exists:');
      console.log(`- Email: ${adminExists.email}`);
      console.log(`- Role: ${adminExists.role}`);
      console.log('You can use these credentials to log in to the admin portal.');
    } else {
      // Create a new super admin
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const superAdmin = new Employee({
        name: 'Super Admin',
        email: 'admin@attend.com',
        password: hashedPassword,
        department: 'Administration',
        position: 'Super Administrator',
        role: 'super_admin',
        isActive: true
      });
      
      await superAdmin.save();
      
      console.log('🔑 Super admin created successfully:');
      console.log('- Email: admin@attend.com');
      console.log('- Password: admin123');
      console.log('⚠️ IMPORTANT: Please change this password immediately after first login!');
    }
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAndCreateAdmin();