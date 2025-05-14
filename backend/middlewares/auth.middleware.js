const jwt = require('jsonwebtoken');
const Employee = require('../models/employee.model');

// Middleware to authenticate user using JWT
exports.authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Authentication failed. No token provided or invalid format.' 
      });
    }
    
    // Extract token
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find employee by id
    const employee = await Employee.findById(decoded.id).select('-password');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    if (!employee.isActive) {
      return res.status(401).json({ message: 'Account is disabled. Please contact administrator.' });
    }
    
    // Add employee to request object
    req.employee = employee;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    console.error('Authentication error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

// Middleware to check if user is admin
exports.isAdmin = (req, res, next) => {
  if (req.employee && (req.employee.role === 'admin' || req.employee.role === 'super_admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
};

// Middleware to check if user is super admin
exports.isSuperAdmin = (req, res, next) => {
  if (req.employee && req.employee.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Super administrator privileges required.' });
  }
};

// Middleware for handling JSON Web Token errors
exports.handleJwtError = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({ message: 'Invalid token' });
  } else {
    next(err);
  }
};