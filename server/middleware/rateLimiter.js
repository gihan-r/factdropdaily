const rateLimit = require('express-rate-limit');

/**
 * General-purpose limiter for all public /api routes.
 * 200 requests per 15 minutes per IP is generous for normal browsing
 * but blocks scraping/abuse.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Stricter limiter for the admin login endpoint to slow down brute-force
 * attempts against ADMIN_USERNAME/ADMIN_PASSWORD.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

/**
 * Limiter for search endpoint - slightly tighter since text search is
 * more expensive than simple lookups.
 */
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many search requests, slow down a bit.' },
});

module.exports = { apiLimiter, loginLimiter, searchLimiter };
