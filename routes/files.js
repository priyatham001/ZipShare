const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const router = express.Router();
const { filesDB, suggestionsDB } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + safeExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 500 }
});

const CODE_EXTENSIONS = ['java', 'py', 'c', 'cpp', 'js', 'ts', 'html', 'css', 'sql', 'txt', 'md', 'json'];

function sanitizeRelativePath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/');
}

function detectCategory(ext, relPath = '') {
  const e = (ext || '').toLowerCase();
  const pathLower = relPath.toLowerCase();

  if (pathLower.includes('adsa') || pathLower.includes('tree') || pathLower.includes('graph') || pathLower.includes('avl')) return 'adsa';
  if (pathLower.includes('dbms') || pathLower.includes('sql') || pathLower.includes('database')) return 'dbms';

  if (e === 'py') return 'python';
  if (e === 'java') return 'java';
  if (e === 'c') return 'c';
  if (e === 'cpp' || e === 'cc' || e === 'cxx') return 'cpp';
  if (e === 'sql') return 'dbms';
  if (e === 'pdf') return 'pdf';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'zip';
  return 'all';
}

// POST /api/files/upload - Upload files or folder (Admin only)
router.post('/upload', requireAdmin, upload.array('files', 500), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files received.' });
    }

    let rawPaths = req.body.paths || [];
    if (!Array.isArray(rawPaths)) rawPaths = [rawPaths];

    const isFolderUpload = rawPaths.some(p => p && p.includes('/'));
    const batchId = isFolderUpload ? crypto.randomUUID() : null;

    const docs = req.files.map((file, i) => {
      const relPath = sanitizeRelativePath(rawPaths[i]) || file.originalname;
      const topFolder = relPath.includes('/') ? relPath.split('/')[0] : null;
      const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
      const cat = detectCategory(ext, relPath);

      return {
        originalName: file.originalname,
        storedName: file.filename,
        relativePath: relPath,
        folderName: topFolder,
        batchId: topFolder ? batchId : null,
        extension: ext,
        category: cat,
        size: file.size,
        tags: [ext, cat, topFolder].filter(Boolean),
        description: topFolder ? `Part of ${topFolder} folder` : '',
        pinned: false,
        downloads: 0,
        uploadDate: new Date()
      };
    });

    const saved = await filesDB.insertMany(docs);
    res.status(201).json({ message: 'Upload Successful', files: saved });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /api/files - list + advanced multi-term search + category filter
router.get('/', async (req, res) => {
  try {
    const { q, filter, category, sort } = req.query;
    const activeCategory = category || filter;

    const query = {};

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { originalName: regex },
        { relativePath: regex },
        { folderName: regex },
        { tags: regex },
        { description: regex },
        { extension: regex },
        { category: regex }
      ];
    }

    if (activeCategory && activeCategory !== 'all') {
      const catLower = activeCategory.toLowerCase();
      if (catLower === 'pinned') query.pinned = true;
      else if (catLower === 'folders') query.folderName = { $ne: null };
      else query.category = catLower;
    }

    let sortSpec = { pinned: -1, uploadDate: -1 };
    if (sort === 'popular') sortSpec = { pinned: -1, downloads: -1 };
    if (sort === 'name') sortSpec = { pinned: -1, originalName: 1 };

    const files = await filesDB.find(query, sortSpec, 500);
    res.json(files);
  } catch (err) {
    console.error('List files error:', err.message);
    res.status(500).json({ error: 'Could not load file list.' });
  }
});

