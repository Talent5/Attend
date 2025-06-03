const express = require('express');
const router = express.Router();
const Attendance = require('../models/attendance.model');
const QRCode = require('../models/qrcode.model');
const { authenticate, isAdmin } = require('../middlewares/auth.middleware');

// Log attendance (scan QR code)
router.post('/', authenticate, async (req, res) => {
  try {
    const { qrCodeId, shortCode, type, coordinates, device, location } = req.body;
    const employeeId = req.employee._id;
    
    console.log(`Recording ${type} for employee ${employeeId} with ${qrCodeId ? 'QR code ID ' + qrCodeId : 'short code ' + shortCode}`);
    
    // Validate QR code using either qrCodeId or shortCode
    let qrCode;
    
    if (qrCodeId) {
      qrCode = await QRCode.findOne({ qrCodeId });
    } else if (shortCode) {
      // Look up by shortCode (case-insensitive)
      qrCode = await QRCode.findOne({ 
        shortCode: new RegExp(`^${shortCode}$`, 'i') 
      });
    } else {
      return res.status(400).json({ message: 'QR code ID or short code is required' });
    }
    
    if (!qrCode) {
      return res.status(400).json({ message: 'Invalid QR code or short code' });
    }
    
    // Check if QR code is valid (active and not expired)
    if (!qrCode.isValid()) {
      return res.status(400).json({ message: 'QR code has expired or is inactive' });
    }
    
    // Check if employee-specific QR code is being used by the correct employee
    if (qrCode.type === 'employee-specific' && 
        qrCode.specificEmployee && 
        qrCode.specificEmployee.toString() !== employeeId.toString()) {
      return res.status(403).json({ message: 'This QR code is assigned to another employee' });
    }
    
    // Get current date with time set to 00:00:00 to allow grouping by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const now = new Date();
    
    // Determine if this is a check-in or check-out
    if (type === 'check-in') {
      // Prevent duplicate check-ins within 5 minutes
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const recentCheckIn = await Attendance.findOne({
        employeeId,
        checkIn: { $gte: fiveMinutesAgo }
      });
      
      if (recentCheckIn) {
        return res.status(400).json({ 
          message: `You already checked in the last 5 minutes` 
        });
      }
      
      // Determine if this is an on-time or late check-in (e.g., after 9 AM)
      const onTimeHour = 9; // 9 AM
      let status = 'onTime';
      
      if (now.getHours() >= onTimeHour) {
        status = 'late';
      }
      
      // Create a new attendance record for today
      const attendance = new Attendance({
        employeeId,
        date: today,
        checkIn: now,
        checkOut: null, // Will be updated when user checks out
        duration: 0, // Will be calculated when user checks out
        location: qrCode.location,
        qrCodeId: qrCode.qrCodeId,
        coordinates,
        device,
        status,
        locationName: location,
        ipAddress: req.ip
      });
      
      await attendance.save();
      
      // Emit socket event for real-time updates
      const io = req.app.get('io');
      if (io) {
        const populatedAttendance = await Attendance.findById(attendance._id)
          .populate('employeeId', 'name employeeId');
        
        io.emit('attendance:recorded', populatedAttendance);
      }
      
      res.status(201).json({
        message: 'Check-in recorded successfully',
        timestamp: attendance.checkIn,
        type: 'check-in',
        location: location || (qrCode.location && qrCode.location.name) || 'Unknown location'
      });
    } 
    else if (type === 'check-out') {
      // Find the most recent check-in record for this employee without a check-out
      const checkInRecord = await Attendance.findOne({
        employeeId,
        checkIn: { $ne: null },
        checkOut: null
      }).sort({ checkIn: -1 });
      
      if (!checkInRecord) {
        return res.status(400).json({ message: 'No active check-in found. Please check in first.' });
      }
      
      // Prevent duplicate check-outs within 5 minutes
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      if (checkInRecord.updatedAt >= fiveMinutesAgo) {
        return res.status(400).json({ 
          message: `You already checked out in the last 5 minutes` 
        });
      }
      
      // Calculate duration in minutes
      const checkInTime = new Date(checkInRecord.checkIn);
      const durationMs = now.getTime() - checkInTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      // Update the existing record with check-out time and duration
      checkInRecord.checkOut = now;
      checkInRecord.duration = durationMinutes;
      
      // If location or coordinates provided, update them as well
      if (location) {
        checkInRecord.locationName = location;
      }
      
      if (coordinates) {
        checkInRecord.coordinates = coordinates;
      }
      
      // Update device info if provided
      if (device) {
        checkInRecord.device = device;
      }
      
      await checkInRecord.save();
      
      // Emit socket event for real-time updates
      const io = req.app.get('io');
      if (io) {
        const populatedAttendance = await Attendance.findById(checkInRecord._id)
          .populate('employeeId', 'name employeeId');
        
        io.emit('attendance:updated', populatedAttendance);
      }
      
      res.status(200).json({
        message: 'Check-out recorded successfully',
        timestamp: checkInRecord.checkOut,
        duration: durationMinutes,
        type: 'check-out',
        location: location || (qrCode.location && qrCode.location.name) || 'Unknown location'
      });
    }
    else {
      return res.status(400).json({ message: 'Invalid attendance type. Must be check-in or check-out.' });
    }
  } catch (error) {
    console.error('Record attendance error:', error);
    res.status(500).json({ message: 'Server error while recording attendance' });
  }
});

