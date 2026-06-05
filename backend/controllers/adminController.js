const User = require('../models/User');
const Report = require('../models/Report');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');

// @desc    Get all users pending admin approval
// @route   GET /api/admin/pending
// @access  Private/Admin
const getPendingApprovals = async (req, res) => {
  try {
    const users = await User.find({ isApproved: false, role: { $ne: 'admin' } });
    
    return res.json({
      success: true,
      pendingCount: users.length,
      users: users.map(user => ({
        _id: user._id,
        email: user.email,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        gender: user.gender,
        collegeIdUrl: user.collegeIdUrl,
        createdAt: user.createdAt
      }))
    });
  } catch (err) {
    console.error('Error getting pending approvals:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving pending approvals' });
  }
};

// @desc    Approve a student account
// @route   POST /api/admin/approve/:id
// @access  Private/Admin
const approveUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.findByIdAndUpdate(user._id, { isApproved: true });
    
    return res.json({
      success: true,
      message: `Successfully approved student account: "${user.pseudonym}"`
    });
  } catch (err) {
    console.error('Error approving user:', err);
    return res.status(500).json({ success: false, message: 'Server error approving user' });
  }
};

// @desc    Reject a student account (deletes profile so they can re-register with valid ID)
// @route   POST /api/admin/reject/:id
// @access  Private/Admin
const rejectUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.deleteOne({ _id: user._id });
    
    return res.json({
      success: true,
      message: `Rejected and removed pending account: "${user.pseudonym}"`
    });
  } catch (err) {
    console.error('Error rejecting user:', err);
    return res.status(500).json({ success: false, message: 'Server error rejecting user' });
  }
};

// @desc    Get dashboard analytics metrics for admins
// @route   GET /api/admin/stats
// @access  Private/Admin
const getAdminStats = async (req, res) => {
  try {
    const users = await User.find({});
    const reports = await Report.find({});
    const friendships = await Friendship.find({});
    
    const totalUsers = users.length;
    const approvedUsers = users.filter(u => u.isApproved).length;
    const pendingApprovals = totalUsers - approvedUsers;
    const bannedUsers = users.filter(u => u.isMutedOrBanned).length;

    const totalCalls = friendships.length;
    const activeChats = friendships.filter(f => f.status === 'accepted').length;

    // Retrieve toxic/flagged messages count
    const flaggedMessages = await Message.find({ isFlagged: true });

    return res.json({
      success: true,
      stats: {
        totalUsers,
        approvedUsers,
        pendingApprovals,
        bannedUsers,
        totalCalls,
        activeChats,
        flaggedMessagesCount: flaggedMessages.length,
        reportsCount: reports.length,
        pendingReportsCount: reports.filter(r => r.status === 'pending').length
      }
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching administrator stats' });
  }
};

// @desc    Get all filed reports
// @route   GET /api/admin/reports
// @access  Private/Admin
const getReports = async (req, res) => {
  try {
    const reports = await Report.find({});
    return res.json({
      success: true,
      reports
    });
  } catch (err) {
    console.error('Error listing reports:', err);
    return res.status(500).json({ success: false, message: 'Server error loading safety reports' });
  }
};

// @desc    Toggle mute/ban status for an abusive user
// @route   POST /api/admin/ban/:id
// @access  Private/Admin
const toggleBanUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentBanStatus = user.isMutedOrBanned || false;
    const updatedUser = await User.findByIdAndUpdate(
      user._id, 
      { isMutedOrBanned: !currentBanStatus }, 
      { new: true }
    );

    return res.json({
      success: true,
      isMutedOrBanned: updatedUser.isMutedOrBanned,
      message: `User "${user.pseudonym}" has been ${updatedUser.isMutedOrBanned ? 'BANNED' : 'UNBANNED'} successfully.`
    });
  } catch (err) {
    console.error('Error toggling ban status:', err);
    return res.status(500).json({ success: false, message: 'Server error updating user ban status' });
  }
};

module.exports = {
  getPendingApprovals,
  approveUser,
  rejectUser,
  getAdminStats,
  getReports,
  toggleBanUser
};
