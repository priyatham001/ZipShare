const mongoose = require('mongoose');

const SuggestionSchema = new mongoose.Schema({
  text: { type: String, required: true, unique: true },
  category: { type: String, enum: ['trending', 'recent'], default: 'trending' },
  pinned: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Suggestion', SuggestionSchema);
