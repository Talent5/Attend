const express = require('express');
const router = express.Router();
const Attendance = require('../models/attendance.model');
const QRCode = require('../models/qrcode.model');
const { authenticate, isAdmin } = require('../middlewares/auth.middleware');

// Log attendance (scan QR code)
router.post('/', authenticate, async (req, res) => {  try {
    const { qrCodeId, shortCode, type, coordinates, device, location } = req.body;
    const employeeId = req.employee._id;
    console.log(`Recording attendance for employee ${employeeId} with ${qrCodeId ? 'QR code ID ' + qrCodeId : 'short code ' + shortCode}`);
    
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
      // Auto-determine type if not provided
    let attendanceType = type;
    if (!attendanceType) {
      // Check if user has an active check-in TODAY (without check-out)
      const activeCheckIn = await Attendance.findOne({
        employeeId,
        checkIn: { $gte: today },
        checkOut: null
      }).sort({ checkIn: -1 });
      
      attendanceType = activeCheckIn ? 'check-out' : 'check-in';
    }
    
    console.log(`Auto-determined type: ${attendanceType} (original type: ${type})`);
    
    // Check for recent actions within 5 minutes to prevent spam
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const recentAction = await Attendance.findOne({
      employeeId,
      $or: [
        { checkIn: { $gte: fiveMinutesAgo } },
        { checkOut: { $gte: fiveMinutesAgo } }
      ]
    }).sort({ updatedAt: -1 });
    
    if (recentAction) {
      const actionType = recentAction.checkOut && recentAction.checkOut >= fiveMinutesAgo ? 'check-out' : 'check-in';
      const actionTime = recentAction.checkOut && recentAction.checkOut >= fiveMinutesAgo ? 
        recentAction.checkOut : recentAction.checkIn;
      const timeUntilNext = Math.ceil((actionTime.getTime() + 5 * 60 * 1000 - now.getTime()) / 1000);
      const minutesLeft = Math.floor(timeUntilNext / 60);
      const secondsLeft = timeUntilNext % 60;
      
      let timeMessage;
      if (minutesLeft > 0) {
        timeMessage = `${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} and ${secondsLeft} second${secondsLeft !== 1 ? 's' : ''}`;
      } else {
        timeMessage = `${Math.max(0, secondsLeft)} second${secondsLeft !== 1 ? 's' : ''}`;
      }
      
      return res.status(400).json({ 
        message: `You already performed a ${actionType} in the last 5 minutes. Please wait ${timeMessage} before trying again.`,
        cooldownSeconds: Math.max(0, timeUntilNext),
        lastAction: actionType,
        lastActionTime: actionTime,
        retryAfter: new Date(actionTime.getTime() + 5 * 60 * 1000),
        isSpamPrevention: true
      });
    }
    
    // Determine if this is a check-in or check-out
    if (attendanceType === 'check-in') {      // Check if user has an active check-in TODAY (without check-out) 
      const activeCheckIn = await Attendance.findOne({
        employeeId,
        checkIn: { $gte: today }, // Only check today's records
        checkOut: null
      }).sort({ checkIn: -1 });
      
      if (activeCheckIn) {
        return res.status(400).json({ 
          message: 'You already have an active check-in today. Please check out first before checking in again.' 
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
      });    } else if (attendanceType === 'check-out') {
      // Find the most recent check-in record for this employee TODAY without a check-out
      const checkInRecord = await Attendance.findOne({
        employeeId,
        checkIn: { $gte: today }, // Only look for today's check-ins
        checkOut: null
      }).sort({ checkIn: -1 });
      
      if (!checkInRecord) {
        return res.status(400).json({ message: 'No active check-in found for today. Please check in first.' });
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
      });    } else {
      return res.status(400).json({ 
        message: `Invalid attendance type '${attendanceType}'. Must be check-in or check-out.`,
        detectedType: attendanceType
      });
    }
  } catch (error) {
    console.error('Record attendance error:', error);
    res.status(500).json({ message: 'Server error while recording attendance' });
  }
});

