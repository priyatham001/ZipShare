const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const path = require('path');
const rateLimit = require('express-rate-limit');

const FileMeta = require('../models/FileMeta');
const { requireAdmin, requireCsrf } = require('../middleware/auth');

const router = express.Router();

// Files are kept in memory just long enough to stream into GridFS -
// they are never written to the local disk, which is what makes them
// survive restarts/redeploys on platforms like Render.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024, files: 10 } // 500MB per file, 10 files per request
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

function getBucket() {
  return new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

// GET /api/files - public, newest first
router.get('/', async (req, res) => {
  try {
    const files = await FileMeta.find().sort({ uploadedAt: -1 }).lean();
    res.json(
      files.map((f) => ({
        id: f._id,
        originalName: f.originalName,
        size: f.size,
        mimeType: f.mimeType,
        uploadedAt: f.uploadedAt
      }))
    );
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Could not load file list' });
  }
});

// GET /api/files/:id/download - public
router.get('/:id/download', async (req, res) => {
  try {
    const meta = await FileMeta.findById(req.params.id);
    if (!meta) return res.status(404).json({ error: 'File missing from storage' });

    const bucket = getBucket();
    res.set('Content-Type', meta.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.originalName)}"`);

    const downloadStream = bucket.openDownloadStream(new ObjectId(meta.gridFsId));
    downloadStream.on('error', () => {
      res.status(404).json({ error: 'File missing from storage' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// POST /api/files/upload - admin only
router.post('/upload', requireAdmin, requireCsrf, uploadLimiter, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const bucket = getBucket();
    const saved = [];

    for (const file of req.files) {
      const storedName = `${Date.now()}-${sanitizeFilename(file.originalname)}`;

      const gridFsId = await new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(storedName, {
          contentType: file.mimetype
        });
        uploadStream.end(file.buffer);
        uploadStream.on('finish', () => resolve(uploadStream.id));
        uploadStream.on('error', reject);
      });

      const meta = await FileMeta.create({
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
        gridFsId
      });

      saved.push(meta);
    }

    res.json({ success: true, files: saved });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// DELETE /api/files/:id - admin only
router.delete('/:id', requireAdmin, requireCsrf, async (req, res) => {
  try {
    const meta = await FileMeta.findById(req.params.id);
    if (!meta) return res.status(404).json({ error: 'File not found' });

    const bucket = getBucket();
    try {
      await bucket.delete(new ObjectId(meta.gridFsId));
    } catch (e) {
      // If the GridFS blob is already gone, still clean up the metadata below.
      console.warn('GridFS delete warning:', e.message);
    }

    await FileMeta.deleteOne({ _id: meta._id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
