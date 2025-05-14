const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Employee = require('../models/employee.model');
const { authenticate, isAdmin, isSuperAdmin } = require('../middlewares/auth.middleware');

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }
    
    // Find employee by email
    const employee = await Employee.findOne({ email });
    
    if (!employee) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    if (!employee.isActive) {
      return res.status(401).json({ message: 'Account is disabled. Please contact administrator.' });
    }
    
    // Check password
    const isMatch = await employee.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: employee._id, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    // Return token and employee data (excluding password)
    const employeeData = {
      _id: employee._id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      position: employee.position,
      profileImage: employee.profileImage,
      firstLogin: employee.firstLogin
    };
    
    res.json({
      token,
      employee: employeeData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Admin Login route
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }
    
    // Find admin by email
    const admin = await Employee.findOne({ 
      email,
      role: { $in: ['admin', 'super_admin'] }
    });
    
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials or insufficient privileges' });
    }
    
    if (!admin.isActive) {
      return res.status(401).json({ message: 'Account is disabled. Please contact super administrator.' });
    }
    
    // Check password
    const isMatch = await admin.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    // Return token and admin data (excluding password)
    const adminData = {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      department: admin.department,
      position: admin.position,
      profileImage: admin.profileImage,
      firstLogin: admin.firstLogin
    };
    
    res.json({
      token,
      admin: adminData
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error during admin login' });
  }
});

// Register route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, department, position } = req.body;
    
    // Check if employee with same email already exists
    const existingEmployee = await Employee.findOne({ email });
    
    if (existingEmployee) {
      return res.status(400).json({ 
        message: 'An employee with this email already exists'
      });
    }
    
    // Create new employee
    const employee = new Employee({
      name,
      email,
      password,
      department,
      position,
      role: 'employee' // Default role
    });
    
    await employee.save();
    
    res.status(201).json({
      message: 'Registration successful',
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        department: employee.department,
        position: employee.position
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Get current employee profile
router.get('/me', authenticate, async (req, res) => {
  try {
    // req.employee is set by the authenticate middleware
    res.json(req.employee);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get employee with password
    const employee = await Employee.findById(req.employee._id);
    
    // Check current password
    const isMatch = await employee.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    employee.password = newPassword;
    await employee.save();
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error during password change' });
  }
});

// Change password (first login)
router.post('/first-time-password-change', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get employee with password
    const employee = await Employee.findById(req.employee._id);
    
    // Check if this is actually a first login
    if (!employee.firstLogin) {
      return res.status(400).json({ 
        message: 'This is not a first-time login. Please use the regular password change route.'
      });
    }
    
    // Check current password
    const isMatch = await employee.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password and set firstLogin to false
    employee.password = newPassword;
    employee.firstLogin = false;
    await employee.save();
    
    // Generate a new token that includes the updated firstLogin status
    const token = jwt.sign(
      { id: employee._id, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    // Return updated employee data
    const employeeData = {
      _id: employee._id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      position: employee.position,
      profileImage: employee.profileImage,
      firstLogin: false
    };
    
    res.json({ 
      message: 'Password updated successfully',
      token,
      employee: employeeData
    });
  } catch (error) {
    console.error('First-time password change error:', error);
    res.status(500).json({ message: 'Server error during password change' });
  }
});

// Create Super Admin (Only first-time setup or by existing super admin)
router.post('/create-super-admin', async (req, res) => {
  try {
    const { name, email, password, secretKey } = req.body;

    // Verify correct secret key (this should be set in your environment variables for security)
    if (secretKey !== process.env.SUPER_ADMIN_SECRET_KEY) {
      return res.status(401).json({ message: 'Invalid secret key' });
    }
    
    // Check if any super admin already exists
    const existingSuperAdmin = await Employee.findOne({ role: 'super_admin' });
    
    // If a super admin exists, only another super admin can create one
    if (existingSuperAdmin) {
      // This logic would require auth middleware and validation that the user is a super_admin
      // But we're implementing a simpler version for the first super admin creation
      return res.status(400).json({ 
        message: 'A super admin already exists. Only existing super admins can create more super admins.'
      });
    }

    // Check if employee with same email already exists
    const existingEmployee = await Employee.findOne({ email });
    
    if (existingEmployee) {
      return res.status(400).json({ 
        message: 'An employee with this email already exists'
      });
    }
    
    // Create super admin
    const superAdmin = new Employee({
      name,
      email,
      password,
      department: 'Administration',
      position: 'Super Administrator',
      role: 'super_admin'
    });
    
    await superAdmin.save();
    
    res.status(201).json({
      message: 'Super Admin created successfully',
      admin: {
        _id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role
      }
    });
  } catch (error) {
    console.error('Super Admin creation error:', error);
    res.status(500).json({ message: 'Server error during Super Admin creation' });
  }
});

// Additional route for super admin to create regular admins
router.post('/create-admin', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, department, position } = req.body;
    
    // Check if employee with same email already exists
    const existingEmployee = await Employee.findOne({ email });
    
    if (existingEmployee) {
      return res.status(400).json({ 
        message: 'An employee with this email already exists'
      });
    }
    
    // Create admin user
    const admin = new Employee({
      name,
      email,
      password,
      department,
      position,
      role: 'admin' // Setting role as admin
    });
    
    await admin.save();
    
    res.status(201).json({
      message: 'Admin created successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        department: admin.department,
        position: admin.position
      }
    });
  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({ message: 'Server error during admin creation' });
  }
});

// Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    // Extract token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find the employee
    const employee = await Employee.findById(decoded.id).select('-password');
    
    if (!employee) {
      return res.status(401).json({ message: 'Employee not found' });
    }
    
    if (!employee.isActive) {
      return res.status(401).json({ message: 'Account is disabled' });
    }
    
    // Generate a new token
    const newToken = jwt.sign(
      { id: employee._id, role: employee.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    // Return the new token and employee data
    res.json({
      token: newToken,
      employee: employee
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    // Handle jwt specific errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    res.status(500).json({ message: 'Server error during token refresh' });
  }
});

// Logout route
router.post('/logout', authenticate, async (req, res) => {
  try {
    // We don't need to do much on the server side for logout
    // The client will remove the token from storage
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

module.exports = router;