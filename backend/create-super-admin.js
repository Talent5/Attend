// Create Super Admin Script
// Save this as create-super-admin.js in your backend folder

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const Employee = require('./models/employee.model');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const createSuperAdmin = async () => {
  try {
    // Check if a super admin already exists
    const existingSuperAdmin = await Employee.findOne({ role: 'super_admin' });
    
    if (existingSuperAdmin) {
      console.log('\nA super admin already exists with email:', existingSuperAdmin.email);
      console.log('You cannot create another super admin using this script.\n');
      process.exit(0);
    }

    console.log('\n=== Create Super Administrator ===\n');
    
    // Get user input
    rl.question('Enter super admin name: ', (name) => {
      rl.question('Enter super admin email: ', (email) => {
        rl.question('Enter super admin employee ID (optional, press Enter to skip): ', (employeeId) => {
          rl.question('Enter super admin password (min 8 characters): ', async (password) => {
            try {
              if (password.length < 8) {
                console.log('Password must be at least 8 characters long.');
                rl.close();
                process.exit(1);
              }

              // Debug: Log the input employeeId
              console.log(`Debug - Employee ID input: "${employeeId}", Length: ${employeeId.length}`);

              // First check if the email is already in use
              const existingEmail = await Employee.findOne({ email });
              if (existingEmail) {
                console.log(`\nError: An employee with email ${email} already exists\n`);
                rl.close();
                process.exit(1);
              }

              // Only check for employeeId if it's provided and not empty
              if (employeeId && employeeId.trim() !== '') {
                const existingId = await Employee.findOne({ employeeId: employeeId.trim() });
                if (existingId) {
                  console.log(`\nError: An employee with ID ${employeeId.trim()} already exists\n`);
                  rl.close();
                  process.exit(1);
                }
              }
              
              // Create super admin data object
              const superAdminData = {
                name,
                email,
                password,
                department: 'Administration',
                position: 'Super Administrator',
                role: 'super_admin',
                isActive: true
              };
              
              // Only add employeeId if it's not empty
              if (employeeId && employeeId.trim() !== '') {
                superAdminData.employeeId = employeeId.trim();
                console.log(`Debug - Adding employeeId: "${employeeId.trim()}" to record`);
              } else {
                console.log('Debug - No employeeId provided, creating admin without employeeId');
              }
              
              // Create and save the super admin
              const superAdmin = new Employee(superAdminData);
              await superAdmin.save();
              
              console.log('\nSuper Admin created successfully!');
              console.log('Name:', name);
              console.log('Email:', email);
              if (employeeId && employeeId.trim() !== '') {
                console.log('Employee ID:', employeeId.trim());
              } else {
                console.log('Employee ID: None (not provided)');
              }
              console.log('\nYou can now log in to the admin portal with these credentials.\n');
              
              rl.close();
              process.exit(0);
            } catch (error) {
              console.error('Error creating super admin:', error);
              rl.close();
              process.exit(1);
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Error in create super admin script:', error);
    rl.close();
    process.exit(1);
  }
};

// Run the function
createSuperAdmin();