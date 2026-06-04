const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const db = require('../config/db');

// In-memory data store for fallback mode
const memoryUsers = [];

// Middleware to protect routes and verify JWT tokens
const protect = async (req, res, next) => {
  let token;

  // Retrieve token from Authorization header or cookies
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token is missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!');
    
    if (db.isConnected()) {
      if (!mongoose.isValidObjectId(decoded.id)) {
        return res.status(401).json({ success: false, message: 'Invalid session token format. Please log in again.' });
      }
      req.user = await User.findById(decoded.id).select('-password');
    } else {
      // Memory Fallback Search
      const memUser = memoryUsers.find(u => u._id === decoded.id);
      if (memUser) {
        req.user = {
          _id: memUser._id,
          fullname: memUser.fullname,
          email: memUser.email
        };
      }
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User matching token not found' });
    }
    next();
  } catch (error) {
    console.error('Auth verification error:', error.message);
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  const { fullname, email, password } = req.body;

  if (!fullname || !email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide all details (fullname, email, password)' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
  }

  try {
    const emailLower = email.toLowerCase().trim();

    if (db.isConnected()) {
      // Check if user already exists in Mongo
      const userExists = await User.findOne({ email: emailLower });
      if (userExists) {
        return res.status(400).json({ success: false, message: 'User already exists with this email' });
      }

      // Create user
      const user = await User.create({
        fullname,
        email: emailLower,
        password
      });

      // Generate JWT
      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!',
        { expiresIn: '30d' }
      );

      setAuthCookie(res, token);

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          fullname: user.fullname,
          email: user.email
        }
      });
    } else {
      // Memory Fallback Registration
      const userExists = memoryUsers.find(u => u.email === emailLower);
      if (userExists) {
        return res.status(400).json({ success: false, message: 'User already exists with this email' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const memUser = {
        _id: 'mem_usr_' + Math.random().toString(36).substring(2, 11),
        fullname,
        email: emailLower,
        password: hashedPassword,
        createdAt: new Date()
      };

      memoryUsers.push(memUser);

      const token = jwt.sign(
        { id: memUser._id },
        process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!',
        { expiresIn: '30d' }
      );

      setAuthCookie(res, token);

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: memUser._id,
          fullname: memUser.fullname,
          email: memUser.email
        }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password' });
  }

  try {
    const emailLower = email.toLowerCase().trim();

    if (db.isConnected()) {
      // Find user by email in Mongo
      const user = await User.findOne({ email: emailLower });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!',
        { expiresIn: '30d' }
      );

      setAuthCookie(res, token);

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id,
          fullname: user.fullname,
          email: user.email
        }
      });
    } else {
      // Memory Fallback Login
      const memUser = memoryUsers.find(u => u.email === emailLower);
      if (!memUser) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, memUser.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: memUser._id },
        process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!',
        { expiresIn: '30d' }
      );

      setAuthCookie(res, token);

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: memUser._id,
          fullname: memUser.fullname,
          email: memUser.email
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// @route   POST /api/auth/logout
// @desc    Log user out / clear cookie
// @access  Public
router.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0) });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      fullname: req.user.fullname,
      email: req.user.email
    }
  });
});

// Helper to set cookie
const setAuthCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
};

module.exports = {
  router,
  protect
};
