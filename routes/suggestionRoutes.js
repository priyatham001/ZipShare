const express = require('express');
const Suggestion = require('../models/Suggestion');
const { requireAdmin, requireCsrf } = require('../middleware/auth');

const router = express.Router();

// GET /api/suggestions - public, pinned first then most recent
router.get('/', async (req, res) => {
  try {
    const suggestions = await Suggestion.find().sort({ pinned: -1, order: 1, createdAt: -1 }).lean();
    res.json(suggestions.map((s) => ({ id: s._id, text: s.text, pinned: s.pinned })));
  } catch (err) {
    console.error('List suggestions error:', err);
    res.status(500).json({ error: 'Could not load suggestions' });
  }
});

// POST /api/suggestions - admin only, { text }
router.post('/', requireAdmin, requireCsrf, async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Suggestion text required' });
    const suggestion = await Suggestion.create({ text });
    res.json({ success: true, suggestion });
  } catch (err) {
    console.error('Create suggestion error:', err);
    res.status(500).json({ error: 'Could not add suggestion' });
  }
});

// PATCH /api/suggestions/:id - admin only, toggle pin
router.patch('/:id', requireAdmin, requireCsrf, async (req, res) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    if (typeof req.body.pinned === 'boolean') suggestion.pinned = req.body.pinned;
    await suggestion.save();
    res.json({ success: true, suggestion });
  } catch (err) {
    console.error('Update suggestion error:', err);
    res.status(500).json({ error: 'Could not update suggestion' });
  }
});

// DELETE /api/suggestions/:id - admin only
router.delete('/:id', requireAdmin, requireCsrf, async (req, res) => {
  try {
    await Suggestion.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete suggestion error:', err);
    res.status(500).json({ error: 'Could not delete suggestion' });
  }
});

module.exports = router;