// Get current employee's attendance history
router.get('/me', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build date filter
    const dateFilter = {};
    
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }
    
    const filter = { employeeId: req.employee._id };
    
    if (Object.keys(dateFilter).length > 0) {
      filter.date = dateFilter;
    }
    
    // Get attendance records with pagination
    let attendanceRecords = await Attendance.find(filter)
      .sort({ date: -1, checkIn: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Transform the attendance data to include both check-in and check-out entries
    // This format is compatible with the frontend expectations
    const transformedRecords = [];

    attendanceRecords.forEach(record => {
      if (record.checkIn) {
        transformedRecords.push({
          _id: record._id + '-in',
          employeeId: record.employeeId,
          timestamp: record.checkIn, // Ensure this is a valid Date object
          type: 'check-in',
          location: record.locationName || record.location,
          device: record.device
        });
      }
      
      if (record.checkOut) {
        transformedRecords.push({
          _id: record._id + '-out',
          employeeId: record.employeeId,
          timestamp: record.checkOut, // Ensure this is a valid Date object
          type: 'check-out',
          location: record.locationName || record.location,
          device: record.device
        });
      }
    });
    
    // Sort transformed records by timestamp (newest first)
    transformedRecords.sort((a, b) => {
      // Ensure we have valid dates for comparison
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return dateB - dateA;
    });
    
    // Get total count for pagination
    const total = await Attendance.countDocuments(filter);
    
    res.json({
      records: transformedRecords,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({ message: 'Server error while fetching attendance history' });
  }
});

// Get all attendance records (admin only)
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate, 
      employeeId, 
      location,
      type,
      department,
      status
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    
    // Date filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter.date.$lte = endDateObj;
      }
    }
    
    if (employeeId) filter.employeeId = employeeId;
    if (location) filter.location = { $regex: location, $options: 'i' };
    if (status && status !== 'all') filter.status = status;
    if (department) filter.department = department;
    
    // Get attendance records with pagination and populate employee details
    const attendanceRecords = await Attendance.find(filter)
      .populate('employeeId', 'name employeeId email department')
      .sort({ date: -1, checkIn: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Return records directly without transforming them into separate check-in/check-out entries
    // This ensures we keep the single record format
    
    // Get total count for pagination
    const total = await Attendance.countDocuments(filter);
    
    res.json({
      records: attendanceRecords,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get all attendance records error:', error);
    res.status(500).json({ message: 'Server error while fetching attendance records' });
  }
});

// Get attendance statistics (admin only)
router.get('/stats/summary', authenticate, isAdmin, async (req, res) => {
  try {
    // Get filter parameters from request
    const { startDate, endDate, employeeId, department, location } = req.query;
    
    // Build base filter
    const baseFilter = {};
    
    // Apply date filter if provided
    if (startDate || endDate) {
      baseFilter.date = {};
      if (startDate) baseFilter.date.$gte = new Date(startDate);
      if (endDate) {
        // Set end date to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        baseFilter.date.$lte = endDateTime;
      }
    }
    
    // Apply other filters if provided
    if (employeeId) baseFilter.employeeId = employeeId;
    if (location) baseFilter.location = location;
    
    // Get today's date (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all distinct employees who have attendance records
    const activeEmployeeIds = await Attendance.distinct('employeeId', baseFilter);
    
    // Query to get total employees from Employee model
    const Employee = require('../models/employee.model');
    let employeeFilter = { isActive: true }; // Only count active employees
    
    if (department) {
      employeeFilter.department = department;
    }
    
    const totalEmployees = await Employee.countDocuments(employeeFilter);
    
    // Get today's attendance records
    const todayFilter = {
      ...baseFilter,
      date: { $gte: today }
    };
    
    // Count check-ins and check-outs for today
    const todayCheckIns = await Attendance.countDocuments({
      ...todayFilter,
      checkIn: { $exists: true }
    });
    
    const todayCheckOuts = await Attendance.countDocuments({
      ...todayFilter,
      checkOut: { $exists: true }
    });
    
    // Get on-time and late counts for today
    const onTime = await Attendance.countDocuments({
      ...todayFilter,
      status: 'onTime'
    });
    
    const late = await Attendance.countDocuments({
      ...todayFilter,
      status: 'late'
    });
    
    // Calculate absent (total active employees minus those who checked in)
    const absent = Math.max(0, totalEmployees - (onTime + late));
    
    // Get attendance by date for the selected date range
    const startDateObj = startDate ? new Date(startDate) : new Date(today);
    startDateObj.setHours(0, 0, 0, 0);
    
    const endDateObj = endDate ? new Date(endDate) : new Date(today);
    endDateObj.setHours(23, 59, 59, 999);
    
    // Aggregate daily stats
    const dailyStats = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: startDateObj,
            $lte: endDateObj
          },
          ...(employeeId && { employeeId: employeeId }),
          ...(location && { location: location }),
          ...(department && { department: department })
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
          },
          checkIns: {
            $sum: { $cond: [{ $ifNull: ["$checkIn", false] }, 1, 0] }
          },
          checkOuts: {
            $sum: { $cond: [{ $ifNull: ["$checkOut", false] }, 1, 0] }
          },
          onTime: {
            $sum: { $cond: [{ $eq: ["$status", "onTime"] }, 1, 0] }
          },
          late: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          }
        }
      },
      {
        $sort: { "_id.date": 1 }
      }
    ]);
    
    // Get location stats
    const locationStats = await Attendance.aggregate([
      {
        $match: {
          date: {
            $gte: startDateObj,
            $lte: endDateObj
          },
          ...(employeeId && { employeeId: employeeId }),
          ...(department && { department: department })
        }
      },
      {
        $group: {
          _id: "$location",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    // Calculate total attendance
    const totalAttendance = await Attendance.countDocuments(baseFilter);
    
    res.json({
      onTime,
      late,
      absent,
      totalEmployees,
      checkIns: todayCheckIns,
      checkOuts: todayCheckOuts,
      totalAttendance,
      activeEmployees: activeEmployeeIds.length,
      todayAttendance: todayCheckIns,
      dailyStats,
      locationStats
    });
  } catch (error) {
    console.error('Get attendance statistics error:', error);
    res.status(500).json({ message: 'Server error while fetching attendance statistics' });
  }
});

// Export attendance data as CSV (admin only)
router.get('/export', authenticate, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate, employeeId, location } = req.query;
    
    // Build filter
    const filter = {};
    
    // Date filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter.date.$lte = endDateObj;
      }
    }
    
    if (employeeId) filter.employeeId = employeeId;
    if (location) filter.location = { $regex: location, $options: 'i' };
    
    // Get attendance records and populate employee details with more fields
    const attendanceRecords = await Attendance.find(filter)
      .populate('employeeId', 'name employeeId email department position phoneNumber')
      .sort({ date: -1, checkIn: -1 });
    
    // Convert to CSV format with enhanced fields
    const fields = [
      'Employee ID',
      'Name',
      'Email',
      'Department',
      'Position',
      'Phone Number',
      'Date',
      'Check In',
      'Check Out',
      'Duration (hours)',
      'Duration (minutes)',
      'Location',
      'Status',
      'Notes'
    ];
    let csv = fields.join(',') + '\r\n';
    
    attendanceRecords.forEach(record => {
      const dateStr = new Date(record.date).toLocaleDateString();
      const checkInTime = record.checkIn ? new Date(record.checkIn).toLocaleTimeString() : 'N/A';
      const checkOutTime = record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : 'N/A';
      
      // Format duration
      const durationHrs = Math.floor(record.duration / 60);
      const durationMins = record.duration % 60;
      
      const row = [
        record.employeeId?.employeeId || 'N/A',
        record.employeeId?.name || 'N/A',
        record.employeeId?.email || 'N/A',
        record.employeeId?.department || 'N/A',
        record.employeeId?.position || 'N/A',
        record.employeeId?.phoneNumber || 'N/A',
        dateStr,
        checkInTime,
        checkOutTime,
        durationHrs,
        durationMins,
        record.location || 'N/A',
        record.status || 'N/A',
        record.notes || 'N/A'
      ].map(field => `"${field}"`); // Wrap fields in quotes to handle commas in text
      
      csv += row.join(',') + '\r\n';
    });
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    
    res.send(csv);
  } catch (error) {
    console.error('Export attendance error:', error);
    res.status(500).json({ message: 'Server error while exporting attendance data' });
  }
});

module.exports = router;