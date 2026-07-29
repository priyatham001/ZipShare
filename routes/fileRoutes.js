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
  limits: { fileSize: 500 * 1024 * 1024, files: 300 } // 500MB per file, up to 300 files (folder uploads)
});

// Cheap keyword tagging so search/suggestions have something to match against
// without requiring the admin to tag every single file by hand.
const KEYWORD_TAGS = [
  'python', 'java', 'javascript', 'c', 'cpp', 'c++', 'sql', 'html', 'css',
  'avl', 'bst', 'tree', 'graph', 'stack', 'queue', 'linkedlist', 'linked-list',
  'sorting', 'ds', 'dsa', 'notes', 'assignment', 'lab', 'project', 'record'
];

function autoTags(relativePathAndName) {
  const lower = relativePathAndName.toLowerCase();
  return KEYWORD_TAGS.filter((kw) => lower.includes(kw));
}

function sanitizeRelativePath(p) {
  if (!p) return '';
  return p
    .split('/')
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._ -]/g, '_'))
    .join('/');
}

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
    const sort = req.query.sort === 'popular' ? { downloadCount: -1 } : { uploadedAt: -1 };
    const files = await FileMeta.find().sort(sort).lean();
    res.json(
      files.map((f) => ({
        id: f._id,
        originalName: f.originalName,
        size: f.size,
        mimeType: f.mimeType,
        relativePath: f.relativePath || '',
        tags: f.tags || [],
        downloadCount: f.downloadCount || 0,
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

    FileMeta.updateOne({ _id: meta._id }, { $inc: { downloadCount: 1 } }).catch(() => {});

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

    // For folder uploads the frontend sends one "paths" entry per file, in the
    // same order as "files", containing e.g. "AVL-Lab/AVL.c". Missing/absent
    // for plain file uploads, which is fine - relativePath just stays blank.
    let rawPaths = req.body.paths || [];
    if (!Array.isArray(rawPaths)) rawPaths = [rawPaths];

    const bucket = getBucket();
    const saved = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const relativePath = sanitizeRelativePath(rawPaths[i] || '');
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
        gridFsId,
        relativePath,
        tags: autoTags(`${relativePath} ${file.originalname}`)
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
