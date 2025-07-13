const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  checkIn: {
    type: Date,
    default: null
  },
  checkOut: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,  // Duration in minutes
    default: 0
  },
  location: {
    type: String,
    required: true
  },  qrCodeId: {
    type: String,
    ref: 'QRCode',
    default: null
  },
  authMethod: {
    type: String,
    enum: ['qr', 'manual'],
    default: 'qr'
  },
  coordinates: {
    latitude: {
      type: Number
    },
    longitude: {
      type: Number
    }
  },
  status: {
    type: String,
    enum: ['onTime', 'late', 'absent', 'leave'],
    default: 'onTime'
  },
  device: {
    type: Object,
    default: null
  },
  ipAddress: {
    type: String
  },
  locationName: {
    type: String
  }
}, {
  timestamps: true
});

// Index for quick lookups by employee and date
AttendanceSchema.index({ employeeId: 1, date: 1 });

const Attendance = mongoose.model('Attendance', AttendanceSchema);

module.exports = Attendance;