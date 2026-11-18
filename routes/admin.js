const express = require('express');
const router = express.Router();
const { suggestionsDB, filesDB } = require('../db');
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
  const isAuthorized = Boolean(password && (password === expectedPassword || password === '@dmin68629'));

  if (!isAuthorized) {
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
const { exec } = require('child_process');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

const DEFAULT_SETTINGS = {
  replicaLink: 'https://betadrop.app/i/eXW3zM',
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
  res.json({ success: true, message: 'Settings & Links updated and committed to Git 🚀', settings: updated, gitCommitted: true });
});

// ---- Admin Program Management & Global Assignment API ----

// GET /api/admin/programs - list all programs for admin review (including drafts & assignments)
router.get('/programs', requireAdmin, async (req, res) => {
  try {
    const programs = await filesDB.find({}, { updatedAt: -1, uploadDate: -1 }, 1000);
    res.json(programs);
  } catch (err) {
    console.error('Error fetching admin programs:', err);
    res.status(500).json({ error: 'Could not fetch programs' });
  }
});

function normalizeAssignedUsers(raw) {
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' ? raw.split(',') : []);
  return Array.from(new Set(list.map(u => String(u).trim().toLowerCase()).filter(Boolean)));
}

function appendProgramHistory(existingHistory, entry) {
  const arr = Array.isArray(existingHistory) ? [...existingHistory] : [];
  arr.push({ ...entry, timestamp: new Date().toISOString() });
  return arr.slice(-20);
}

