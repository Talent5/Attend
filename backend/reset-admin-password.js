const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const Employee = require('./models/employee.model');

async function resetAdminPassword() {
  try {
    console.log('=== ADMIN PASSWORD RESET ===\n');
    
    // Find admin users
    const adminUsers = await Employee.find({
      role: { $in: ['admin', 'super_admin'] }
    });
    
    if (adminUsers.length === 0) {
      console.log('No admin users found!');
      return;
    }
    
    console.log(`Found ${adminUsers.length} admin user(s):`);
    adminUsers.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name} (${admin.email}) - ${admin.role}`);
    });
    
    // Reset password for all admin users to 'admin123'
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    for (const admin of adminUsers) {
      // Update password directly in database
      await Employee.findByIdAndUpdate(admin._id, {
        password: hashedPassword,
        firstLogin: false, // Set to false so they don't need to change it immediately
        isActive: true     // Ensure account is active
      });
      
      console.log(`✅ Password reset for ${admin.email}`);
    }
    
    console.log('\n=== RESET COMPLETE ===');
    console.log('All admin accounts now have password: admin123');
    console.log('\nYou can now log in with:');
    adminUsers.forEach(admin => {
      console.log(`- Email: ${admin.email}, Password: admin123`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

resetAdminPassword();
