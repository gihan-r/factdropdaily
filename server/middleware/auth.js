const jwt = require('jsonwebtoken');
const sessionStore = require('../utils/sessionStore');

/**
 * Protect admin routes. Expects: Authorization: Bearer <token>
 * Token is issued by POST /api/auth/login (see routes/auth.js).
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  // Enforce single active session check
  if (!sessionStore.isSessionValid(token)) {
    return res.status(401).json({ error: 'Session expired or invalidated by another login' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = payload;
    // Keep heartbeat fresh on any administrative API call
    sessionStore.updateHeartbeat();
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAdmin };
