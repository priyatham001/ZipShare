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
      message: 'Protected by Admin.',
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
        message: 'Protected by Admin.',
        emoji: '😂',
        retryAfter: 30
      });
    }

    return res.status(401).json({
      error: 'wrong_password',
      message: '❌ Wrong Password\nProtected by Admin.',
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

// ---- Promo & App Links Settings (Public read, Admin update) ----
const fs = require('fs');
const path = require('path');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

const DEFAULT_SETTINGS = {
  replicaLink: 'https://betadrop.app/i/csGXSh',
  replicaTitle: 'REPLICA: Keyboard Companion',
  replicaSubtext: 'Try our new APK — click to install REPLICA directly on your device',
  replicaBadge: 'TRY OUR NEW APK',
  replicaBtnText: 'Install REPLICA APK 📲',
  promoEnabled: true,
  updatedAt: new Date().toISOString()
};

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const data = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (err) {
    console.warn('Using default settings:', err.message);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(data) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write settings.json:', err.message);
  }
}

// GET /api/admin/settings (publicly accessible so all clients fetch latest links)
router.get('/settings', (req, res) => {
  res.json(getSettings());
});

// PUT /api/admin/settings (Admin only: update replica download link & promo details)
router.put('/settings', requireAdmin, (req, res) => {
  const current = getSettings();
  const {
    replicaLink,
    replicaTitle,
    replicaSubtext,
    replicaBadge,
    replicaBtnText,
    promoEnabled
  } = req.body;

  const updated = {
    ...current,
    replicaLink: replicaLink !== undefined && String(replicaLink).trim() ? String(replicaLink).trim() : current.replicaLink,
    replicaTitle: replicaTitle !== undefined && String(replicaTitle).trim() ? String(replicaTitle).trim() : current.replicaTitle,
    replicaSubtext: replicaSubtext !== undefined ? String(replicaSubtext).trim() : current.replicaSubtext,
    replicaBadge: replicaBadge !== undefined && String(replicaBadge).trim() ? String(replicaBadge).trim() : current.replicaBadge,
    replicaBtnText: replicaBtnText !== undefined && String(replicaBtnText).trim() ? String(replicaBtnText).trim() : current.replicaBtnText,
    promoEnabled: promoEnabled !== undefined ? Boolean(promoEnabled) : current.promoEnabled,
    updatedAt: new Date().toISOString()
  };

  saveSettings(updated);
  res.json({ success: true, message: 'Settings updated successfully', settings: updated });
});

module.exports = router;


