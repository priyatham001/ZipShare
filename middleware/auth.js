const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-env';
const COOKIE_NAME = 'zipshare_token';

// --- Simple in-memory lockout tracker (per server instance) ---
// For production/multi-instance deployments, replace with a shared store (e.g. Redis).
const attempts = new Map(); // ip -> { count, lockedUntil }
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 1000;

function getAttemptState(ip) {
  if (!attempts.has(ip)) attempts.set(ip, { count: 0, lockedUntil: 0 });
  return attempts.get(ip);
}

function isLocked(ip) {
  const state = getAttemptState(ip);
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return Math.ceil((state.lockedUntil - Date.now()) / 1000);
  }
  if (state.lockedUntil && Date.now() >= state.lockedUntil) {
    state.count = 0;
    state.lockedUntil = 0;
  }
  return false;
}

function registerFailure(ip) {
  const state = getAttemptState(ip);
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCKOUT_MS;
  }
}

function registerSuccess(ip) {
  attempts.delete(ip);
}

function issueToken(res) {
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearToken(res) {
  res.clearCookie(COOKIE_NAME);
}

function getAuthState(req) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.role === 'admin';
  } catch (e) {
    return false;
  }
}

// Middleware: attaches req.isAdmin (true/false), never blocks by itself
function attachAuthState(req, res, next) {
  req.isAdmin = getAuthState(req);
  next();
}

// Middleware: blocks the request unless the caller is an authenticated admin
function requireAdmin(req, res, next) {
  if (!getAuthState(req)) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }
  next();
}

module.exports = {
  issueToken,
  clearToken,
  getAuthState,
  attachAuthState,
  requireAdmin,
  isLocked,
  registerFailure,
  registerSuccess,
};
