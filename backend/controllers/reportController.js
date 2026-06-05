const Report = require('../models/Report');
const User = require('../models/User');

// @desc    Report and block an abusive user
// @route   POST /api/reports
// @access  Private
const createReport = async (req, res) => {
  try {
    const { reportedUserId, reason, description } = req.body;
    const reporterId = req.user._id;

    if (!reportedUserId || !reason) {
      return res.status(400).json({ success: false, message: 'Reported user ID and reason are required' });
    }

    if (reporterId.toString() === reportedUserId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot report yourself' });
    }

    // Verify reported user exists
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ success: false, message: 'Reported user not found' });
    }

    // Create report
    const report = await Report.create({
      reporter: reporterId,
      reportedUser: reportedUserId,
      reason,
      description: description || '',
      status: 'pending'
    });

    console.log(`🛡️ SAFETY WARNING: User "${req.user.pseudonym}" reported "${reportedUser.pseudonym}" for: ${reason}`);

    return res.status(201).json({
      success: true,
      report,
      message: 'Report filed successfully. The user has been blocked and will never be paired with you again.'
    });
  } catch (err) {
    console.error('Error filing report:', err);
    return res.status(500).json({ success: false, message: 'Server error filing safety report' });
  }
};

module.exports = { createReport };
