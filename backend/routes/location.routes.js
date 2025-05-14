const express = require('express');
const router = express.Router();
const { authenticate, isAdmin, isSuperAdmin } = require('../middlewares/auth.middleware');
const Location = require('../models/location.model');

// GET all locations
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 10 } = req.query;
    
    // Build the query
    const query = {};
    
    // Add search functionality
    if (search) {
      query.$text = { $search: search };
    }
    
    // Filter by active status if specified
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch locations with pagination
    const locations = await Location.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email role');
    
    // Count total documents for pagination info
    const totalLocations = await Location.countDocuments(query);
    
    res.status(200).json({
      totalPages: Math.ceil(totalLocations / parseInt(limit)),
      currentPage: parseInt(page),
      totalLocations,
      locations
    });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ success: false, message: 'Error fetching locations', error: error.message });
  }
});

// GET a specific location
router.get('/:id', authenticate, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id)
      .populate('createdBy', 'name email role');
    
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    
    res.json({ success: true, location });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ success: false, message: 'Error fetching location', error: error.message });
  }
});

// CREATE a new location (admin and super admin)
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, address, description, coordinates } = req.body;
    
    // Check if location with the same name already exists
    const existingLocation = await Location.findOne({ name });
    if (existingLocation) {
      return res.status(400).json({ success: false, message: 'Location with this name already exists' });
    }
    
    const newLocation = new Location({
      name,
      address,
      description,
      coordinates,
      createdBy: req.employee.id // Using req.employee instead of req.user
    });
    
    // Save the location
    const savedLocation = await newLocation.save();
    
    res.status(201).json({ success: true, location: savedLocation, message: 'Location created successfully' });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ success: false, message: 'Failed to create location', error: error.message });
  }
});

// UPDATE a location (admin and super admin)
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, address, description, coordinates, isActive } = req.body;
    
    // Check if location with the same name already exists (except for the current one)
    if (name) {
      const existingLocation = await Location.findOne({ name, _id: { $ne: req.params.id } });
      if (existingLocation) {
        return res.status(400).json({ success: false, message: 'Another location with this name already exists' });
      }
    }
    
    const updatedLocation = await Location.findByIdAndUpdate(
      req.params.id,
      { 
        ...(name && { name }),
        ...(address && { address }),
        ...(description !== undefined && { description }),
        ...(coordinates && { coordinates }),
        ...(isActive !== undefined && { isActive }),
        updatedBy: req.employee.id // Using req.employee instead of req.user
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email role');
    
    if (!updatedLocation) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    
    res.json({ success: true, location: updatedLocation, message: 'Location updated successfully' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Failed to update location', error: error.message });
  }
});

// DELETE a location (admin and super admin)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    // Check if QR codes are linked to this location
    const QRCode = require('../models/qrcode.model');
    const linkedQRCodes = await QRCode.countDocuments({ location: req.params.id });
    
    if (linkedQRCodes > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete a location that is linked to QR codes. Deactivate it instead.',
        linkedQRCodes 
      });
    }
    
    const deletedLocation = await Location.findByIdAndDelete(req.params.id);
    
    if (!deletedLocation) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    
    res.json({ success: true, message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({ success: false, message: 'Failed to delete location', error: error.message });
  }
});

module.exports = router;