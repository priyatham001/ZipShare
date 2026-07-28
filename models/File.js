const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  storedName: {
    type: String,
    required: true,
    unique: true
  },
  size: {
    type: Number,
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('File', fileSchema);
