const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, enum: ['trending', 'manual'], default: 'manual' },
  pinned: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Suggestion', suggestionSchema);
