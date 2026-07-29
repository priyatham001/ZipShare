const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const Suggestion = require('../models/Suggestion');

// GET /api/suggestions
router.get('/', async (req, res) => {
  try {
    const suggestions = await Suggestion.find().sort({ pinned: -1, order: 1, createdAt: -1 });
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not load suggestions.' });
  }
});

// POST /api/suggestions  (admin only) { text, category }
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { text, category = 'trending' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Suggestion text is required.' });
    }
    const suggestion = await Suggestion.create({ text: text.trim(), category });
    res.json({ success: true, suggestion });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Suggestion already exists.' });
    }
    res.status(500).json({ success: false, message: 'Could not create suggestion.' });
  }
});

// PATCH /api/suggestions/:id  (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { text, category, pinned, order } = req.body;
    const update = {};
    if (typeof text === 'string') update.text = text.trim();
    if (typeof category === 'string') update.category = category;
    if (typeof pinned === 'boolean') update.pinned = pinned;
    if (typeof order === 'number') update.order = order;

    const suggestion = await Suggestion.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!suggestion) return res.status(404).json({ success: false, message: 'Suggestion not found.' });
    res.json({ success: true, suggestion });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not update suggestion.' });
  }
});

// DELETE /api/suggestions/:id  (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await Suggestion.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Suggestion not found.' });
    res.json({ success: true, message: 'Deleted Successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not delete suggestion.' });
  }
});

module.exports = router;
