const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const EmployeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['employee', 'admin', 'super_admin'],
    default: 'employee'
  },
  department: {
    type: String,
    trim: true
  },
  position: {
    type: String,
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  profileImage: {
    type: String,
    default: ''
  },  isActive: {
    type: Boolean,
    default: true
  },
  firstLogin: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
EmployeeSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords for login
EmployeeSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Employee = mongoose.model('Employee', EmployeeSchema);

// Drop the employeeId index if it exists to prevent duplicate key errors with null values
(async () => {
  try {
    await Employee.collection.dropIndex('employeeId_1')
      .then(() => console.log('Successfully dropped employeeId index'))
      .catch(err => {
        // Suppress error if index doesn't exist
        if (err.code !== 27 && !err.message.includes('index not found')) {
          console.error('Error dropping employeeId index:', err);
        } else {
          console.log('No employeeId index to drop or already dropped');
        }
      });
  } catch (error) {
    console.error('Error in index management:', error);
  }
})();

module.exports = Employee;