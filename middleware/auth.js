const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// In-memory tracking of failed login attempts per IP.
// Good enough for a small student project; resets when the server restarts.
const attempts = new Map(); // ip -> { count, lockedUntil }

function getAttemptState(ip) {
  if (!attempts.has(ip)) attempts.set(ip, { count: 0, lockedUntil: 0 });
  return attempts.get(ip);
}

function isLocked(ip) {
  const state = getAttemptState(ip);
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return Math.ceil((state.lockedUntil - Date.now()) / 1000);
  }
  return 0;
}

function registerFailedAttempt(ip) {
  const state = getAttemptState(ip);
  state.count += 1;
  if (state.count >= 3) {
    state.lockedUntil = Date.now() + 30 * 1000; // 30 second lockout
    state.count = 0;
  }
  return state;
}

function registerSuccess(ip) {
  attempts.delete(ip);
}

function issueToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '4h' });
}

// Middleware that blocks a request unless a valid admin token is presented.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Admin login required.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('bad role');
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

module.exports = { requireAdmin, isLocked, registerFailedAttempt, registerSuccess, issueToken };
