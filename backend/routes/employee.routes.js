const express = require('express');
const router = express.Router();
const Employee = require('../models/employee.model');
const { authenticate, isAdmin } = require('../middlewares/auth.middleware');
const { validateEmail } = require('../middlewares/validation.middleware');

// Get all employees (admin only)
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    // Support filtering and pagination
    const { page = 1, limit = 10, search, department, role, isActive } = req.query;
    const skip = (page - 1) * limit;
    
    // Build filter query
    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (department) filter.department = department;
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    // Get employees with pagination
    const employees = await Employee.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Employee.countDocuments(filter);
    
    res.json({
      employees,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Server error while fetching employees' });
  }
});

// Get employee by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Admin or super_admin can access any employee, regular employees can only access their own data
    if (req.employee.role !== 'admin' && req.employee.role !== 'super_admin' && req.employee._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const employee = await Employee.findById(req.params.id).select('-password');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ message: 'Server error while fetching employee' });
  }
});

// Create new employee (admin only)
router.post('/', authenticate, isAdmin, validateEmail, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if employee with same email already exists
    const existingEmployee = await Employee.findOne({ email });
    
    if (existingEmployee) {
      return res.status(400).json({ 
        message: 'Employee with this email already exists' 
      });
    }
    
    // Generate a temporary password if not provided
    let tempPassword = null;
    if (!req.body.password) {
      // Generate a random password (at least 8 characters to meet minlength requirement)
      tempPassword = Math.random().toString(36).substring(2, 10);
      req.body.password = tempPassword;
    } else if (req.body.password.length < 6) {
      // Ensure password meets minimum length requirement
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      });
    }
    
    // Set firstLogin to true for new employees
    req.body.firstLogin = true;
    
    // Create new employee
    const employee = new Employee(req.body);
    await employee.save();
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('employee:created', {
        _id: employee._id,
        name: employee.name,
        department: employee.department,
        role: employee.role
      });
    }
    
    res.status(201).json({
      message: 'Employee created successfully',
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        department: employee.department,
        position: employee.position,
        role: employee.role,
        isActive: employee.isActive,
        firstLogin: employee.firstLogin
      },
      tempPassword: tempPassword // Include temporary password in response
    });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ message: 'Server error while creating employee' });
  }
});

// Update own profile (for employees)
router.put('/profile/me', authenticate, async (req, res) => {
  try {
    const updateData = req.body;
    
    // Only allow updating specific fields for profile updates
    const allowedFields = ['name', 'phone', 'phoneNumber', 'address', 'department', 'position'];
    const filteredData = {};
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });
    
    // Remove sensitive fields that shouldn't be updated directly
    delete filteredData.password;
    delete filteredData.role;
    delete filteredData.isActive;
    delete filteredData.email;
    
    const employee = await Employee.findByIdAndUpdate(
      req.employee._id,
      filteredData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.json({
      message: 'Profile updated successfully',
      employee
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// Change own password (for employees)
router.put('/profile/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }
    
    // Find the employee
    const employee = await Employee.findById(req.employee._id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await employee.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    employee.password = newPassword;
    await employee.save();
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error while changing password' });
  }
});

// Update employee (admin only)
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.password;
    delete updateData.role; // Role updates should go through separate endpoint
    
    // Find the current employee to check if status is changing
    const currentEmployee = await Employee.findById(id);
    if (!currentEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Update the employee with new data
    
    const employee = await Employee.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.json({
      message: 'Employee updated successfully',
      employee
    });
  } catch (error) {
    console.error('Update employee error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error while updating employee' });
  }
});

// Delete employee (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    // First find the employee to check if they exist
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Delete all attendance records associated with this employee
    const Attendance = require('../models/attendance.model');
    await Attendance.deleteMany({ employeeId: req.params.id });
    
    // Delete the employee
    await Employee.findByIdAndDelete(req.params.id);
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('employee:deleted', { _id: req.params.id });
    }
    
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ message: 'Server error while deleting employee' });
  }
});

// Get employee statistics (admin only)
router.get('/stats/summary', authenticate, isAdmin, async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ isActive: true });
    const adminCount = await Employee.countDocuments({ role: 'admin' });
    
    // Get department distribution
    const departmentStats = await Employee.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      totalEmployees,
      activeEmployees,
      adminCount,
      departments: departmentStats
    });
  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({ message: 'Server error while fetching employee statistics' });
  }
});

// Reset employee password (admin only)
router.post('/:id/reset-password', authenticate, isAdmin, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Generate a random temporary password (8 characters)
    const tempPassword = Math.random().toString(36).slice(-8);
    
    // Update employee with new password and set firstLogin flag
    employee.password = tempPassword;
    employee.firstLogin = true;
    await employee.save();
    
    // In a real-world application, you would send an email to the employee with their new password
    // For this exercise, we'll just return it in the response
    
    res.json({
      message: 'Password reset successfully',
      tempPassword: tempPassword,
      email: employee.email
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error while resetting password' });
  }
});

module.exports = router;