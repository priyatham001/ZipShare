const express = require('express');
const router = express.Router();
const { suggestionsDB } = require('../db');
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
      title: '😂 Nice Try!',
      message: 'Protected by PSK.',
      emoji: '😂',
      retryAfter: lockedSeconds
    });
  }

  const { password } = req.body;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (!password || password !== expectedPassword) {
    const state = registerFailedAttempt(ip);
    const justLocked = state.lockedUntil && Date.now() < state.lockedUntil;

    if (justLocked) {
      return res.status(429).json({
        error: 'locked',
        title: '😂 Nice Try!',
        message: 'Protected by PSK.',
        emoji: '😂',
        retryAfter: 30
      });
    }

    return res.status(401).json({
      error: 'wrong_password',
      message: '❌ Wrong Password\nProtected by PSK.',
      failedAttempts: state.count
    });
  }

  registerSuccess(ip);
  const token = issueToken();
  res.json({ token, message: 'Login Successful' });
});

// ---- Suggestions management (admin only) ----

router.get('/suggestions', requireAdmin, async (req, res) => {
  const suggestions = await suggestionsDB.find({}, { pinned: -1, order: 1 });
  res.json(suggestions);
});

router.post('/suggestions', requireAdmin, async (req, res) => {
  const { text, pinned = false, order = 0 } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });
  const suggestion = await suggestionsDB.create({ text: text.trim(), type: 'manual', pinned, order });
  res.status(201).json(suggestion);
});

router.put('/suggestions/:id', requireAdmin, async (req, res) => {
  const { text, pinned, order } = req.body;
  const update = {};
  if (text !== undefined) update.text = text;
  if (pinned !== undefined) update.pinned = pinned;
  if (order !== undefined) update.order = order;
  const suggestion = await suggestionsDB.findByIdAndUpdate(req.params.id, update);
  if (!suggestion) return res.status(404).json({ error: 'Not found' });
  res.json(suggestion);
});

router.delete('/suggestions/:id', requireAdmin, async (req, res) => {
  const result = await suggestionsDB.findByIdAndDelete(req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;

