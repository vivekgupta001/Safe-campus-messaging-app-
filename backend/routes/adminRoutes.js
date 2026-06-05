const express = require('express');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getPendingApprovals,
  approveUser,
  rejectUser,
  getAdminStats,
  getReports,
  toggleBanUser
} = require('../controllers/adminController');

const router = express.Router();

// Apply admin protection to all routes below
router.use(protect);
router.use(adminOnly);

router.get('/pending', getPendingApprovals);
router.post('/approve/:id', approveUser);
router.post('/reject/:id', rejectUser);
router.get('/stats', getAdminStats);
router.get('/reports', getReports);
router.post('/ban/:id', toggleBanUser);

module.exports = router;
