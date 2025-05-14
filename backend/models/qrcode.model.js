const mongoose = require('mongoose');
const crypto = require('crypto');

// Function to generate a human-readable alphanumeric code
function generateShortCode(length = 6) {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters like O/0, 1/I
  let result = '';
  const charactersLength = characters.length;
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  
  return result;
}

const QRCodeSchema = new mongoose.Schema({
  qrCodeId: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(8).toString('hex')
  },
  shortCode: {
    type: String,
    unique: true,
    default: () => generateShortCode(6)
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  description: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['session', 'employee-specific'],
    default: 'session'
  },
  specificEmployee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  imageUrl: {
    type: String
  }
}, {
  timestamps: true
});

// Method to check if QR code is valid
QRCodeSchema.methods.isValid = function() {
  const now = new Date();
  return this.isActive && now >= this.validFrom && now <= this.validUntil;
};

const QRCode = mongoose.model('QRCode', QRCodeSchema);

module.exports = QRCode;