const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { requireAdmin } = require('../middleware/auth');
const { STORAGE_ROOT, sanitizeRelativePath, resolveSafe } = require('../utils/fsSafety');
const FileItem = require('../models/FileItem');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB per file
});

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function upsertFileRecord(relativePath) {
  const parts = relativePath.split('/');
  const name = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('/');
  const ext = path.extname(name).replace('.', '').toLowerCase();
  const fullPath = resolveSafe(relativePath);
  const stat = await fsp.stat(fullPath);

  await FileItem.findOneAndUpdate(
    { relativePath },
    {
      name,
      type: 'file',
      relativePath,
      parentPath,
      extension: ext,
      size: stat.size,
      updatedAt: new Date(),
      $setOnInsert: { uploadedAt: new Date(), pinned: false, downloads: 0, tags: [], description: '' },
    },
    { upsert: true, new: true }
  );

  // Ensure every ancestor folder has a folder record
  let cursor = parentPath;
  while (cursor) {
    const cParts = cursor.split('/');
    const cName = cParts[cParts.length - 1];
    const cParent = cParts.slice(0, -1).join('/');
    await FileItem.findOneAndUpdate(
      { relativePath: cursor },
      {
        name: cName,
        type: 'folder',
        relativePath: cursor,
        parentPath: cParent,
        $setOnInsert: { uploadedAt: new Date(), pinned: false, downloads: 0, tags: [], description: '' },
      },
      { upsert: true, new: true }
    );
    cursor = cParent;
  }
}

// POST /api/upload  (admin only)
// FormData: files[] (the file blobs), paths (JSON array of relative paths, same order as files)
router.post('/', requireAdmin, upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No files provided.' });
    }

    let relPaths;
    try {
      relPaths = JSON.parse(req.body.paths || '[]');
    } catch (e) {
      relPaths = [];
    }

    if (relPaths.length !== files.length) {
      // Fallback: use original filenames flat at root
      relPaths = files.map((f) => f.originalname);
    }

    const savedPaths = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeRel = sanitizeRelativePath(relPaths[i] || file.originalname);
      if (!safeRel) continue;

      const destPath = resolveSafe(safeRel);
      await ensureDir(path.dirname(destPath));
      await fsp.writeFile(destPath, file.buffer);
      await upsertFileRecord(safeRel);
      savedPaths.push(safeRel);
    }

    res.json({ success: true, message: 'Upload Successful', count: savedPaths.length, paths: savedPaths });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ success: false, message: 'Upload failed. Please try again.' });
  }
});

module.exports = router;