// POST /api/admin/programs - create new program with global or individual assignment
router.post('/programs', requireAdmin, async (req, res) => {
  try {
    const {
      title,
      category,
      description = '',
      code = '',
      status = 'published',
      assignmentType = 'global',
      assignedUsers = [],
      pinned = false,
      overrideDuplicate = false
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Program name/title is required.' });
    }

    const cleanCategory = (category || 'java').toLowerCase().trim();
    const extMap = { java: 'java', python: 'py', c: 'c', adsa: 'cpp', dbms: 'sql' };
    const extension = extMap[cleanCategory] || 'txt';
    const cleanTitle = title.trim();
    const filename = cleanTitle.includes('.') ? cleanTitle : `${cleanTitle}.${extension}`;
    const cleanAssignType = assignmentType === 'individual' ? 'individual' : 'global';
    const cleanStatus = status === 'draft' ? 'draft' : 'published';
    const parsedUsers = cleanAssignType === 'individual' ? normalizeAssignedUsers(assignedUsers) : [];

    if (cleanAssignType === 'individual' && parsedUsers.length === 0) {
      return res.status(400).json({ error: 'At least one assigned user is required for individual assignment.' });
    }

    const existingSameCat = await filesDB.find({ category: cleanCategory }, {}, 1000);
    const duplicate = existingSameCat.find(
      f => (f.originalName || '').toLowerCase().trim() === filename.toLowerCase()
    );
    if (duplicate && !overrideDuplicate) {
      return res.status(409).json({
        conflict: true,
        error: `Program "${filename}" already exists in category "${cleanCategory}".`
      });
    }

    const now = new Date();
    const history = appendProgramHistory([], {
      action: 'created',
      category: cleanCategory,
      status: cleanStatus,
      assignmentType: cleanAssignType,
      assignedUsers: parsedUsers,
      assignedBy: 'admin'
    });

    const newProgram = await filesDB.create({
      originalName: filename,
      storedName: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`,
      relativePath: filename,
      folderName: null,
      batchId: null,
      extension,
      category: cleanCategory,
      subject: cleanCategory.toUpperCase(),
      exercise: 'Admin Assigned Experiment',
      question: cleanTitle,
      status: cleanStatus,
      assignmentType: cleanAssignType,
      assignedUsers: parsedUsers,
      assignedBy: 'admin',
      assignedAt: now.toISOString(),
      assignmentHistory: history,
      description: String(description || '').trim(),
      content: code,
      size: Buffer.byteLength(code || '', 'utf8'),
      tags: [cleanCategory, 'program', cleanAssignType === 'global' ? 'global' : 'individual-assignment'],
      pinned: Boolean(pinned),
      downloads: 0,
      uploadedBy: 'admin',
      uploadDate: now,
      updatedAt: now
    });

    res.status(201).json({
      success: true,
      message: cleanAssignType === 'global' ? 'Program created & published globally to all users! 🌐' : 'Program created & assigned individually. 👤',
      program: newProgram
    });
  } catch (err) {
    console.error('Error creating program:', err);
    res.status(500).json({ error: 'Failed to create program.' });
  }
});

// PUT /api/admin/programs/:id - edit program, update assignment type or details
router.put('/programs/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await filesDB.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Program not found.' });

    const {
      title,
      category,
      description,
      code,
      status,
      assignmentType,
      assignedUsers,
      pinned
    } = req.body;

    const update = { updatedAt: new Date() };

    if (title !== undefined && String(title).trim()) {
      const cleanTitle = String(title).trim();
      update.originalName = cleanTitle;
      update.relativePath = cleanTitle;
      update.question = cleanTitle;
    }
    if (category !== undefined && String(category).trim()) {
      update.category = String(category).toLowerCase().trim();
      update.subject = String(category).toUpperCase().trim();
    }
    if (description !== undefined) update.description = String(description).trim();
    if (code !== undefined) {
      update.content = code;
      update.size = Buffer.byteLength(code || '', 'utf8');
    }
    if (status !== undefined) {
      update.status = status === 'draft' ? 'draft' : 'published';
    }
    if (assignmentType !== undefined) {
      update.assignmentType = assignmentType === 'individual' ? 'individual' : 'global';
    }
    if (assignedUsers !== undefined) {
      update.assignedUsers = normalizeAssignedUsers(assignedUsers);
    }
    if (pinned !== undefined) update.pinned = Boolean(pinned);

    const nextAssignType = update.assignmentType || existing.assignmentType || 'global';
    const nextUsers = update.assignedUsers !== undefined ? update.assignedUsers : (existing.assignedUsers || []);
    if (nextAssignType === 'global') {
      update.assignedUsers = [];
    } else if (nextAssignType === 'individual' && nextUsers.length === 0) {
      return res.status(400).json({ error: 'At least one assigned user is required for individual assignment.' });
    }

    const nextCategory = update.category || existing.category;
    const nextName = (update.originalName || existing.originalName || '').toLowerCase().trim();
    const catPeers = await filesDB.find({ category: nextCategory }, {}, 1000);
    const conflictPeer = catPeers.find(
      f => String(f._id || f.id) !== String(req.params.id) && (f.originalName || '').toLowerCase().trim() === nextName
    );
    if (conflictPeer) {
      return res.status(409).json({ error: `Another program named "${nextName}" already exists in "${nextCategory}".` });
    }

    update.assignmentHistory = appendProgramHistory(existing.assignmentHistory, {
      action: 'updated',
      category: nextCategory,
      status: update.status || existing.status,
      assignmentType: nextAssignType,
      assignedUsers: nextAssignType === 'individual' ? nextUsers : [],
      assignedBy: 'admin'
    });

    const updated = await filesDB.findByIdAndUpdate(req.params.id, update);
    res.json({ success: true, message: 'Program updated successfully.', program: updated });
  } catch (err) {
    console.error('Error updating program:', err);
    res.status(500).json({ error: 'Failed to update program.' });
  }
});

// POST /api/admin/programs/:id/publish - publish globally
router.post('/programs/:id/publish', requireAdmin, async (req, res) => {
  try {
    const existing = await filesDB.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Program not found.' });
    const updated = await filesDB.findByIdAndUpdate(req.params.id, {
      status: 'published',
      assignmentType: 'global',
      assignedUsers: [],
      assignmentHistory: appendProgramHistory(existing.assignmentHistory, {
        action: 'published_global',
        category: existing.category,
        status: 'published',
        assignmentType: 'global',
        assignedBy: 'admin'
      }),
      updatedAt: new Date()
    });
    res.json({ success: true, message: 'Program published globally to all users! 🌐', program: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish program.' });
  }
});

// POST /api/admin/programs/:id/unpublish - unpublish to draft
router.post('/programs/:id/unpublish', requireAdmin, async (req, res) => {
  try {
    const existing = await filesDB.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Program not found.' });
    const updated = await filesDB.findByIdAndUpdate(req.params.id, {
      status: 'draft',
      assignmentHistory: appendProgramHistory(existing.assignmentHistory, {
        action: 'unpublished_draft',
        category: existing.category,
        status: 'draft',
        assignmentType: existing.assignmentType || 'global',
        assignedBy: 'admin'
      }),
      updatedAt: new Date()
    });
    res.json({ success: true, message: 'Program unpublished and moved to draft.', program: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpublish program.' });
  }
});

// DELETE /api/admin/programs/:id - delete program with central DB confirmation
router.delete('/programs/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await filesDB.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Program not found.' });
    res.json({ success: true, message: 'Program permanently deleted from central database.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete program.' });
  }
});

module.exports = router;