// GET /api/files/stats
router.get('/stats', async (req, res) => {
  try {
    const [totalFiles, pinned, agg] = await Promise.all([
      filesDB.countDocuments(),
      filesDB.countDocuments({ pinned: true }),
      filesDB.aggregate([])
    ]);
    res.json({
      totalFiles,
      pinned,
      todayUploads: totalFiles,
      totalDownloads: agg[0]?.totalDownloads || 0,
      storageUsed: agg[0]?.totalSize || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// GET /api/files/suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const manual = await suggestionsDB.find();
    const recentCode = await filesDB.find({ extension: { $in: CODE_EXTENSIONS } }, { uploadDate: -1 }, 6);

    res.json({
      trending: manual.map(s => s.text),
      recent: recentCode.map(f => f.originalName)
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load suggestions.' });
  }
});

// GET /api/files/folder/:identifier/download - Zips uploaded folder
router.get('/folder/:identifier/download', async (req, res) => {
  try {
    let files = await filesDB.find({ batchId: req.params.identifier });
    if (!files || !files.length) {
      files = await filesDB.find({ folderName: req.params.identifier });
    }
    if (!files || !files.length) return res.status(404).json({ error: 'Folder not found.' });

    const folderName = files[0].folderName || 'folder';
    res.attachment(`${folderName}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const f of files) {
      const fullPath = path.join(UPLOAD_DIR, f.storedName);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: f.relativePath || f.originalName });
        await filesDB.findByIdAndUpdate(f._id || f.id, { downloads: (f.downloads || 0) + 1 });
      }
    }
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: 'Folder download failed.' });
  }
});

// DELETE /api/files/folder/:identifier - Admin only
router.delete('/folder/:identifier', requireAdmin, async (req, res) => {
  try {
    let files = await filesDB.find({ batchId: req.params.identifier });
    if (!files || !files.length) {
      files = await filesDB.find({ folderName: req.params.identifier });
    }
    if (!files || !files.length) return res.status(404).json({ error: 'Folder not found.' });

    for (const f of files) {
      const fullPath = path.join(UPLOAD_DIR, f.storedName);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      await filesDB.findByIdAndDelete(f._id || f.id);
    }
    res.json({ message: 'Folder deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Delete folder failed.' });
  }
});

// GET /api/files/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing on server.' });

    file.downloads = (file.downloads || 0) + 1;
    await filesDB.findByIdAndUpdate(file._id || file.id, { downloads: file.downloads });

    res.download(fullPath, file.originalName);
  } catch (err) {
    res.status(500).json({ error: 'Download failed.' });
  }
});

// GET /api/files/:id/preview - In-browser code / document preview
router.get('/:id/preview', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File missing on server.' });

    if (CODE_EXTENSIONS.includes(file.extension)) {
      const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 200000);
      return res.json({ type: 'text', extension: file.extension, content, file });
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(file.extension)) {
      return res.json({ type: file.extension === 'pdf' ? 'pdf' : 'image', url: `/api/files/${file._id || file.id}/raw`, file });
    }
    return res.json({ type: 'unsupported', file });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed.' });
  }
});

// GET /api/files/:id/raw
router.get('/:id/raw', async (req, res) => {
  const file = await filesDB.findById(req.params.id);
  if (!file) return res.status(404).end();
  res.sendFile(path.join(UPLOAD_DIR, file.storedName));
});

// PUT /api/files/:id/content - Edit file content directly in browser (Admin only)
router.put('/:id/content', requireAdmin, async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'Content required.' });

    fs.writeFileSync(fullPath, content, 'utf-8');
    const newSize = Buffer.byteLength(content, 'utf-8');
    await filesDB.findByIdAndUpdate(file._id || file.id, { size: newSize });

    res.json({ message: 'File content updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update file content.' });
  }
});

// DELETE /api/files/:id - Admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await filesDB.findByIdAndDelete(file._id || file.id);
    res.json({ message: 'Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed.' });
  }
});

// PATCH /api/files/:id - Admin only edit metadata
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { originalName, description, tags, pinned, category } = req.body;
    const update = {};
    if (originalName !== undefined && originalName.trim()) update.originalName = originalName.trim();
    if (description !== undefined) update.description = description;
    if (category !== undefined) update.category = category;
    if (tags !== undefined) update.tags = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);
    if (pinned !== undefined) update.pinned = Boolean(pinned);

    const file = await filesDB.findByIdAndUpdate(req.params.id, update);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

module.exports = router;
