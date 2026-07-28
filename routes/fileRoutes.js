const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const File = require('../models/File');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- Multer config: .zip only, 100MB max ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${unique}${path.extname(file.originalname)}`);
  }
});

function zipFilter(req, file, cb) {
  const isZip =
    file.mimetype === 'application/zip' ||
    file.mimetype === 'application/x-zip-compressed' ||
    path.extname(file.originalname).toLowerCase() === '.zip';
  if (!isZip) return cb(new Error('Only .zip files are allowed'));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: zipFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ---- Admin auth helper ----
// Delete requests must include the admin password in the request body.
// This mirrors the client's "unlock" flow without keeping server-side sessions.
function checkAdminPassword(req, res, next) {
  const supplied = req.body.password || req.headers['x-admin-password'];
  if (!supplied || supplied !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password' });
  }
  next();
}

// POST /api/files/admin/login  — verify password to unlock the UI
router.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Incorrect password' });
});

// POST /api/files — upload a zip
router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });

    try {
      const doc = await File.create({
        originalName: req.file.originalname,
        storedName: req.file.filename,
        size: req.file.size
      });
      res.status(201).json(doc);
    } catch (e) {
      fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
      res.status(500).json({ error: 'Could not save file record' });
    }
  });
});

// GET /api/files — list all files
router.get('/', async (req, res) => {
  try {
    const files = await File.find().sort({ uploadDate: -1 });
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: 'Could not fetch files' });
  }
});

// GET /api/files/:id/download — download a file
router.get('/:id/download', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing from storage' });
    }
    res.download(filePath, file.originalName);
  } catch (e) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// DELETE /api/files/:id — admin only
router.delete('/:id', checkAdminPassword, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(UPLOAD_DIR, file.storedName);
    fs.unlink(filePath, () => {});
    await file.deleteOne();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