// Get current employee's monthly attendance statistics
router.get('/me/monthly', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    const employeeId = req.employee._id;
    
    // Use current month/year if not provided
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) - 1 : currentDate.getMonth(); // month is 0-indexed
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    
    // Get first and last day of the month
    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    
    // Build filter for the specific month
    const filter = {
      employeeId,
      date: {
        $gte: firstDay,
        $lte: lastDay
      }
    };
    
    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find(filter)
      .sort({ date: 1 })
      .lean();
    
    // Calculate monthly statistics
    let totalDays = 0;
    let presentDays = 0;
    let lateDays = 0;
    let totalHours = 0;
    const dailyStats = [];
    
    attendanceRecords.forEach(record => {
      if (record.checkIn) {
        totalDays++;
        presentDays++;
        
        if (record.status === 'late') {
          lateDays++;
        }
        
        if (record.duration) {
          totalHours += record.duration / 60; // Convert minutes to hours
        }
        
        dailyStats.push({
          date: record.date,
          checkIn: record.checkIn,
          checkOut: record.checkOut,
          duration: record.duration,
          status: record.status,
          location: record.locationName || record.location
        });
      }
    });
    
    // Calculate attendance percentage
    const daysInMonth = lastDay.getDate();
    const attendancePercentage = daysInMonth > 0 ? (presentDays / daysInMonth) * 100 : 0;
    
    // Average hours per day
    const avgHoursPerDay = presentDays > 0 ? totalHours / presentDays : 0;
    
    res.json({
      month: targetMonth + 1, // Convert back to 1-indexed
      year: targetYear,
      totalDays: daysInMonth,
      presentDays,
      absentDays: daysInMonth - presentDays,
      lateDays,
      onTimeDays: presentDays - lateDays,
      attendancePercentage: Math.round(attendancePercentage * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHoursPerDay: Math.round(avgHoursPerDay * 100) / 100,
      dailyStats
    });
  } catch (error) {
    console.error('Get monthly attendance stats error:', error);
    res.status(500).json({ message: 'Server error while fetching monthly attendance statistics' });
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
    
    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if user has checked in today
    const todayCheckIn = await Attendance.findOne({
      employeeId: req.employee._id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      },
      checkIn: { $ne: null }
    });
      // Transform the attendance data to include both check-in and check-out entries
    const transformedRecords = [];

    attendanceRecords.forEach(record => {
      // Validate and add check-in record
      if (record.checkIn) {
        const checkInDate = new Date(record.checkIn);
        // Only add if the date is valid
        if (!isNaN(checkInDate.getTime()) && checkInDate.getFullYear() >= 2000) {
          transformedRecords.push({
            _id: record._id + '-in',
            employeeId: record.employeeId,
            timestamp: checkInDate.toISOString(),
            type: 'check-in',
            location: record.locationName || record.location,
            device: record.device,
            status: record.status
          });
        } else {
          console.warn('Invalid checkIn date for record:', record._id, record.checkIn);
        }
      }
      
      // Validate and add check-out record
      if (record.checkOut) {
        const checkOutDate = new Date(record.checkOut);
        // Only add if the date is valid
        if (!isNaN(checkOutDate.getTime()) && checkOutDate.getFullYear() >= 2000) {
          transformedRecords.push({
            _id: record._id + '-out',
            employeeId: record.employeeId,
            timestamp: checkOutDate.toISOString(),
            type: 'check-out',
            location: record.locationName || record.location,
            device: record.device,
            status: record.status
          });
        } else {
          console.warn('Invalid checkOut date for record:', record._id, record.checkOut);
        }
      }
    });
    
    // Sort transformed records by timestamp (newest first)
    transformedRecords.sort((a, b) => {
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
      total,
      todayCheckedIn: !!todayCheckIn,
      todayStatus: todayCheckIn ? todayCheckIn.status : null
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
    if (department) filter.department = department;    // Get attendance records with pagination and populate employee details
    const attendanceRecords = await Attendance.find(filter)
      .populate('employeeId', 'name employeeId email department')
      .sort({ date: -1, checkIn: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // For recent activity (indicated by small limit), expand to show individual actions
    let transformedRecords;
    if (parseInt(limit) <= 10 && !filter.date) {
      // This looks like a recent activity request, expand each record into separate actions
      const expandedRecords = [];
      
      attendanceRecords.forEach(record => {
        const recordObj = record.toObject();
        recordObj.employee = recordObj.employeeId;
        
        // Add check-in action
        if (recordObj.checkIn) {
          expandedRecords.push({
            ...recordObj,
            type: 'check-in',
            timestamp: recordObj.checkIn,
            _id: recordObj._id + '_checkin' // Unique identifier for the action
          });
        }
        
        // Add check-out action
        if (recordObj.checkOut) {
          expandedRecords.push({
            ...recordObj,
            type: 'check-out',
            timestamp: recordObj.checkOut,
            _id: recordObj._id + '_checkout' // Unique identifier for the action
          });
        }
      });
      
      // Sort by timestamp (most recent first) and limit to requested amount
      transformedRecords = expandedRecords
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, parseInt(limit));
        
    } else {
      // For other requests, use single record per attendance with most recent action
      transformedRecords = attendanceRecords.map(record => {
        const recordObj = record.toObject();
        
        // Determine the most recent action for this record
        if (recordObj.checkOut) {
          // If there's a checkout, that's the most recent action
          recordObj.type = 'check-out';
          recordObj.timestamp = recordObj.checkOut;
        } else {
          // If there's only a check-in, that's the most recent action
          recordObj.type = 'check-in';
          recordObj.timestamp = recordObj.checkIn;
        }
        
        // For compatibility, also set the employee field
        recordObj.employee = recordObj.employeeId;
        
        return recordObj;
      });
    }
    
    // Get total count for pagination
    const total = await Attendance.countDocuments(filter);
      res.json({
      records: transformedRecords,
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
      .populate('location', 'name') // Populate location to get the name
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
      'Duration',
      'Location',
      'Status',
      'Notes'
    ];
    let csv = fields.join(',') + '\r\n';
      attendanceRecords.forEach(record => {
      const dateStr = new Date(record.date).toLocaleDateString();
      const checkInTime = record.checkIn ? new Date(record.checkIn).toLocaleTimeString() : 'N/A';
      const checkOutTime = record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : 'N/A';
      
      // Format duration like frontend: "1h 30m"
      let durationFormatted = 'N/A';
      if (record.duration || record.duration === 0) {
        const hours = Math.floor(record.duration / 60);
        const mins = record.duration % 60;
        durationFormatted = `${hours}h ${mins}m`;
      }
      
      // Get location name like frontend does
      let locationName = 'N/A';
      if (record.locationName) {
        // If locationName exists, use it
        locationName = record.locationName;
      } else if (record.location) {
        if (typeof record.location === 'string' && !record.location.match(/^[0-9a-fA-F]{24}$/)) {
          // If location is already a string (not an ObjectId), use it
          locationName = record.location;
        } else if (record.location.name) {
          // If location is populated, use the name
          locationName = record.location.name;
        } else {
          locationName = 'Unknown Location';
        }
      }
      
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
        durationFormatted,
        locationName,
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

// Debug route to check attendance data
router.get('/debug', authenticate, async (req, res) => {
  try {
    const employeeId = req.employee._id;
    console.log('Debug: Checking attendance for employee:', employeeId);
    
    // Get all attendance records for this employee
    const allRecords = await Attendance.find({ employeeId }).sort({ date: -1 }).limit(10);
    console.log('Debug: Found records:', allRecords.length);
    
    const debugInfo = {
      employeeId,
      totalRecords: allRecords.length,
      records: allRecords.map(record => ({
        _id: record._id,
        date: record.date,
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        location: record.location,
        locationName: record.locationName,
        status: record.status
      }))
    };
    
    console.log('Debug info:', debugInfo);
    res.json(debugInfo);
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
});

module.exports = router;