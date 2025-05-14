const express = require('express');
const router = express.Router();
const QRCode = require('../models/qrcode.model');
const Location = require('../models/location.model');
const qrcode = require('qrcode');
const { authenticate, isAdmin } = require('../middlewares/auth.middleware');
const path = require('path');
const fs = require('fs');

// Calculate distance between two coordinates using the Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // in meters

  return distance;
}

// Generate a short code of given length
function generateShortCode(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
}

// Create QR code (admin only)
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, location, description, validUntil, type, specificEmployee } = req.body;
    
    // Validate inputs
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    
    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }
    
    // Check if location exists
    const locationExists = await Location.findById(location);
    if (!locationExists) {
      return res.status(400).json({ message: 'Location does not exist' });
    }
    
    if (!validUntil) {
      return res.status(400).json({ message: 'Validity period is required' });
    }
    
    // Create QR code record
    const qrCodeData = {
      name,
      location,
      description,
      validUntil: new Date(validUntil),
      createdBy: req.employee._id,
      type: type || 'session',
      shortCode: generateShortCode(6)  // Explicitly generate a shortCode
    };
    
    // Add specific employee if it's an employee-specific QR code
    if (type === 'employee-specific' && specificEmployee) {
      qrCodeData.specificEmployee = specificEmployee;
    }
    
    const qrCodeRecord = new QRCode(qrCodeData);
    await qrCodeRecord.save();
    
    // Generate QR code image
    const qrCodeUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/scan?qrCodeId=${qrCodeRecord.qrCodeId}`;
    const qrCodeImage = await qrcode.toDataURL(qrCodeUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    // Store QR code image URL in record
    qrCodeRecord.imageUrl = qrCodeImage;
    await qrCodeRecord.save();
    
    // Get the populated QR code to return to the client
    const populatedQRCode = await QRCode.findById(qrCodeRecord._id)
      .populate('location', 'name address')
      .populate('createdBy', 'name')
      .populate('specificEmployee', 'name employeeId');
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('qrcode:created', populatedQRCode);
    }
    
    res.status(201).json({
      message: 'QR code created successfully',
      qrCode: populatedQRCode
    });
  } catch (error) {
    console.error('Create QR code error:', error);
    res.status(500).json({ message: 'Server error while creating QR code' });
  }
});

// Get all QR codes (admin only)
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, isActive, locationId, search } = req.query;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    if (locationId) {
      filter.location = locationId;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get QR codes with pagination
    const qrCodes = await QRCode.find(filter)
      .populate('location', 'name address')
      .populate('createdBy', 'name')
      .populate('specificEmployee', 'name employeeId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await QRCode.countDocuments(filter);
    
    res.json({
      qrCodes,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get QR codes error:', error);
    res.status(500).json({ message: 'Server error while fetching QR codes' });
  }
});

// Move these special routes BEFORE the /:id routes
// Validate QR code
router.post('/validate', authenticate, async (req, res) => {
  try {
    const { qrCodeId, shortCode, userLocation } = req.body;
    
    if (!qrCodeId && !shortCode) {
      return res.status(400).json({ message: 'QR code ID or short code is required' });
    }
    
    // Find QR code by ID or short code
    let qrCode;
    if (qrCodeId) {
      qrCode = await QRCode.findOne({ qrCodeId })
        .populate('location', 'name address coordinates');
    } else if (shortCode) {
      // Convert short code to uppercase for case-insensitive matching
      const normalizedShortCode = shortCode.toUpperCase();
      console.log(`Looking for QR code with short code: ${normalizedShortCode}`);
      qrCode = await QRCode.findOne({ shortCode: normalizedShortCode })
        .populate('location', 'name address coordinates');
    }
    
    if (!qrCode) {
      return res.status(400).json({ 
        valid: false,
        message: 'Invalid QR code or short code'
      });
    }
    
    // Check if QR code is valid (active and not expired)
    if (!qrCode.isValid()) {
      return res.status(400).json({ 
        valid: false,
        message: 'QR code has expired or is inactive'
      });
    }
    
    // Check if employee-specific QR code is being used by the correct employee
    if (qrCode.type === 'employee-specific' && 
        qrCode.specificEmployee && 
        qrCode.specificEmployee.toString() !== req.employee._id.toString()) {
      return res.status(403).json({ 
        valid: false,
        message: 'This QR code is assigned to another employee'
      });
    }
    
    // Check if user's location is valid (if provided and QR location has coordinates)
    let locationValid = null;
    let locationMessage = null;
    
    if (userLocation && 
        userLocation.latitude && 
        userLocation.longitude && 
        qrCode.location && 
        qrCode.location.coordinates && 
        qrCode.location.coordinates.latitude && 
        qrCode.location.coordinates.longitude) {
      
      // Calculate distance between user and QR code location
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        qrCode.location.coordinates.latitude,
        qrCode.location.coordinates.longitude
      );
      
      // Define a threshold for acceptable distance (e.g., 100 meters)
      const MAX_DISTANCE_METERS = 100;
      locationValid = distance <= MAX_DISTANCE_METERS;
      locationMessage = locationValid 
        ? `You are within ${Math.round(distance)} meters of the expected location.`
        : `You are ${Math.round(distance)} meters away from the expected location.`;
    }
    
    res.json({
      valid: true,
      message: 'QR code is valid',
      locationValid,
      locationMessage,
      qrCode: {
        qrCodeId: qrCode.qrCodeId,
        name: qrCode.name,
        location: qrCode.location,
        validUntil: qrCode.validUntil,
        type: qrCode.type,
        shortCode: qrCode.shortCode
      }
    });
  } catch (error) {
    console.error('Validate QR code error:', error);
    res.status(500).json({ 
      valid: false,
      message: 'Server error while validating QR code'
    });
  }
});

// Generate custom QR code with company logo (admin only)
router.post('/custom', authenticate, isAdmin, async (req, res) => {
  try {
    const { qrCodeId, logoUrl } = req.body;
    
    if (!qrCodeId) {
      return res.status(400).json({ message: 'QR code ID is required' });
    }
    
    const qrCode = await QRCode.findOne({ qrCodeId });
    
    if (!qrCode) {
      return res.status(404).json({ message: 'QR code not found' });
    }
    
    // Generate QR code with logo if provided
    const qrCodeUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/scan?qrCodeId=${qrCode.qrCodeId}`;
    const qrCodeOptions = {
      errorCorrectionLevel: 'H',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    };
    
    // Generate QR code as data URL
    const qrCodeImage = await qrcode.toDataURL(qrCodeUrl, qrCodeOptions);
    
    // Update QR code record with new image URL
    qrCode.imageUrl = qrCodeImage;
    await qrCode.save();
    
    const updatedQrCode = await QRCode.findById(qrCode._id)
      .populate('location', 'name address')
      .populate('createdBy', 'name')
      .populate('specificEmployee', 'name employeeId');
    
    res.json({
      message: 'Custom QR code generated successfully',
      qrCode: updatedQrCode
    });
  } catch (error) {
    console.error('Generate custom QR code error:', error);
    res.status(500).json({ message: 'Server error while generating custom QR code' });
  }
});

