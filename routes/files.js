const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const archiver = require('archiver');
const router = express.Router();
const { filesDB, suggestionsDB } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { isCloudinaryConfigured, uploadToCloudinary, deleteFromCloudinary, fetchRemoteContent } = require('../services/cloudinary');

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

// Load syllabus for auto-matching
let SYLLABUS_DATA = {};
try {
  const syllabusPath = path.join(__dirname, '..', 'public', 'syllabus.json');
  if (fs.existsSync(syllabusPath)) {
    SYLLABUS_DATA = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));
  }
} catch (e) {
  console.error('Failed to load syllabus.json:', e.message);
}

function autoMatchSyllabus(filename, categoryHint = null) {
  const lowerName = (filename || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [subKey, subObj] of Object.entries(SYLLABUS_DATA)) {
    if (categoryHint && categoryHint !== 'all' && categoryHint !== subKey) continue;
    for (const ex of subObj.exercises || []) {
      for (const q of ex.questions || []) {
        const matchFound = (q.keywords || []).some(kw => {
          const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanKw && lowerName.includes(cleanKw);
        });
        if (matchFound) {
          return {
            subject: subKey,
            exercise: ex.title,
            question: q.title,
            expectedOutput: q.expectedOutput || null,
            description: q.description || ''
          };
        }
      }
    }
  }
  return null;
}

const CATEGORY_ALIASES = {
  python: ['python', 'py'],
  py: ['python', 'py'],
  java: ['java'],
  c: ['c'],
  cpp: ['cpp', 'c++', 'cc', 'cxx'],
  'c++': ['cpp', 'c++', 'cc', 'cxx'],
  adsa: ['adsa', 'dsa', 'advanced data structures', 'tree', 'graph', 'avl', 'binarysearchtree'],
  dbms: ['dbms', 'sql', 'database', 'database management systems'],
  sql: ['dbms', 'sql', 'database'],
  os: ['os', 'operating systems', 'operating system', 'scheduling', 'bankers', 'deadlock', 'process'],
  cn: ['cn', 'computer networks', 'networks', 'networking', 'socket', 'tcp', 'udp'],
  linux: ['linux', 'linux administration', 'shell', 'bash', 'ubuntu'],
  cyber: ['cyber', 'cyber security', 'cybersecurity', 'cryptography', 'cipher', 'encryption']
};

