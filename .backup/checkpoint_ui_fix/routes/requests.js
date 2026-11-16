const express = require('express');
const router = express.Router();
const { requestsDB } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// POST /api/requests - submit a new program request (Public)
router.post('/', async (req, res) => {
  try {
    const { programName, subject, description } = req.body;
    if (!programName || !programName.trim() || !subject || !subject.trim()) {
      return res.status(400).json({ error: 'Program Name and Subject are required.' });
    }
    const requestItem = await requestsDB.create({
      programName: programName.trim(),
      subject: subject.trim(),
      description: (description || '').trim()
    });
    res.status(201).json({ message: 'Request submitted successfully!', request: requestItem });
  } catch (err) {
    console.error('Submit request error:', err.message);
    res.status(500).json({ error: 'Failed to submit request.' });
  }
});

// GET /api/requests - list all program requests (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const requests = await requestsDB.find();
    res.json(requests);
  } catch (err) {
    console.error('List requests error:', err.message);
    res.status(500).json({ error: 'Failed to load requests.' });
  }
});

// PATCH /api/requests/:id - update request status (Admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    const updated = await requestsDB.findByIdAndUpdate(req.params.id, { status });
    if (!updated) return res.status(404).json({ error: 'Request not found.' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update request status.' });
  }
});

// DELETE /api/requests/:id - delete a request (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await requestsDB.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Request not found.' });
    res.json({ message: 'Request deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete request.' });
  }
});

module.exports = router;
