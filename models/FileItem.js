const mongoose = require('mongoose');

const FileItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['file', 'folder'], required: true },
    // Relative path from the storage root, e.g. "DS-Lab/AVL/avl.c"
    relativePath: { type: String, required: true, unique: true },
    // Relative path of the parent folder ("" for root)
    parentPath: { type: String, default: '', index: true },
    extension: { type: String, default: '' },
    size: { type: Number, default: 0 }, // bytes; for folders, sum of children
    description: { type: String, default: '' },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    downloads: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

FileItemSchema.index({ name: 'text', tags: 'text', description: 'text' });

module.exports = mongoose.model('FileItem', FileItemSchema);
