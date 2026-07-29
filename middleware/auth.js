// Blocks a route unless the current session was granted admin rights
// by a successful /api/auth/login call. This is the real security
// boundary - the frontend hiding buttons is just UX, never trust it.
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  return res.status(401).json({ error: 'Admin authentication required' });
}

// Double-submit CSRF check for state-changing requests (upload/delete/login).
// The token is generated per-session and must be echoed back in a header.
function requireCsrf(req, res, next) {
  const headerToken = req.get('X-CSRF-Token');
  if (!req.session || !req.session.csrfToken || headerToken !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  return next();
}

module.exports = { requireAdmin, requireCsrf };
