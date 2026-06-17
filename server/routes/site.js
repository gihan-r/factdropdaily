const express = require('express');
const Settings = require('../models/Settings');
const TrafficLog = require('../models/TrafficLog');
const { detectBot } = require('../utils/botDetector');

const router = express.Router();

/**
 * GET /api/site/config
 */
router.get('/config', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();

    const adSlots = {};
    for (const [name, slot] of Object.entries(settings.adSlots.toObject())) {
      adSlots[name] = slot.enabled ? { enabled: true, code: slot.code } : { enabled: false };
    }

    res.json({
      adSlots,
      breakingTickerEnabled: settings.breakingTickerEnabled,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/site/track
 * Tracks visits and article clicks anonymously. Detects bots in real-time.
 */
router.post('/track', async (req, res, next) => {
  try {
    const { path, type = 'pageview', targetSlug = '' } = req.body || {};
    if (!path) {
      return res.status(400).json({ error: 'path is required' });
    }

    // Resolve IP address
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    // Extract first IP if list (e.g. from cloudflare or reverse proxies)
    const ip = rawIp.split(',')[0].trim();

    const userAgent = req.headers['user-agent'] || '';
    const botAnalysis = detectBot(userAgent);

    await TrafficLog.create({
      ip,
      userAgent,
      path,
      type,
      targetSlug,
      isBot: botAnalysis.isBot,
      botReason: botAnalysis.reason,
    });

    res.json({ success: true, isBot: botAnalysis.isBot });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
