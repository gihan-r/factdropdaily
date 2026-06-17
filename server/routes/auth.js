const express = require('express');
const jwt = require('jsonwebtoken');
const { loginLimiter } = require('../middleware/rateLimiter');
const sessionStore = require('../utils/sessionStore');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check if someone is already logged in
  if (sessionStore.hasActiveSession()) {
    return res.status(403).json({ 
      error: 'Another administrator session is currently active. Only one active session is allowed.' 
    });
  }

  const token = jwt.sign({ role: 'admin', username }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });

  sessionStore.setSession(token);

  res.json({ token, expiresIn: '12h' });
});

/**
 * POST /api/auth/logout
 * Clears the active admin session immediately
 */
router.post('/logout', (req, res) => {
  sessionStore.clearSession();
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/auth/heartbeat
 * Kept alive by the admin tab to keep the single session lease active
 */
router.post('/heartbeat', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token && sessionStore.isSessionValid(token)) {
    sessionStore.updateHeartbeat();
    return res.json({ status: 'alive' });
  }

  res.status(401).json({ error: 'Session expired or invalid' });
});

module.exports = router;
