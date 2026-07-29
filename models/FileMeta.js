const mongoose = require('mongoose');

// This collection only stores METADATA. The actual file bytes live in
// MongoDB's GridFS buckets (fs.files / fs.chunks), which is what makes
// uploads survive a Render redeploy or restart - unlike local disk
// storage, which is wiped every time the container restarts.
const fileMetaSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true }, // points at fs.files._id
  relativePath: { type: String, default: '' }, // folder structure, e.g. "AVL-Lab/AVL.c"
  tags: { type: [String], default: [] },
  downloadCount: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FileMeta', fileMetaSchema);
