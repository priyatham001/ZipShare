const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const router = express.Router();
const File = require('../models/File');
const Suggestion = require('../models/Suggestion');
const { requireAdmin } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Files are stored flatly on disk with random safe names.
// The original folder structure is preserved only as metadata (relativePath)
// so it can be shown in the UI and rebuilt into a zip on download.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + safeExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 500 } // 200MB/file, up to 500 files per upload
});

const CODE_EXTENSIONS = ['java', 'py', 'c', 'cpp', 'js', 'ts'];

function sanitizeRelativePath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/');
}

// POST /api/files/upload - accepts individual files OR a whole folder (webkitdirectory)
router.post('/upload', upload.array('files', 500), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files received.' });
    }

    // frontend sends a matching "paths" field per file (webkitRelativePath or plain name)
    let rawPaths = req.body.paths || [];
    if (!Array.isArray(rawPaths)) rawPaths = [rawPaths];

    const isFolderUpload = rawPaths.some(p => p && p.includes('/'));
    const batchId = isFolderUpload ? crypto.randomUUID() : null;

    const docs = req.files.map((file, i) => {
      const relPath = sanitizeRelativePath(rawPaths[i]) || file.originalname;
      const topFolder = relPath.includes('/') ? relPath.split('/')[0] : null;
      const ext = path.extname(file.originalname).replace('.', '').toLowerCase();

      return {
        originalName: file.originalname,
        storedName: file.filename,
        relativePath: relPath,
        folderName: topFolder,
        batchId: topFolder ? batchId : null,
        extension: ext,
        size: file.size,
        uploadDate: new Date()
      };
    });

    const saved = await File.insertMany(docs);
    res.status(201).json({ message: 'Upload Successful', files: saved });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /api/files - list + search + filter
router.get('/', async (req, res) => {
  try {
    const { q, filter, sort } = req.query;
    const query = {};

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { originalName: regex },
        { relativePath: regex },
        { folderName: regex },
        { tags: regex },
        { description: regex }
      ];
    }

    if (filter && filter !== 'all') {
      if (filter === 'pinned') query.pinned = true;
      else if (filter === 'folders') query.folderName = { $ne: null };
      else query.extension = filter.toLowerCase();
    }

    let sortSpec = { pinned: -1, uploadDate: -1 };
    if (sort === 'popular') sortSpec = { pinned: -1, downloads: -1 };
    if (sort === 'name') sortSpec = { pinned: -1, originalName: 1 };

    const files = await File.find(query).sort(sortSpec).limit(500);
    res.json(files);
  } catch (err) {
    console.error('List files error:', err.message);
    res.status(500).json({ error: 'Could not load file list.' });
  }
});

// GET /api/files/stats - counts for the admin dashboard / stats bar
router.get('/stats', async (req, res) => {
  try {
    const [totalFiles, pinned, todayCount, agg] = await Promise.all([
      File.countDocuments(),
      File.countDocuments({ pinned: true }),
      File.countDocuments({ uploadDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      File.aggregate([{ $group: { _id: null, totalSize: { $sum: '$size' }, totalDownloads: { $sum: '$downloads' } } }])
    ]);
    res.json({
      totalFiles,
      pinned,
      todayUploads: todayCount,
      totalDownloads: agg[0]?.totalDownloads || 0,
      storageUsed: agg[0]?.totalSize || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// GET /api/files/suggestions - admin-controlled trending list + auto "recently uploaded" code files
router.get('/suggestions', async (req, res) => {
  try {
    const manual = await Suggestion.find().sort({ pinned: -1, order: 1, createdAt: -1 }).limit(15);
    const recentCode = await File.find({ extension: { $in: CODE_EXTENSIONS } })
      .sort({ uploadDate: -1 })
      .limit(6)
      .select('originalName extension');

    res.json({
      trending: manual.map(s => s.text),
      recent: recentCode.map(f => f.originalName)
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load suggestions.' });
  }
});

// GET /api/files/:id/download - single file
router.get('/:id/download', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing on server.' });

    file.downloads += 1;
    await file.save();

    res.download(fullPath, file.originalName);
  } catch (err) {
    res.status(500).json({ error: 'Download failed.' });
  }
});

// GET /api/files/folder/:batchId/download - zips an uploaded folder on the fly
router.get('/folder/:batchId/download', async (req, res) => {
  try {
    const files = await File.find({ batchId: req.params.batchId });
    if (!files.length) return res.status(404).json({ error: 'Folder not found.' });

    res.attachment(`${files[0].folderName || 'folder'}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const f of files) {
      const fullPath = path.join(UPLOAD_DIR, f.storedName);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: f.relativePath });
        f.downloads += 1;
        await f.save();
      }
    }
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: 'Folder download failed.' });
  }
});

// GET /api/files/:id/preview - inline preview for text/code/image/pdf
router.get('/:id/preview', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing on server.' });

    const textLike = [...CODE_EXTENSIONS, 'txt', 'md', 'json', 'html', 'css', 'sql'];
    if (textLike.includes(file.extension)) {
      const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 200000);
      return res.json({ type: 'text', extension: file.extension, content });
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(file.extension)) {
      return res.json({ type: file.extension === 'pdf' ? 'pdf' : 'image', url: `/api/files/${file._id}/raw` });
    }
    return res.json({ type: 'unsupported' });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed.' });
  }
});

// GET /api/files/:id/raw - raw bytes, used by the preview modal for images/pdf
router.get('/:id/raw', async (req, res) => {
  const file = await File.findById(req.params.id);
  if (!file) return res.status(404).end();
  res.sendFile(path.join(UPLOAD_DIR, file.storedName));
});

// ---- Admin-only management ----

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await file.deleteOne();
    res.json({ message: 'Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed.' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { originalName, description, tags, pinned } = req.body;
    const update = {};
    if (originalName !== undefined && originalName.trim()) update.originalName = originalName.trim();
    if (description !== undefined) update.description = description;
    if (tags !== undefined) update.tags = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);
    if (pinned !== undefined) update.pinned = pinned;

    const file = await File.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!file) return res.status(404).json({ error: 'File not found.' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

module.exports = router;
