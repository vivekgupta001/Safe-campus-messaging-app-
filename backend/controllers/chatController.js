const Friendship = require('../models/Friendship');
const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Send a friend request after a call
// @route   POST /api/chat/request
// @access  Private
const sendFriendRequest = async (req, res) => {
  try {
    const { recipientId, callDuration } = req.body;
    const requesterId = req.user._id;

    if (!recipientId) {
      return res.status(400).json({ success: false, message: 'Recipient user ID is required' });
    }

    if (requesterId.toString() === recipientId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot add yourself' });
    }

    // Check if friendship already exists
    const existing = await Friendship.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId }
      ]
    });

    if (existing) {
      // If it exists, let's see its status
      if (existing.status === 'accepted') {
        return res.status(400).json({ success: false, message: 'You are already friends' });
      }
      
      // If the OTHER person already sent a request, auto-accept it! Mutual consent!
      if (existing.recipient.toString() === requesterId.toString() && existing.status === 'pending') {
        const updated = await Friendship.findByIdAndUpdate(existing._id, { 
          status: 'accepted',
          callDuration: Math.max(existing.callDuration || 0, callDuration || 0)
        });
        
        // Increment conversation count for both
        await User.findByIdAndUpdate(requesterId, { $inc: { conversationCount: 1 } });
        await User.findByIdAndUpdate(recipientId, { $inc: { conversationCount: 1 } });

        return res.json({ 
          success: true, 
          friendship: updated, 
          status: 'accepted', 
          message: 'Mutual consent! Friend request accepted, chat unlocked!' 
        });
      }

      return res.status(400).json({ success: false, message: 'Friend request is already pending' });
    }

    // Create a new pending friendship request
    const friendship = await Friendship.create({
      requester: requesterId,
      recipient: recipientId,
      status: 'pending',
      callDuration: callDuration || 0
    });

    return res.status(201).json({
      success: true,
      friendship,
      status: 'pending',
      message: 'Friend request sent! Waiting for mutual consent.'
    });
  } catch (err) {
    console.error('Error sending friend request:', err);
    return res.status(500).json({ success: false, message: 'Server error sending request' });
  }
};

// @desc    Accept or Reject a pending friend request
// @route   PUT /api/chat/request/:id
// @access  Private
const respondFriendRequest = async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const friendshipId = req.params.id;
    const userId = req.user._id;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action: must be accept or reject' });
    }

    const friendship = await Friendship.findById(friendshipId);
    if (!friendship) {
      return res.status(404).json({ success: false, message: 'Friend request not found' });
    }

    // Ensure only the recipient can accept or reject
    if (friendship.recipient.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'You are not authorized to respond to this request' });
    }

    if (action === 'accept') {
      const updated = await Friendship.findByIdAndUpdate(friendshipId, { 
        status: 'accepted',
        updatedAt: new Date()
      });

      // Increment conversation count for both
      await User.findByIdAndUpdate(friendship.requester, { $inc: { conversationCount: 1 } });
      await User.findByIdAndUpdate(friendship.recipient, { $inc: { conversationCount: 1 } });

      return res.json({
        success: true,
        friendship: updated,
        message: 'Friend request accepted! Chat unlocked!'
      });
    } else {
      // Reject request
      await Friendship.findByIdAndUpdate(friendshipId, { 
        status: 'rejected',
        updatedAt: new Date()
      });

      return res.json({
        success: true,
        message: 'Friend request declined.'
      });
    }
  } catch (err) {
    console.error('Error responding to friend request:', err);
    return res.status(500).json({ success: false, message: 'Server error responding to request' });
  }
};

// @desc    Get all friends (accepted friendships)
// @route   GET /api/chat/friends
// @access  Private
const getFriends = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch friendships where user is requester or recipient and status is accepted
    const list = await Friendship.find({
      $or: [
        { requester: userId, status: 'accepted' },
        { recipient: userId, status: 'accepted' }
      ]
    });

    // Populate and format list, hiding sensitive email/details and selecting only pseudonym/avatar/interests
    const friends = list.map(item => {
      const otherUser = item.requester._id.toString() === userId.toString() 
        ? item.recipient 
        : item.requester;

      return {
        friendshipId: item._id,
        chatRoomId: item._id.toString(), // We use the friendship database ID as unique socket room ID
        friend: {
          _id: otherUser._id,
          pseudonym: otherUser.pseudonym,
          avatar: otherUser.avatar,
          gender: otherUser.gender,
          interests: otherUser.interests
        },
        callDuration: item.callDuration,
        connectedAt: item.updatedAt
      };
    });

    // Also fetch pending requests where the user is the recipient to display in the UI
    const pendingList = await Friendship.find({
      recipient: userId,
      status: 'pending'
    });

    const pendingRequests = pendingList.map(item => ({
      friendshipId: item._id,
      requester: {
        _id: item.requester._id,
        pseudonym: item.requester.pseudonym,
        avatar: item.requester.avatar,
        gender: item.requester.gender,
        interests: item.requester.interests
      },
      callDuration: item.callDuration,
      createdAt: item.createdAt
    }));

    return res.json({
      success: true,
      friends,
      pendingRequests
    });
  } catch (err) {
    console.error('Error getting friends:', err);
    return res.status(500).json({ success: false, message: 'Server error loading connections' });
  }
};

// @desc    Get chat message history for a specific room
// @route   GET /api/chat/history/:roomId
// @access  Private
const getChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    // Validate user is member of this friendship/room
    const friendship = await Friendship.findById(roomId);
    if (!friendship || friendship.status !== 'accepted') {
      return res.status(403).json({ success: false, message: 'Access denied: not an unlocked friend chat room' });
    }

    if (
      friendship.requester._id.toString() !== userId.toString() &&
      friendship.recipient._id.toString() !== userId.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied: not authorized to read these messages' });
    }

    const messages = await Message.find({ chatRoomId: roomId });

    return res.json({
      success: true,
      chatRoomId: roomId,
      messages
    });
  } catch (err) {
    console.error('Error loading chat history:', err);
    return res.status(500).json({ success: false, message: 'Server error loading messages history' });
  }
};

module.exports = {
  sendFriendRequest,
  respondFriendRequest,
  getFriends,
  getChatHistory
};
