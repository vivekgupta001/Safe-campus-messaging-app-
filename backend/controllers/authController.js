const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper to sign JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'safecampussupersecretjwtkey123', {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { email, password, pseudonym, avatar, gender, interests } = req.body;

    if (!email || !password || !pseudonym || !avatar || !gender) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields' });
    }

    // Check if college ID upload is present
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload your College ID image for validation' });
    }

    // Check if user already exists in either DB
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ success: false, message: 'Email address already registered' });
    }

    const pseudonymExists = await User.findOne({ pseudonym });
    if (pseudonymExists) {
      return res.status(400).json({ success: false, message: 'Pseudonym is already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save relative URL path for the ID upload
    const collegeIdUrl = `/uploads/${req.file.filename}`;

    // Auto-approve and elevate admin accounts if email contains "admin" (highly useful for MVP testing!)
    const isAdmin = email.toLowerCase().includes('admin');
    const role = isAdmin ? 'admin' : 'user';
    const isApproved = isAdmin ? true : false; // Admins are pre-approved

    // Parse interests array
    let interestsArray = [];
    if (interests) {
      try {
        interestsArray = typeof interests === 'string' ? JSON.parse(interests) : interests;
      } catch (err) {
        interestsArray = interests.split(',').map(i => i.trim());
      }
    }

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      pseudonym,
      avatar,
      gender,
      interests: interestsArray,
      collegeIdUrl,
      role,
      isApproved,
      isOnline: false,
      isMutedOrBanned: false
    });

    if (user) {
      return res.status(201).json({
        success: true,
        _id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        gender: user.gender,
        role: user.role,
        isApproved: user.isApproved,
        token: generateToken(user._id),
        message: isAdmin 
          ? 'Admin account created and approved successfully!' 
          : 'Registration successful! Your College ID has been uploaded and is pending Admin approval.'
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid user data' });
    }
  } catch (err) {
    console.error('Error registering user:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration', error: err.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isMutedOrBanned) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended or banned.' });
    }

    return res.json({
      success: true,
      _id: user._id,
      pseudonym: user.pseudonym,
      avatar: user.avatar,
      gender: user.gender,
      role: user.role,
      isApproved: user.isApproved,
      token: generateToken(user._id)
    });
  } catch (err) {
    console.error('Error logging in user:', err);
    return res.status(500).json({ success: false, message: 'Server error during login', error: err.message });
  }
};

module.exports = { registerUser, loginUser };