// Add migration route to fix QR codes with missing shortcodes
router.post('/fix-missing-shortcodes', authenticate, isAdmin, async (req, res) => {
  try {
    // Find all QR codes that don't have a shortCode or have an empty shortCode
    const qrCodesWithoutShortCode = await QRCode.find({
      $or: [
        { shortCode: { $exists: false } },
        { shortCode: null },
        { shortCode: '' }
      ]
    });
    
    console.log(`Found ${qrCodesWithoutShortCode.length} QR codes missing shortCodes`);
    
    // Track how many were successfully updated
    let updatedCount = 0;
    let errorCount = 0;
    
    // Update each QR code with a new shortCode
    for (const qrCode of qrCodesWithoutShortCode) {
      try {
        // Generate a new short code
        const newShortCode = generateShortCode(6);
        
        // Update the QR code with the new shortCode
        qrCode.shortCode = newShortCode;
        await qrCode.save();
        
        updatedCount++;
      } catch (err) {
        console.error(`Error updating QR code ${qrCode._id}:`, err);
        errorCount++;
      }
    }
    
    res.json({ 
      message: `Fixed shortcodes: ${updatedCount} QR codes updated successfully, ${errorCount} failures.`,
      updatedCount,
      errorCount,
      totalProcessed: qrCodesWithoutShortCode.length
    });
  } catch (error) {
    console.error('Fix missing shortcodes error:', error);
    res.status(500).json({ message: 'Server error while fixing missing shortcodes' });
  }
});

// Get QR code by ID - This must come AFTER all other specific routes
router.get('/:id', authenticate, async (req, res) => {
  try {
    const qrCode = await QRCode.findById(req.params.id)
      .populate('location', 'name address coordinates')
      .populate('createdBy', 'name')
      .populate('specificEmployee', 'name employeeId');
    
    if (!qrCode) {
      return res.status(404).json({ message: 'QR code not found' });
    }
    
    // If employee-specific QR code, only the specific employee or admin can access it
    if (qrCode.type === 'employee-specific' && 
        qrCode.specificEmployee && 
        qrCode.specificEmployee._id.toString() !== req.employee._id.toString() && 
        req.employee.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(qrCode);
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({ message: 'Server error while fetching QR code' });
  }
});

// Update QR code (admin only)
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, location, description, validUntil, isActive } = req.body;
    
    const updateData = {};
    
    if (name) updateData.name = name;
    
    if (location) {
      // Check if location exists
      const locationExists = await Location.findById(location);
      if (!locationExists) {
        return res.status(400).json({ message: 'Location does not exist' });
      }
      updateData.location = location;
    }
    
    if (description !== undefined) updateData.description = description;
    if (validUntil) updateData.validUntil = new Date(validUntil);
    if (isActive !== undefined) updateData.isActive = isActive;
    
    const qrCode = await QRCode.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('location', 'name address')
     .populate('createdBy', 'name')
     .populate('specificEmployee', 'name employeeId');
    
    if (!qrCode) {
      return res.status(404).json({ message: 'QR code not found' });
    }
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('qrcode:updated', qrCode);
    }
    
    res.json({
      message: 'QR code updated successfully',
      qrCode
    });
  } catch (error) {
    console.error('Update QR code error:', error);
    res.status(500).json({ message: 'Server error while updating QR code' });
  }
});

// Delete QR code (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const qrCode = await QRCode.findByIdAndDelete(req.params.id);
    
    if (!qrCode) {
      return res.status(404).json({ message: 'QR code not found' });
    }
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('qrcode:deleted', { _id: req.params.id });
    }
    
    res.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    console.error('Delete QR code error:', error);
    res.status(500).json({ message: 'Server error while deleting QR code' });
  }
});

module.exports = router;