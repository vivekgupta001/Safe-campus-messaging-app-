const express = require('express');
const { protect, approvedOnly } = require('../middleware/authMiddleware');
const { 
  sendFriendRequest, 
  respondFriendRequest, 
  getFriends, 
  getChatHistory 
} = require('../controllers/chatController');

const router = express.Router();

router.post('/request', protect, approvedOnly, sendFriendRequest);
router.put('/request/:id', protect, approvedOnly, respondFriendRequest);
router.get('/friends', protect, approvedOnly, getFriends);
router.get('/history/:roomId', protect, approvedOnly, getChatHistory);

module.exports = router;
