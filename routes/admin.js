const express = require('express');
const router = express.Router();
const Suggestion = require('../models/Suggestion');
const { requireAdmin, isLocked, registerFailedAttempt, registerSuccess, issueToken } = require('../middleware/auth');

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const ip = clientIp(req);
  const lockedSeconds = isLocked(ip);

  if (lockedSeconds > 0) {
    return res.status(429).json({
      error: 'locked',
      message: "🚫 Too many failed attempts. Don't try to log in like this — this platform is protected by PPSK. Try again shortly.",
      emoji: '😂',
      retryAfter: lockedSeconds
    });
  }

  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (!password || password !== adminPassword) {
    const state = registerFailedAttempt(ip);
    const justLocked = state.lockedUntil && Date.now() < state.lockedUntil;

    if (justLocked) {
      return res.status(429).json({
        error: 'locked',
        message: "🚫 Don't try to log in — this is highly protected by PPSK. Access temporarily disabled for 30 seconds.",
        emoji: '😂',
        retryAfter: 30
      });
    }

    return res.status(401).json({
      error: 'wrong_password',
      message: 'Access Denied. Incorrect password. Please try again.'
    });
  }

  registerSuccess(ip);
  const token = issueToken();
  res.json({ token, message: 'Login Successful' });
});

// ---- Suggestions management (admin only for write, public for read) ----

// GET /api/admin/suggestions - list all manual suggestions (admin view, includes unpinned)
router.get('/suggestions', requireAdmin, async (req, res) => {
  const suggestions = await Suggestion.find().sort({ pinned: -1, order: 1, createdAt: -1 });
  res.json(suggestions);
});

router.post('/suggestions', requireAdmin, async (req, res) => {
  const { text, pinned = false, order = 0 } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });
  const suggestion = await Suggestion.create({ text: text.trim(), type: 'manual', pinned, order });
  res.status(201).json(suggestion);
});

router.put('/suggestions/:id', requireAdmin, async (req, res) => {
  const { text, pinned, order } = req.body;
  const update = {};
  if (text !== undefined) update.text = text;
  if (pinned !== undefined) update.pinned = pinned;
  if (order !== undefined) update.order = order;
  const suggestion = await Suggestion.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!suggestion) return res.status(404).json({ error: 'Not found' });
  res.json(suggestion);
});

router.delete('/suggestions/:id', requireAdmin, async (req, res) => {
  const result = await Suggestion.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
