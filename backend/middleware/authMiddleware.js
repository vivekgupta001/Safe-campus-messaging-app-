const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'safecampussupersecretjwtkey123');

      // Get user from database
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }

      if (user.isMutedOrBanned) {
        return res.status(403).json({ success: false, message: 'Your account has been suspended or banned.' });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('JWT auth error:', error.message);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Access denied: Admin role required' });
  }
};

const approvedOnly = (req, res, next) => {
  if (req.user && req.user.isApproved) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Account pending activation. A waiting period is required for Admin ID verification.' 
    });
  }
};

module.exports = { protect, adminOnly, approvedOnly };
