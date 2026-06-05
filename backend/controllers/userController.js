const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Message = require('../models/Message');

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: {
        _id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        gender: user.gender,
        interests: user.interests,
        role: user.role,
        isApproved: user.isApproved,
        conversationCount: user.conversationCount,
        responseRate: user.responseRate,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving profile' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const { pseudonym, avatar, interests } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if pseudonym is taken by another user
    if (pseudonym && pseudonym !== user.pseudonym) {
      const exists = await User.findOne({ pseudonym });
      if (exists) {
        return res.status(400).json({ success: false, message: 'Pseudonym is already taken' });
      }
      user.pseudonym = pseudonym;
    }

    if (avatar) user.avatar = avatar;
    
    if (interests) {
      user.interests = Array.isArray(interests) ? interests : JSON.parse(interests);
    }

    // Save update based on active DB mode
    const updatedUser = await User.findByIdAndUpdate(
      user._id, 
      {
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        interests: user.interests
      },
      { new: true }
    );

    return res.json({
      success: true,
      user: {
        _id: updatedUser._id,
        pseudonym: updatedUser.pseudonym,
        avatar: updatedUser.avatar,
        gender: updatedUser.gender,
        interests: updatedUser.interests,
        role: updatedUser.role,
        isApproved: updatedUser.isApproved,
        conversationCount: updatedUser.conversationCount,
        responseRate: updatedUser.responseRate
      },
      message: 'Profile updated successfully!'
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};

// @desc    Get user-specific analytics metrics
// @route   GET /api/users/stats
// @access  Private
const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch friendships to count matches and calculate rates
    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }]
    });

    const totalConversations = friendships.length;
    const friendsCount = friendships.filter(f => f.status === 'accepted').length;
    const pendingCount = friendships.filter(f => f.status === 'pending').length;

    // Calculate response rate: ratio of accepted vs (accepted + rejected) requests received by the user
    const receivedRequests = friendships.filter(f => 
      f.recipient.toString() === userId.toString()
    );
    const receivedTotal = receivedRequests.length;
    const acceptedCount = receivedRequests.filter(f => f.status === 'accepted').length;

    let responseRate = 100;
    if (receivedTotal > 0) {
      responseRate = Math.round((acceptedCount / receivedTotal) * 100);
    }

    // Calculate total voice call duration
    const totalCallMinutes = friendships.reduce((sum, f) => sum + (f.callDuration || 0), 0) / 60;

    // Calculate message counts
    const userMessages = await Message.find({
      $or: [{ sender: userId }, { recipient: userId }]
    });

    return res.json({
      success: true,
      stats: {
        conversationCount: totalConversations,
        friendsCount,
        pendingCount,
        responseRate: responseRate,
        totalCallMinutes: Math.round(totalCallMinutes * 10) / 10,
        messagesCount: userMessages.length
      }
    });
  } catch (err) {
    console.error('Error loading user stats:', err);
    return res.status(500).json({ success: false, message: 'Server error loading metrics' });
  }
};

module.exports = { getUserProfile, updateUserProfile, getUserStats };
