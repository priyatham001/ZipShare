const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"; // Set via env vars in Render

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Storage directory setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Sanitize filename to prevent path traversal
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// MongoDB Schemas
const FileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  serverPath: { type: String, required: true },
  size: { type: Number, required: true },
  uploadDate: { type: Date, default: Date.now },
  description: { type: String, default: '' },
  downloads: { type: Number, default: 0 },
  isPinned: { type: Boolean, default: false },
  isFolder: { type: Boolean, default: false },
  tags: [{ type: String }],
  mimeType: String
});

const SuggestionSchema = new mongoose.Schema({
  text: { type: String, required: true, unique: true },
  category: { type: String, default: 'Trending' },
  pinned: { type: Boolean, default: false }
});

const File = mongoose.model('File', FileSchema);
const Suggestion = mongoose.model('Suggestion', SuggestionSchema);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/zipshare';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Auth Middleware
const checkAdmin = (req, res, next) => {
  const authHeader = req.headers['x-admin-password'];
  if (authHeader === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

// API ROUTES

// Admin Verification API
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Welcome Admin' });
  }
  return res.status(401).json({ 
    success: false, 
    message: 'Access Denied. Incorrect password. Please try again.' 
  });
});

// Single & Multiple Files / Folder Upload API
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided' });
    }

    const relativePaths = req.body.relativePaths; // From frontend folder uploads
    
    // If uploading a direct folder with multiple files, bundle into zip or preserve hierarchy
    if (relativePaths && Array.isArray(relativePaths) && relativePaths.length > 1) {
      const folderName = relativePaths[0].split('/')[0] || 'Uploaded_Folder';
      const zipFileName = `${Date.now()}-${folderName}.zip`;
      const zipPath = path.join(uploadDir, zipFileName);
      
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        // Clean up individual uploaded temp files
        req.files.forEach(f => fs.unlinkSync(f.path));

        const newFile = new File({
          originalName: `${folderName}.zip`,
          serverPath: zipFileName,
          size: archive.pointer(),
          isFolder: true,
          tags: ['Folder', folderName, 'Project']
        });
        await newFile.save();
        return res.json({ success: true, file: newFile });
      });

      archive.pipe(output);
      req.files.forEach((file, idx) => {
        const relPath = Array.isArray(relativePaths) ? relativePaths[idx] : relativePaths;
        archive.file(file.path, { name: relPath || file.originalname });
      });
      await archive.finalize();

    } else {
      // Single file upload processing
      const savedFiles = [];
      for (const file of req.files) {
        const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
        const newFile = new File({
          originalName: file.originalname,
          serverPath: file.filename,
          size: file.size,
          tags: [ext, file.originalname.split('.')[0]],
          mimeType: file.mimetype
        });
        await newFile.save();
        savedFiles.push(newFile);
      }
      return res.json({ success: true, files: savedFiles });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Upload processing failed' });
  }
});

// Get Files with Search & Tags Filtering API
app.get('/api/files', async (req, res) => {
  try {
    const { query, filter } = req.query;
    let filterObj = {};

    if (query) {
      const regex = new RegExp(query, 'i');
      filterObj.$or = [
        { originalName: regex },
        { description: regex },
        { tags: regex }
      ];
    }

    if (filter && filter !== 'All') {
      if (filter === 'Folders') filterObj.isFolder = true;
      else if (filter === 'Pinned') filterObj.isPinned = true;
      else {
        const extRegex = new RegExp(filter, 'i');
        filterObj.$or = [
          { originalName: extRegex },
          { tags: extRegex }
        ];
      }
    }

    const files = await File.find(filterObj).sort({ isPinned: -1, uploadDate: -1 });
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch files' });
  }
});

// File Download API
app.get('/api/download/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).send('File not found');

    file.downloads += 1;
    await file.save();

    const filePath = path.join(uploadDir, file.serverPath);
    res.download(filePath, file.originalName);
  } catch (err) {
    res.status(500).send('Download error');
  }
});

// File Raw Preview API
app.get('/api/preview/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).send('File not found');

    const filePath = path.join(uploadDir, file.serverPath);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send('Preview error');
  }
});

// Delete File API
app.delete('/api/files/:id', checkAdmin, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (file) {
      const filePath = path.join(uploadDir, file.serverPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await File.findByIdAndDelete(req.params.id);
    }
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete file' });
  }
});

// Search Suggestions API
app.get('/api/suggestions', async (req, res) => {
  try {
    const suggestions = await Suggestion.find().sort({ pinned: -1, _id: -1 });
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching suggestions' });
  }
});

app.post('/api/suggestions', checkAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    const newSug = new Suggestion({ text });
    await newSug.save();
    res.json({ success: true, suggestion: newSug });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Duplicate or invalid suggestion' });
  }
});

app.listen(PORT, () => console.log(`ZipShare V3 server running on port ${PORT}`));