const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  programName: { type: String, required: true },
  subject: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);
