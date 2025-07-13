const express = require('express');
const router = express.Router();
const Attendance = require('../models/attendance.model');
const QRCode = require('../models/qrcode.model');
const Location = require('../models/location.model');
const Employee = require('../models/employee.model');
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
      
      // Resolve location name from QR code
      let resolvedLocationName = location; // Use provided location name if available
      if (!resolvedLocationName && qrCode.location) {
        try {
          // Populate the location to get the name
          const populatedQRCode = await QRCode.findById(qrCode._id).populate('location');
          resolvedLocationName = populatedQRCode.location ? populatedQRCode.location.name : 'Unknown Location';
        } catch (error) {
          console.error('Error resolving location name:', error);
          resolvedLocationName = 'Unknown Location';
        }
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
        locationName: resolvedLocationName || 'Office',
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
        location: resolvedLocationName || 'Office'
      });} else if (attendanceType === 'check-out') {
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
      
      // Resolve location name for check-out
      let checkoutLocationName = location; // Use provided location name if available
      if (!checkoutLocationName && qrCode.location) {
        try {
          // Populate the location to get the name
          const populatedQRCode = await QRCode.findById(qrCode._id).populate('location');
          checkoutLocationName = populatedQRCode.location ? populatedQRCode.location.name : 'Unknown Location';
        } catch (error) {
          console.error('Error resolving location name for checkout:', error);
          checkoutLocationName = checkInRecord.locationName || 'Unknown Location';
        }
      } else if (!checkoutLocationName) {
        // Fallback to existing location name from check-in
        checkoutLocationName = checkInRecord.locationName || 'Office';
      }
      
      // If location or coordinates provided, update them as well
      if (checkoutLocationName) {
        checkInRecord.locationName = checkoutLocationName;
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
        location: checkoutLocationName
      });
    } else {
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
    });    // Transform the attendance data to include both check-in and check-out entries
    const transformedRecords = [];

    // Helper function to resolve location name
    const getLocationName = async (locationRef, locationName) => {
      // If locationName is already provided and is not an ObjectId, use it
      if (locationName && typeof locationName === 'string' && 
          !locationName.match(/^[0-9a-fA-F]{24}$/)) {
        return locationName;
      }
      
      // If location is an ObjectId, fetch the location name
      if (locationRef && typeof locationRef === 'string' && 
          locationRef.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const location = await Location.findById(locationRef);
          return location ? location.name : 'Unknown Location';
        } catch (error) {
          console.error('Error fetching location:', error);
          return 'Unknown Location';
        }
      }
      
      // Fallback
      return locationRef || 'Office';
    };

    for (const record of attendanceRecords) {
      const resolvedLocationName = await getLocationName(record.location, record.locationName);
      
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
            location: resolvedLocationName,
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
            location: resolvedLocationName,
            device: record.device,
            status: record.status
          });
        } else {
          console.warn('Invalid checkOut date for record:', record._id, record.checkOut);
        }
      }
    }
    
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
      // Helper function to resolve location name
    const getLocationName = async (locationRef, locationName) => {
      // If locationName is already provided and is not an ObjectId, use it
      if (locationName && typeof locationName === 'string' && 
          !locationName.match(/^[0-9a-fA-F]{24}$/)) {
        return locationName;
      }
      
      // If location is an ObjectId, fetch the location name
      if (locationRef && typeof locationRef === 'string' && 
          locationRef.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const location = await Location.findById(locationRef);
          return location ? location.name : 'Unknown Location';
        } catch (error) {
          console.error('Error fetching location:', error);
          return 'Unknown Location';
        }
      }
      
      // Fallback
      return locationRef || 'Office';
    };

    // For recent activity (indicated by small limit), expand to show individual actions
    let transformedRecords;
    if (parseInt(limit) <= 10 && !filter.date) {
      // This looks like a recent activity request, expand each record into separate actions
      const expandedRecords = [];
      
      for (const record of attendanceRecords) {
        const recordObj = record.toObject();
        recordObj.employee = recordObj.employeeId;
        const resolvedLocationName = await getLocationName(recordObj.location, recordObj.locationName);
        
        // Add check-in action
        if (recordObj.checkIn) {
          expandedRecords.push({
            ...recordObj,
            type: 'check-in',
            timestamp: recordObj.checkIn,
            location: resolvedLocationName,
            _id: recordObj._id + '_checkin' // Unique identifier for the action
          });
        }
        
        // Add check-out action
        if (recordObj.checkOut) {
          expandedRecords.push({
            ...recordObj,
            type: 'check-out',
            timestamp: recordObj.checkOut,
            location: resolvedLocationName,
            _id: recordObj._id + '_checkout' // Unique identifier for the action
          });
        }
      }
      
      // Sort by timestamp (most recent first) and limit to requested amount
      transformedRecords = expandedRecords
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, parseInt(limit));
        
    } else {
      // For other requests, use single record per attendance with most recent action
      const processedRecords = [];
      
      for (const record of attendanceRecords) {
        const recordObj = record.toObject();
        const resolvedLocationName = await getLocationName(recordObj.location, recordObj.locationName);
        
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
        recordObj.location = resolvedLocationName;
        
        processedRecords.push(recordObj);
      }
      
      transformedRecords = processedRecords;
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

// Get detailed attendance analytics (admin only)
router.get('/stats/analytics', authenticate, isAdmin, async (req, res) => {
  try {
    const { startDate, endDate, employeeId, department, location } = req.query;
    
    // Build base filter
    const baseFilter = {};
    
    // Apply date filter if provided
    if (startDate || endDate) {
      baseFilter.date = {};
      if (startDate) baseFilter.date.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        baseFilter.date.$lte = endDateTime;
      }
    }
    
    // Apply other filters if provided
    if (employeeId) baseFilter.employeeId = employeeId;
    if (location) baseFilter.location = location;
    
    // Get Employee model for department filtering
    const Employee = require('../models/employee.model');
    
    // Get all attendance records matching filter
    let attendanceQuery = Attendance.find(baseFilter)
      .populate('employeeId', 'name employeeId email department position phoneNumber');
      
    // Apply department filter through population
    if (department) {
      const employeesInDept = await Employee.find({ department }).select('_id');
      const employeeIds = employeesInDept.map(emp => emp._id);
      baseFilter.employeeId = { $in: employeeIds };
      attendanceQuery = Attendance.find(baseFilter)
        .populate('employeeId', 'name employeeId email department position phoneNumber');
    }
    
    const attendanceRecords = await attendanceQuery.sort({ date: -1, checkIn: -1 });
    
    // Calculate detailed analytics
    const analytics = {
      // Basic counts
      totalRecords: attendanceRecords.length,
      totalEmployees: new Set(attendanceRecords.map(r => r.employeeId?._id?.toString()).filter(Boolean)).size,
      
      // Status breakdown
      onTimeCount: attendanceRecords.filter(r => r.status === 'onTime').length,
      lateCount: attendanceRecords.filter(r => r.status === 'late').length,
      
      // Check-in/out analysis
      totalCheckIns: attendanceRecords.filter(r => r.checkIn).length,
      totalCheckOuts: attendanceRecords.filter(r => r.checkOut).length,
      incompleteRecords: attendanceRecords.filter(r => r.checkIn && !r.checkOut).length,
      
      // Duration analysis
      avgDuration: 0,
      totalHours: 0,
      overtimeHours: 0,
      
      // Time patterns
      hourlyDistribution: {},
      departmentStats: {},
      locationStats: {},
      dailyTrends: {},
      
      // Employee rankings
      topPerformers: [],
      frequentLateArrivals: []
    };
    
    // Calculate duration statistics
    const recordsWithDuration = attendanceRecords.filter(r => r.duration && r.duration > 0);
    if (recordsWithDuration.length > 0) {
      const totalMinutes = recordsWithDuration.reduce((sum, r) => sum + r.duration, 0);
      analytics.avgDuration = Math.round(totalMinutes / recordsWithDuration.length);
      analytics.totalHours = Math.round(totalMinutes / 60 * 100) / 100;
      analytics.overtimeHours = recordsWithDuration
        .filter(r => r.duration > 480) // More than 8 hours
        .reduce((sum, r) => sum + Math.max(0, r.duration - 480), 0) / 60;
    }
    
    // Hourly distribution analysis
    attendanceRecords.forEach(record => {
      if (record.checkIn) {
        const hour = new Date(record.checkIn).getHours();
        analytics.hourlyDistribution[hour] = (analytics.hourlyDistribution[hour] || 0) + 1;
      }
    });
    
    // Department statistics
    attendanceRecords.forEach(record => {
      const dept = record.employeeId?.department || 'Unknown';
      if (!analytics.departmentStats[dept]) {
        analytics.departmentStats[dept] = {
          totalRecords: 0,
          onTime: 0,
          late: 0,
          employees: new Set()
        };
      }
      analytics.departmentStats[dept].totalRecords++;
      analytics.departmentStats[dept].employees.add(record.employeeId?._id?.toString());
      if (record.status === 'onTime') analytics.departmentStats[dept].onTime++;
      if (record.status === 'late') analytics.departmentStats[dept].late++;
    });
    
    // Convert Set to count for department stats
    Object.keys(analytics.departmentStats).forEach(dept => {
      analytics.departmentStats[dept].employees = analytics.departmentStats[dept].employees.size;
    });
    
    // Location statistics
    attendanceRecords.forEach(record => {
      const location = record.locationName || record.location || 'Unknown';
      analytics.locationStats[location] = (analytics.locationStats[location] || 0) + 1;
    });
    
    // Daily trends
    attendanceRecords.forEach(record => {
      const date = new Date(record.date).toISOString().split('T')[0];
      if (!analytics.dailyTrends[date]) {
        analytics.dailyTrends[date] = {
          checkIns: 0,
          checkOuts: 0,
          onTime: 0,
          late: 0
        };
      }
      if (record.checkIn) analytics.dailyTrends[date].checkIns++;
      if (record.checkOut) analytics.dailyTrends[date].checkOuts++;
      if (record.status === 'onTime') analytics.dailyTrends[date].onTime++;
      if (record.status === 'late') analytics.dailyTrends[date].late++;
    });
    
    // Employee performance analysis
    const employeeStats = {};
    attendanceRecords.forEach(record => {
      const empId = record.employeeId?._id?.toString();
      if (!empId) return;
      
      if (!employeeStats[empId]) {
        employeeStats[empId] = {
          name: record.employeeId.name,
          employeeId: record.employeeId.employeeId,
          department: record.employeeId.department,
          totalRecords: 0,
          onTime: 0,
          late: 0,
          totalHours: 0
        };
      }
      
      employeeStats[empId].totalRecords++;
      if (record.status === 'onTime') employeeStats[empId].onTime++;
      if (record.status === 'late') employeeStats[empId].late++;
      if (record.duration) employeeStats[empId].totalHours += record.duration / 60;
    });
    
    // Top performers (best punctuality)
    analytics.topPerformers = Object.values(employeeStats)
      .filter(emp => emp.totalRecords >= 5) // Minimum 5 records
      .sort((a, b) => (b.onTime / b.totalRecords) - (a.onTime / a.totalRecords))
      .slice(0, 10)
      .map(emp => ({
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        punctualityRate: Math.round((emp.onTime / emp.totalRecords) * 100),
        totalRecords: emp.totalRecords
      }));
    
    // Frequent late arrivals
    analytics.frequentLateArrivals = Object.values(employeeStats)
      .filter(emp => emp.late > 0)
      .sort((a, b) => b.late - a.late)
      .slice(0, 10)
      .map(emp => ({
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        lateCount: emp.late,
        totalRecords: emp.totalRecords,
        lateRate: Math.round((emp.late / emp.totalRecords) * 100)
      }));
    
    res.json(analytics);
  } catch (error) {
    console.error('Get attendance analytics error:', error);
    res.status(500).json({ message: 'Server error while fetching attendance analytics' });
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

// Get employee details by attendance status (admin only)
router.get('/details/:status', authenticate, isAdmin, async (req, res) => {
  try {
    const { status } = req.params;
    const { startDate, endDate, date } = req.query;
    
    // Validate status parameter
    const validStatuses = ['onTime', 'late', 'absent', 'present'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Build date filter
    let dateFilter = {};
    if (date) {
      // For a specific date
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      dateFilter = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate || endDate) {
      // For a date range
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.$lte = endDateTime;
      }
    } else {
      // Default to today
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));
      dateFilter = { $gte: startOfDay, $lte: endOfDay };
    }

    const Employee = require('../models/employee.model');

    if (status === 'absent') {
      // For absent employees, we need to find employees who didn't check in
      const presentEmployeeIds = await Attendance.find({
        date: dateFilter,
        checkIn: { $exists: true, $ne: null }
      }).distinct('employeeId');

      const absentEmployees = await Employee.find({
        _id: { $nin: presentEmployeeIds },
        status: 'active' // Only include active employees
      }).select('name employeeId email department position phoneNumber').lean();

      return res.json({
        status: 'absent',
        count: absentEmployees.length,
        employees: absentEmployees.map(emp => ({
          ...emp,
          checkIn: null,
          checkOut: null,
          duration: null,
          location: null,
          attendanceStatus: 'absent'
        }))
      });
    }

    // For other statuses, find attendance records
    const filter = {
      date: dateFilter
    };

    if (status === 'present') {
      // All employees who checked in
      filter.checkIn = { $exists: true, $ne: null };
    } else {
      // Specific status (onTime, late)
      filter.status = status;
      filter.checkIn = { $exists: true, $ne: null };
    }

    const attendanceRecords = await Attendance.find(filter)
      .populate('employeeId', 'name employeeId email department position phoneNumber')
      .sort({ checkIn: -1 })
      .lean();

    const employees = attendanceRecords.map(record => ({
      _id: record.employeeId._id,
      name: record.employeeId.name,
      employeeId: record.employeeId.employeeId,
      email: record.employeeId.email,
      department: record.employeeId.department,
      position: record.employeeId.position,
      phoneNumber: record.employeeId.phoneNumber,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      duration: record.duration,
      location: record.locationName || record.location,
      attendanceStatus: record.status
    }));

    res.json({
      status,
      count: employees.length,
      employees
    });

  } catch (error) {
    console.error('Get employee details by status error:', error);
    res.status(500).json({ message: 'Server error while fetching employee details' });
  }
});

// Get personal attendance statistics
router.get('/me/stats', authenticate, async (req, res) => {
  try {
    const employeeId = req.employee._id;
    
    // Get current date for filtering
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Get all attendance records for the current year
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);
    
    const attendanceRecords = await Attendance.find({
      employeeId,
      date: {
        $gte: yearStart,
        $lte: yearEnd
      }
    }).lean();
    
    // Calculate statistics
    let presentDays = 0;
    let lateDays = 0;
    let onTimeDays = 0;
    let totalWorkingHours = 0;
    
    attendanceRecords.forEach(record => {
      if (record.checkIn) {
        presentDays++;
        
        if (record.status === 'late') {
          lateDays++;
        } else if (record.status === 'on-time') {
          onTimeDays++;
        }
        
        if (record.duration) {
          totalWorkingHours += record.duration / 60; // Convert minutes to hours
        }
      }
    });
    
    // Calculate working days in current year (excluding weekends)
    const totalWorkingDays = calculateWorkingDays(yearStart, yearEnd);
    const absences = Math.max(0, totalWorkingDays - presentDays);
    const onTimeRate = presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 0;
    
    // Get current month stats
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    
    const monthlyRecords = attendanceRecords.filter(record => 
      record.date >= monthStart && record.date <= monthEnd
    );
    
    const monthlyPresentDays = monthlyRecords.filter(record => record.checkIn).length;
    const monthlyWorkingDays = calculateWorkingDays(monthStart, monthEnd);
    const monthlyAbsences = Math.max(0, monthlyWorkingDays - monthlyPresentDays);
    
    const stats = {
      // Overall stats
      presentDays,
      absences,
      onTimeRate,
      lateDays,
      totalWorkingHours: Math.round(totalWorkingHours),
      averageHoursPerDay: presentDays > 0 ? Math.round(totalWorkingHours / presentDays * 10) / 10 : 0,
      
      // Monthly stats
      monthly: {
        presentDays: monthlyPresentDays,
        absences: monthlyAbsences,
        workingDays: monthlyWorkingDays
      },
      
      // Additional info
      totalWorkingDays,
      year: currentYear,
      month: currentMonth + 1,
      lastUpdated: new Date()
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Get personal stats error:', error);
    res.status(500).json({ message: 'Server error while fetching personal statistics' });
  }
});

// Helper function to calculate working days (excluding weekends)
function calculateWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

// Get personal monthly attendance

module.exports = router;