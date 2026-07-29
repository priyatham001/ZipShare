const mongoose = require('mongoose');

// Admin-managed chips shown under the search bar (e.g. "AVL Tree", "Python Notes").
// Purely a curated list - independent from the actual uploaded files.
const suggestionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 60 },
  pinned: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Suggestion', suggestionSchema);
