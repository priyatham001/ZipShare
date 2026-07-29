const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const archiver = require('archiver');
const { requireAdmin } = require('../middleware/auth');
const { sanitizeSegment, resolveSafe } = require('../utils/fsSafety');
const FileItem = require('../models/FileItem');

// GET /api/files  ?q=&filter=&parent=
router.get('/', async (req, res) => {
  try {
    const { q, filter, parent = '' } = req.query;
    const query = {};

    if (parent !== undefined) query.parentPath = parent;

    if (q && q.trim()) {
      query.$text = { $search: q.trim() };
    }

    if (filter && filter !== 'all') {
      if (filter === 'folders') query.type = 'folder';
      else if (filter === 'pinned') query.pinned = true;
      else if (filter === 'recent') {
        // handled separately below
      } else {
        query.extension = filter.toLowerCase();
      }
    }

    let items;
    if (filter === 'recent') {
      items = await FileItem.find({ type: 'file' }).sort({ uploadedAt: -1 }).limit(20);
    } else {
      items = await FileItem.find(query).sort({ pinned: -1, uploadedAt: -1 });
    }

    res.json({ success: true, items });
  } catch (err) {
    console.error('List error:', err.message);
    res.status(500).json({ success: false, message: 'Could not load files.' });
  }
});

// GET /api/files/stats  - dashboard numbers
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalFiles = await FileItem.countDocuments({ type: 'file' });
    const totalFolders = await FileItem.countDocuments({ type: 'folder' });
    const pinned = await FileItem.countDocuments({ pinned: true });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayUploads = await FileItem.countDocuments({ type: 'file', uploadedAt: { $gte: startOfDay } });
    const downloadsAgg = await FileItem.aggregate([{ $group: { _id: null, total: { $sum: '$downloads' } } }]);
    const sizeAgg = await FileItem.aggregate([
      { $match: { type: 'file' } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]);
    const recent = await FileItem.find({ type: 'file' }).sort({ uploadedAt: -1 }).limit(10);

    res.json({
      success: true,
      stats: {
        totalFiles,
        totalFolders,
        pinned,
        todayUploads,
        totalDownloads: downloadsAgg[0]?.total || 0,
        storageUsedBytes: sizeAgg[0]?.total || 0,
      },
      recent,
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, message: 'Could not load stats.' });
  }
});

// GET /api/files/download/:relativePath(*) - download a single file
router.get('/download/*', async (req, res) => {
  try {
    const relPath = req.params[0];
    const item = await FileItem.findOne({ relativePath: relPath });
    if (!item || item.type !== 'file') {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }
    const fullPath = resolveSafe(relPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found on server.' });
    }
    item.downloads += 1;
    await item.save();
    res.download(fullPath, item.name);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ success: false, message: 'Download failed.' });
  }
});

// GET /api/files/download-folder/:relativePath(*) - zip and stream a folder
router.get('/download-folder/*', async (req, res) => {
  try {
    const relPath = req.params[0];
    const item = await FileItem.findOne({ relativePath: relPath });
    if (!item || item.type !== 'folder') {
      return res.status(404).json({ success: false, message: 'Folder not found.' });
    }
    const fullPath = resolveSafe(relPath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'Folder not found on server.' });
    }

    res.attachment(`${item.name}.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err.message);
      res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(fullPath, false);
    await archive.finalize();

    item.downloads += 1;
    await item.save();
  } catch (err) {
    console.error('Folder download error:', err.message);
    res.status(500).json({ success: false, message: 'Folder download failed.' });
  }
});

// DELETE /api/files/*  - delete a file or folder (admin only)
router.delete('/*', requireAdmin, async (req, res) => {
  try {
    const relPath = req.params[0];
    const item = await FileItem.findOne({ relativePath: relPath });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const fullPath = resolveSafe(relPath);

    if (item.type === 'folder') {
      await fsp.rm(fullPath, { recursive: true, force: true });
      const prefix = relPath + '/';
      await FileItem.deleteMany({
        $or: [{ relativePath: relPath }, { relativePath: { $regex: '^' + escapeRegex(prefix) } }],
      });
    } else {
      await fsp.rm(fullPath, { force: true });
      await FileItem.deleteOne({ relativePath: relPath });
    }

    res.json({ success: true, message: 'Deleted Successfully' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ success: false, message: 'Delete failed.' });
  }
});

// PATCH /api/files/*/rename  (admin only) { newName }
router.patch('/*/rename', requireAdmin, async (req, res) => {
  try {
    const relPath = req.params[0];
    const { newName } = req.body;
    if (!newName || !newName.trim()) {
      return res.status(400).json({ success: false, message: 'New name is required.' });
    }
    const item = await FileItem.findOne({ relativePath: relPath });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    const safeName = sanitizeSegment(newName.trim());
    const newRelPath = item.parentPath ? `${item.parentPath}/${safeName}` : safeName;

    const oldFull = resolveSafe(relPath);
    const newFull = resolveSafe(newRelPath);

    await fsp.rename(oldFull, newFull);

    if (item.type === 'folder') {
      const oldPrefix = relPath + '/';
      const children = await FileItem.find({ relativePath: { $regex: '^' + escapeRegex(oldPrefix) } });
      for (const child of children) {
        const suffix = child.relativePath.slice(oldPrefix.length);
        const updatedRel = `${newRelPath}/${suffix}`;
        const updatedParent = updatedRel.split('/').slice(0, -1).join('/');
        child.relativePath = updatedRel;
        child.parentPath = updatedParent;
        await child.save();
      }
    }

    item.name = safeName;
    item.relativePath = newRelPath;
    item.updatedAt = new Date();
    await item.save();

    res.json({ success: true, message: 'Renamed Successfully', item });
  } catch (err) {
    console.error('Rename error:', err.message);
    res.status(500).json({ success: false, message: 'Rename failed.' });
  }
});

// PATCH /api/files/*/pin  (admin only) { pinned: true/false }
router.patch('/*/pin', requireAdmin, async (req, res) => {
  try {
    const relPath = req.params[0];
    const { pinned } = req.body;
    const item = await FileItem.findOneAndUpdate(
      { relativePath: relPath },
      { pinned: Boolean(pinned), updatedAt: new Date() },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.json({ success: true, message: pinned ? 'Pinned Successfully' : 'Unpinned Successfully', item });
  } catch (err) {
    console.error('Pin error:', err.message);
    res.status(500).json({ success: false, message: 'Pin update failed.' });
  }
});

// PATCH /api/files/*/details  (admin only) { description, tags }
router.patch('/*/details', requireAdmin, async (req, res) => {
  try {
    const relPath = req.params[0];
    const { description, tags } = req.body;
    const update = { updatedAt: new Date() };
    if (typeof description === 'string') update.description = description;
    if (Array.isArray(tags)) update.tags = tags.map((t) => String(t).trim()).filter(Boolean);

    const item = await FileItem.findOneAndUpdate({ relativePath: relPath }, update, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.json({ success: true, message: 'Updated Successfully', item });
  } catch (err) {
    console.error('Details update error:', err.message);
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
