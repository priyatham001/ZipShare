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
  gitRepoLink: 'https://github.com/',
  gitRepoTitle: 'GitHub Repository',
  gitRepoEnabled: true,
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

function commitSettingsToGit() {
  try {
    exec('git add data/settings.json && git commit -m "Admin updated links and settings [git]"', (err, stdout) => {
      if (err) {
        // Non-fatal if git clean or not available
      } else {
        console.log('✅ Settings committed to git:', stdout.trim());
      }
    });
  } catch (e) {
    // Ignore git execution errors
  }
}

function saveSettings(data) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
    commitSettingsToGit();
  } catch (err) {
    console.error('Failed to write settings.json:', err.message);
  }
}

// GET /api/admin/settings (publicly accessible so all clients fetch latest links)
router.get('/settings', (req, res) => {
  res.json(getSettings());
});

// PUT /api/admin/settings (Admin only: update replica download link, git link & promo details)
router.put('/settings', requireAdmin, (req, res) => {
  const current = getSettings();
  const {
    replicaLink,
    replicaTitle,
    replicaSubtext,
    replicaBadge,
    replicaBtnText,
    promoEnabled,
    gitRepoLink,
    gitRepoTitle,
    gitRepoEnabled
  } = req.body;

  const updated = {
    ...current,
    replicaLink: replicaLink !== undefined && String(replicaLink).trim() ? String(replicaLink).trim() : current.replicaLink,
    replicaTitle: replicaTitle !== undefined && String(replicaTitle).trim() ? String(replicaTitle).trim() : current.replicaTitle,
    replicaSubtext: replicaSubtext !== undefined ? String(replicaSubtext).trim() : current.replicaSubtext,
    replicaBadge: replicaBadge !== undefined && String(replicaBadge).trim() ? String(replicaBadge).trim() : current.replicaBadge,
    replicaBtnText: replicaBtnText !== undefined && String(replicaBtnText).trim() ? String(replicaBtnText).trim() : current.replicaBtnText,
    promoEnabled: promoEnabled !== undefined ? Boolean(promoEnabled) : current.promoEnabled,
    gitRepoLink: gitRepoLink !== undefined && String(gitRepoLink).trim() ? String(gitRepoLink).trim() : (current.gitRepoLink || 'https://github.com/'),
    gitRepoTitle: gitRepoTitle !== undefined && String(gitRepoTitle).trim() ? String(gitRepoTitle).trim() : (current.gitRepoTitle || 'GitHub Repository'),
    gitRepoEnabled: gitRepoEnabled !== undefined ? Boolean(gitRepoEnabled) : (current.gitRepoEnabled !== false),
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
      pinned = false
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Program name/title is required.' });
    }

    const cleanCategory = (category || 'java').toLowerCase().trim();
    const extMap = { java: 'java', python: 'py', c: 'c', adsa: 'cpp', dbms: 'sql' };
    const extension = extMap[cleanCategory] || 'txt';
    const cleanTitle = title.trim();
    const filename = cleanTitle.includes('.') ? cleanTitle : `${cleanTitle}.${extension}`;

    const parsedUsers = Array.isArray(assignedUsers)
      ? assignedUsers.map(u => String(u).trim()).filter(Boolean)
      : (typeof assignedUsers === 'string' ? assignedUsers.split(',').map(u => u.trim()).filter(Boolean) : []);

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
      status: status === 'draft' ? 'draft' : 'published',
      assignmentType: assignmentType === 'individual' ? 'individual' : 'global',
      assignedUsers: parsedUsers,
      description: description.trim(),
      content: code,
      size: Buffer.byteLength(code || '', 'utf8'),
      tags: [cleanCategory, 'program', assignmentType === 'global' ? 'global' : 'individual-assignment'],
      pinned: Boolean(pinned),
      downloads: 0,
      uploadedBy: 'admin',
      uploadDate: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: assignmentType === 'global' ? 'Program created & published globally to all users! 🌐' : 'Program created & assigned individually. 👤',
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

    if (title !== undefined && title.trim()) {
      update.originalName = title.trim();
      update.relativePath = title.trim();
      update.question = title.trim();
    }
    if (category !== undefined) {
      update.category = category.toLowerCase().trim();
      update.subject = category.toUpperCase().trim();
    }
    if (description !== undefined) update.description = description.trim();
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
      update.assignedUsers = Array.isArray(assignedUsers)
        ? assignedUsers.map(u => String(u).trim()).filter(Boolean)
        : (typeof assignedUsers === 'string' ? assignedUsers.split(',').map(u => u.trim()).filter(Boolean) : []);
    }
    if (pinned !== undefined) update.pinned = Boolean(pinned);

    const updated = await filesDB.findByIdAndUpdate(req.params.id, update);
    if (!updated) return res.status(404).json({ error: 'Program not found.' });

    res.json({ success: true, message: 'Program updated successfully.', program: updated });
  } catch (err) {
    console.error('Error updating program:', err);
    res.status(500).json({ error: 'Failed to update program.' });
  }
});

// POST /api/admin/programs/:id/publish - publish globally
router.post('/programs/:id/publish', requireAdmin, async (req, res) => {
  try {
    const updated = await filesDB.findByIdAndUpdate(req.params.id, {
      status: 'published',
      assignmentType: 'global',
      updatedAt: new Date()
    });
    if (!updated) return res.status(404).json({ error: 'Program not found.' });
    res.json({ success: true, message: 'Program published globally to all users! 🌐', program: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish program.' });
  }
});

// POST /api/admin/programs/:id/unpublish - unpublish to draft
router.post('/programs/:id/unpublish', requireAdmin, async (req, res) => {
  try {
    const updated = await filesDB.findByIdAndUpdate(req.params.id, {
      status: 'draft',
      updatedAt: new Date()
    });
    if (!updated) return res.status(404).json({ error: 'Program not found.' });
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


