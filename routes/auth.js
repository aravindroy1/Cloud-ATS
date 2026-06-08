const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const db = require('../config/db');
const msal = require('@azure/msal-node');
const { getSecret } = require('../config/keyvault');
const { sendEmail } = require('../utils/mailer');

let msalClient = null;

const getMsalClient = () => {
  if (!msalClient) {
    const msalConfig = {
      auth: {
        clientId: getSecret('AZURE_CLIENT_ID') || process.env.AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${getSecret('AZURE_TENANT_ID') || process.env.AZURE_TENANT_ID || 'common'}`,
        clientSecret: getSecret('AZURE_CLIENT_SECRET') || process.env.AZURE_CLIENT_SECRET,
      }
    };
    msalClient = new msal.ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
};

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token is missing' });
  }

  try {
    const jwtSecret = getSecret('JWT_SECRET') || process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!';
    const decoded = jwt.verify(token, jwtSecret);
    
    if (db.isConnected()) {
      if (!mongoose.isValidObjectId(decoded.id)) {
        return res.status(401).json({ success: false, message: 'Invalid session token format.' });
      }
      req.user = await User.findById(decoded.id);
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

const setAuthCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
};

router.get('/login', async (req, res) => {
  try {
    const authCodeUrlParameters = {
      scopes: ["user.read"],
      redirectUri: process.env.REDIRECT_URI || "http://localhost:8080/api/auth/redirect",
    };

    const client = getMsalClient();
    const url = await client.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(url);
  } catch (error) {
    console.error('MSAL Auth URL error:', error);
    res.status(500).send('Error initiating login');
  }
});

router.get('/redirect', async (req, res) => {
  try {
    const tokenRequest = {
      code: req.query.code,
      scopes: ["user.read"],
      redirectUri: process.env.REDIRECT_URI || "http://localhost:8080/api/auth/redirect",
    };

    const client = getMsalClient();
    const response = await client.acquireTokenByCode(tokenRequest);
    
    const account = response.account;
    const email = account.username;
    const fullname = account.name;

    let user = null;
    let isNewUser = false;

    if (db.isConnected()) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        user = await User.create({
          fullname,
          email: email.toLowerCase(),
          password: 'ENTRA_ID_USER', // Dummy password for Entra ID users
        });
        isNewUser = true;
      }
    } else {
      return res.status(500).json({ success: false, message: 'DB not connected' });
    }

    const jwtSecret = getSecret('JWT_SECRET') || process.env.JWT_SECRET || 'supersecretjwtkeyforresumeanalyzer123!';
    const token = jwt.sign(
      { id: user._id },
      jwtSecret,
      { expiresIn: '30d' }
    );

    setAuthCookie(res, token);

    if (isNewUser) {
      await sendEmail(email, 'Welcome to Cloud-ATS', `Hello ${fullname},\n\nWelcome to Cloud-ATS application! Start analyzing your resumes today.`, `<h3>Hello ${fullname},</h3><p>Welcome to Cloud-ATS application! Start analyzing your resumes today.</p>`);
    }

    // Redirect to frontend dashboard
    res.redirect('/');
  } catch (error) {
    console.error('MSAL Redirect error:', error);
    res.status(500).send('Error during authentication callback');
  }
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0) });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

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

module.exports = {
  router,
  protect
};