function sanitizeRelativePath(p) {
  if (!p) return '';
  let clean = String(p).replace(/\\/g, '/');
  clean = clean.replace(/^[a-zA-Z]:\//, '');
  clean = clean.replace(/^\/+/, '');
  return clean.split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/');
}

function detectCategory(ext, relPath = '', originalName = '') {
  const e = (ext || '').toLowerCase();
  const pathLower = (relPath + ' ' + originalName).toLowerCase();

  if (pathLower.includes('adsa') || pathLower.includes('tree') || pathLower.includes('graph') || pathLower.includes('avl') || pathLower.includes('bst')) return 'adsa';
  if (pathLower.includes('dbms') || pathLower.includes('sql') || pathLower.includes('database') || pathLower.includes('query')) return 'dbms';
  if (pathLower.includes('os') || pathLower.includes('operating') || pathLower.includes('schedul') || pathLower.includes('banker') || pathLower.includes('deadlock')) return 'os';
  if (pathLower.includes('cn') || pathLower.includes('network') || pathLower.includes('socket') || pathLower.includes('tcp') || pathLower.includes('udp')) return 'cn';
  if (pathLower.includes('linux') || pathLower.includes('bash') || pathLower.includes('shell')) return 'linux';
  if (pathLower.includes('cyber') || pathLower.includes('crypto') || pathLower.includes('cipher') || pathLower.includes('aes')) return 'cyber';

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

    const { subject: bodySubject, exercise: bodyExercise, question: bodyQuestion, expectedOutput: bodyExpectedOutput, description: bodyDesc } = req.body;

    const isFolderUpload = rawPaths.some(p => p && p.includes('/'));
    const batchId = isFolderUpload ? crypto.randomUUID() : null;

    const docs = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const relPath = sanitizeRelativePath(rawPaths[i]) || file.originalname;
      const topFolder = relPath.includes('/') ? relPath.split('/')[0] : null;
      const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
      let cat = detectCategory(ext, relPath, file.originalname);

      // Auto-match if not passed
      const match = autoMatchSyllabus(file.originalname, bodySubject || cat);
      const fileSubject = bodySubject || (match ? match.subject : cat);
      const fileExercise = bodyExercise || (match ? match.exercise : null);
      const fileQuestion = bodyQuestion || (match ? match.question : null);
      const fileExpectedOutput = bodyExpectedOutput || (match ? match.expectedOutput : null);
      const fileDesc = bodyDesc || (match ? match.description : (topFolder ? `Part of ${topFolder} folder` : ''));

      if (fileSubject && ['java', 'python', 'c', 'cpp', 'adsa', 'dbms', 'os', 'cn', 'linux', 'cyber'].includes(fileSubject.toLowerCase())) {
        cat = fileSubject.toLowerCase();
      }

      let cloudUrl = null;
      let cloudPublicId = null;
      let assetId = null;
      let fileContent = null;

      // Read small code or text file into content cache
      if (CODE_EXTENSIONS.includes(ext) && file.size < 300 * 1024) {
        try {
          fileContent = fs.readFileSync(file.path, 'utf-8');
        } catch (e) { /* ignore */ }
      }

      if (isCloudinaryConfigured()) {
        try {
          const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'auto' : 'raw';
          const cloudRes = await uploadToCloudinary(file.path, {
            folder: topFolder ? `zipshare_uploads/${topFolder}` : 'zipshare_uploads',
            resource_type: resType
          });
          cloudUrl = cloudRes.secure_url;
          cloudPublicId = cloudRes.public_id;
          assetId = cloudRes.asset_id || null;

          // Clean up temp file
          try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
        } catch (cErr) {
          console.error(`Cloudinary upload failed for ${file.originalname}:`, cErr.message);
        }
      }

      docs.push({
        originalName: file.originalname,
        storedName: file.filename,
        relativePath: relPath,
        folderName: topFolder,
        batchId: topFolder ? batchId : null,
        extension: ext,
        category: cat,
        subject: fileSubject,
        exercise: fileExercise,
        question: fileQuestion,
        expectedOutput: fileExpectedOutput,
        size: file.size,
        mimeType: file.mimetype,
        content: fileContent,
        cloudinaryUrl: cloudUrl,
        cloudinaryPublicId: cloudPublicId,
        assetId: assetId,
        uploadedBy: 'admin',
        tags: Array.from(new Set([ext, cat, fileSubject, topFolder].filter(Boolean))),
        description: fileDesc,
        pinned: false,
        downloads: 0,
        uploadDate: new Date(),
        updatedAt: new Date()
      });
    }

    const saved = await filesDB.insertMany(docs);
    res.status(201).json({ message: 'Upload Successful', files: saved });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /api/files - list + advanced multi-term search + category filter + exercise filter
router.get('/', async (req, res) => {
  try {
    const { q, filter, category, exercise, question, subject, sort } = req.query;
    const activeCategory = category || filter;

    const andConditions = [];

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      andConditions.push({
        $or: [
          { originalName: regex },
          { relativePath: regex },
          { folderName: regex },
          { tags: regex },
          { description: regex },
          { extension: regex },
          { category: regex },
          { subject: regex },
          { exercise: regex },
          { question: regex }
        ]
      });
    }

    if (activeCategory && activeCategory !== 'all') {
      const catClean = activeCategory.toLowerCase().trim();
      if (catClean === 'pinned') {
        andConditions.push({ pinned: true });
      } else if (catClean === 'folders') {
        andConditions.push({ folderName: { $ne: null } });
      } else {
        const terms = CATEGORY_ALIASES[catClean] || [catClean];
        const regexGroup = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const exactRegex = new RegExp(`^(${regexGroup})$`, 'i');
        const matchRegex = new RegExp(`(${regexGroup})`, 'i');

        andConditions.push({
          $or: [
            { category: exactRegex },
            { category: matchRegex },
            { subject: matchRegex },
            { extension: exactRegex },
            { tags: matchRegex },
            { relativePath: matchRegex },
            { originalName: matchRegex }
          ]
        });
      }
    }

    if (subject && subject !== 'all') {
      const subClean = subject.toLowerCase().trim();
      andConditions.push({
        $or: [
          { subject: new RegExp(subClean, 'i') },
          { category: new RegExp(subClean, 'i') }
        ]
      });
    }

    if (exercise) {
      andConditions.push({ exercise: new RegExp(exercise.trim(), 'i') });
    }

    if (question) {
      andConditions.push({ question: new RegExp(question.trim(), 'i') });
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};

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
    const rawIdentifier = req.params.identifier;
    const identifier = decodeURIComponent(rawIdentifier);

    let files = await filesDB.find({ batchId: identifier });
    if (!files || !files.length) {
      files = await filesDB.find({ folderName: identifier });
    }
    if (!files || !files.length) {
      files = await filesDB.find({ batchId: rawIdentifier });
      if (!files || !files.length) {
        files = await filesDB.find({ folderName: rawIdentifier });
      }
    }
    if (!files || !files.length) return res.status(404).json({ error: 'Folder not found.' });

    const folderName = files[0].folderName || 'folder';
    res.attachment(`${folderName}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const f of files) {
      let appended = false;
      if (f.cloudinaryUrl) {
        try {
          const buf = await fetchRemoteContent(f.cloudinaryUrl);
          archive.append(buf, { name: f.relativePath || f.originalName });
          appended = true;
        } catch (e) {
          console.error(`Failed to fetch ${f.originalName} from Cloudinary for zip:`, e.message);
        }
      }
      if (!appended) {
        const fullPath = path.join(UPLOAD_DIR, f.storedName);
        if (fs.existsSync(fullPath)) {
          archive.file(fullPath, { name: f.relativePath || f.originalName });
          appended = true;
        }
      }
      if (appended) {
        await filesDB.findByIdAndUpdate(f._id || f.id, { downloads: (f.downloads || 0) + 1 });
      }
    }
    archive.finalize();
  } catch (err) {
    console.error('Folder download failed:', err.message);
    res.status(500).json({ error: 'Folder download failed.' });
  }
});

// DELETE /api/files/folder/:identifier - Admin only
router.delete('/folder/:identifier', requireAdmin, async (req, res) => {
  try {
    const rawIdentifier = req.params.identifier;
    const identifier = decodeURIComponent(rawIdentifier);

    let files = await filesDB.find({ batchId: identifier });
    if (!files || !files.length) {
      files = await filesDB.find({ folderName: identifier });
    }
    if (!files || !files.length) {
      const safeReg = new RegExp('^' + identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
      files = await filesDB.find({ folderName: safeReg });
    }
    if (!files || !files.length) {
      files = await filesDB.find({ batchId: rawIdentifier });
      if (!files || !files.length) {
        files = await filesDB.find({ folderName: rawIdentifier });
      }
    }
    if (!files || !files.length) return res.status(404).json({ error: 'Folder not found.' });

    let deletedCount = 0;
    for (const f of files) {
      if (f.cloudinaryPublicId) {
        try {
          const ext = (f.extension || '').toLowerCase();
          const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
          await deleteFromCloudinary(f.cloudinaryPublicId, resType);
        } catch (cErr) {
          console.error(`Cloudinary folder file destroy warning (${f.originalName}):`, cErr.message);
        }
      }

      const fullPath = path.join(UPLOAD_DIR, f.storedName);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) { /* ignore */ }
      }

      await filesDB.findByIdAndDelete(f._id || f.id);
      deletedCount++;
    }

    res.json({ message: 'Folder deleted successfully.', deletedCount });
  } catch (err) {
    console.error('Delete folder error:', err.message);
    res.status(500).json({ error: 'Delete folder failed.' });
  }
});

// POST /api/files/folders/delete-batch - Admin only batch delete
router.post('/folders/delete-batch', requireAdmin, async (req, res) => {
  try {
    const { batchIds } = req.body;
    if (!Array.isArray(batchIds) || !batchIds.length) {
      return res.status(400).json({ error: 'batchIds array required.' });
    }

    let totalDeletedFiles = 0;
    let deletedFolderCount = 0;

    for (const rawIdentifier of batchIds) {
      if (!rawIdentifier) continue;
      const identifier = decodeURIComponent(rawIdentifier);

      let files = await filesDB.find({ batchId: identifier });
      if (!files || !files.length) {
        files = await filesDB.find({ folderName: identifier });
      }
      if (!files || !files.length) {
        const safeReg = new RegExp('^' + identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
        files = await filesDB.find({ folderName: safeReg });
      }
      if (!files || !files.length) {
        files = await filesDB.find({ batchId: rawIdentifier });
      }

      if (files && files.length) {
        for (const f of files) {
          if (f.cloudinaryPublicId) {
            try {
              const ext = (f.extension || '').toLowerCase();
              const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
              await deleteFromCloudinary(f.cloudinaryPublicId, resType);
            } catch (cErr) {
              console.error(`Cloudinary folder file destroy warning (${f.originalName}):`, cErr.message);
            }
          }

          const fullPath = path.join(UPLOAD_DIR, f.storedName);
          if (fs.existsSync(fullPath)) {
            try { fs.unlinkSync(fullPath); } catch (e) { /* ignore */ }
          }

          await filesDB.findByIdAndDelete(f._id || f.id);
          totalDeletedFiles++;
        }
        deletedFolderCount++;
      }
    }

    res.json({ message: 'Selected folders deleted successfully.', deletedFolderCount, totalDeletedFiles });
  } catch (err) {
    console.error('Batch delete folders error:', err.message);
    res.status(500).json({ error: 'Failed to delete selected folders.' });
  }
});

// GET /api/files/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    file.downloads = (file.downloads || 0) + 1;
    await filesDB.findByIdAndUpdate(file._id || file.id, { downloads: file.downloads });

    if (file.cloudinaryUrl) {
      try {
        const buf = await fetchRemoteContent(file.cloudinaryUrl);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        return res.send(buf);
      } catch (err) {
        console.warn('Remote fetch failed, redirecting directly to Cloudinary:', err.message);
        return res.redirect(file.cloudinaryUrl);
      }
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      return res.download(fullPath, file.originalName);
    }

    return res.status(404).json({ error: 'File missing on cloud storage or server.' });
  } catch (err) {
    res.status(500).json({ error: 'Download failed.' });
  }
});

// GET /api/files/:id/preview - In-browser code / document preview
router.get('/:id/preview', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    if (CODE_EXTENSIONS.includes((file.extension || '').toLowerCase())) {
      let content = file.content;
      if (!content && file.cloudinaryUrl) {
        try {
          const buf = await fetchRemoteContent(file.cloudinaryUrl);
          content = buf.toString('utf-8').slice(0, 200000);
        } catch (cErr) {
          console.error('Fetch preview content error:', cErr.message);
        }
      }

      if (!content) {
        const fullPath = path.join(UPLOAD_DIR, file.storedName);
        if (fs.existsSync(fullPath)) {
          content = fs.readFileSync(fullPath, 'utf-8').slice(0, 200000);
        }
      }

      if (content !== null && content !== undefined) {
        return res.json({ type: 'text', extension: file.extension, content, file });
      }
      return res.status(404).json({ error: 'Could not load file preview from Cloud storage.' });
    }

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes((file.extension || '').toLowerCase())) {
      const url = file.cloudinaryUrl || `/api/files/${file._id || file.id}/raw`;
      return res.json({ type: file.extension === 'pdf' ? 'pdf' : 'image', url, file });
    }

    return res.json({ type: 'unsupported', file });
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Preview failed.' });
  }
});

// GET /api/files/:id/raw
router.get('/:id/raw', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).end();

    if (file.cloudinaryUrl) {
      return res.redirect(file.cloudinaryUrl);
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }

    res.status(404).end();
  } catch (err) {
    res.status(500).end();
  }
});

// PUT /api/files/:id/content - Edit file content directly in browser (Admin only)
router.put('/:id/content', requireAdmin, async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'Content required.' });

    const buf = Buffer.from(content, 'utf-8');
    const newSize = buf.byteLength;

    let updatedCloudUrl = file.cloudinaryUrl;
    let updatedCloudPublicId = file.cloudinaryPublicId;

    if (isCloudinaryConfigured()) {
      try {
        const topFolder = file.folderName || null;
        const uploadRes = await uploadToCloudinary(buf, {
          folder: topFolder ? `zipshare_uploads/${topFolder}` : 'zipshare_uploads',
          public_id: file.cloudinaryPublicId || undefined,
          overwrite: true,
          resource_type: 'raw'
        });
        updatedCloudUrl = uploadRes.secure_url;
        updatedCloudPublicId = uploadRes.public_id;
      } catch (e) {
        console.error('Failed to upload content update to Cloudinary:', e.message);
      }
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      try { fs.writeFileSync(fullPath, content, 'utf-8'); } catch (e) {}
    }

    await filesDB.findByIdAndUpdate(file._id || file.id, {
      size: newSize,
      content: content,
      cloudinaryUrl: updatedCloudUrl,
      cloudinaryPublicId: updatedCloudPublicId,
      updatedAt: new Date()
    });

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

    if (file.cloudinaryPublicId) {
      try {
        const ext = (file.extension || '').toLowerCase();
        const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
        await deleteFromCloudinary(file.cloudinaryPublicId, resType);
      } catch (cErr) {
        console.error('Cloudinary delete failed:', cErr.message);
        return res.status(500).json({ error: 'Cloudinary deletion failed. Document preserved for transactional safety.' });
      }
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (e) {}
    }

    await filesDB.findByIdAndDelete(file._id || file.id);
    res.json({ message: 'Deleted Successfully' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Delete failed.' });
  }
});

// PATCH /api/files/:id - Admin only edit metadata
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { originalName, description, tags, pinned, category, subject, exercise, question, expectedOutput } = req.body;
    const update = {};
    if (originalName !== undefined && originalName.trim()) update.originalName = originalName.trim();
    if (description !== undefined) update.description = description;
    if (category !== undefined) update.category = category;
    if (subject !== undefined) update.subject = subject;
    if (exercise !== undefined) update.exercise = exercise;
    if (question !== undefined) update.question = question;
    if (expectedOutput !== undefined) update.expectedOutput = expectedOutput;
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
