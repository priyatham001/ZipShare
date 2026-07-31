const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },     // actual name on disk
  relativePath: { type: String, required: true },    // e.g. "AVL_Project/src/Main.java"
  folderName: { type: String, default: null },        // top-level folder this file belongs to, if any
  batchId: { type: String, default: null },           // groups files uploaded together as one folder
  extension: { type: String, default: '' },
  size: { type: Number, default: 0 },
  description: { type: String, default: '' },
  tags: { type: [String], default: [] },
  category: { type: String, default: 'other' },
  subject: { type: String, default: null },
  exercise: { type: String, default: null },
  question: { type: String, default: null },
  expectedOutput: { type: String, default: null },
  content: { type: String, default: null },
  pinned: { type: Boolean, default: false },
  downloads: { type: Number, default: 0 },
  uploadDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('File', fileSchema);
