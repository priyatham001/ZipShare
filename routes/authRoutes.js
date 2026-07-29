const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Slow down brute-force password guessing: 8 attempts per 10 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// GET current auth state + a fresh CSRF token for this session.
router.get('/status', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.json({
    isAdmin: Boolean(req.session.isAdmin),
    csrfToken: req.session.csrfToken
  });
});

// POST /api/auth/login  { password }
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!password || !hash) {
    return res.status(400).json({ error: 'Password required' });
  }

  const ok = await bcrypt.compare(password, hash);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  req.session.isAdmin = true;
  req.session.regenerate ? null : null; // session already exists via cookie
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.json({ success: true, csrfToken: req.session.csrfToken });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

module.exports = router;
