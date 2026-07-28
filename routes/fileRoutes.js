const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage config: keep original name but prefix with timestamp to avoid collisions
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB cap
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.zip') {
      return cb(new Error('Only .zip files are allowed'));
    }
    cb(null, true);
  }
});

// POST /api/files/upload
router.post('/upload', (req, res) => {
  upload.single('zipfile')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
      const fileDoc = await File.create({
        originalName: req.file.originalname,
        storedName: req.file.filename,
        size: req.file.size
      });
      res.status(201).json(fileDoc);
    } catch (dbErr) {
      // Clean up the file on disk if DB save fails
      fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
      res.status(500).json({ error: 'Could not save file record' });
    }
  });
});

// GET /api/files - list all files
router.get('/', async (req, res) => {
  try {
    const files = await File.find().sort({ uploadedAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch files' });
  }
});

// GET /api/files/download/:id
router.get('/download/:id', async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(uploadsDir, fileDoc.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing from server' });
    }
    res.download(filePath, fileDoc.originalName);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// DELETE /api/files/:id - admin only
router.delete('/:id', async (req, res) => {
  const { password } = req.body;

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Incorrect admin password' });
  }

  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(uploadsDir, fileDoc.storedName);
    fs.unlink(filePath, () => {}); // ignore error if already missing
    await fileDoc.deleteOne();

    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
