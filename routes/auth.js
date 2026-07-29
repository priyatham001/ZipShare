const express = require('express');
const router = express.Router();
const {
  issueToken,
  clearToken,
  getAuthState,
  isLocked,
  registerFailure,
  registerSuccess,
} = require('../middleware/auth');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

router.get('/status', (req, res) => {
  res.json({ isAdmin: getAuthState(req) });
});

router.post('/login', (req, res) => {
  const ip = req.ip;
  const lockedSeconds = isLocked(ip);
  if (lockedSeconds) {
    return res.status(429).json({
      success: false,
      locked: true,
      retryAfter: lockedSeconds,
      message: `Too many attempts. Please try again in ${lockedSeconds} seconds.`,
    });
  }

  const { password } = req.body;
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ success: false, message: 'Password is required.' });
  }

  if (password === ADMIN_PASSWORD) {
    registerSuccess(ip);
    issueToken(res);
    return res.json({ success: true, message: 'Login successful.' });
  }

  registerFailure(ip);
  const nowLocked = isLocked(ip);
  if (nowLocked) {
    return res.status(429).json({
      success: false,
      locked: true,
      retryAfter: nowLocked,
      message: `Access denied. Too many failed attempts. Please try again in ${nowLocked} seconds.`,
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Access Denied. Incorrect password. Please try again.',
  });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ success: true, message: 'Logout successful.' });
});

module.exports = router;
