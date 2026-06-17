const express = require('express');
const Subscriber = require('../models/Subscriber');

const router = express.Router();

/**
 * POST /api/newsletter/subscribe
 * Body: { email }
 * Used by the sidebar "Newsletter signup" form.
 */
router.post('/subscribe', async (req, res, next) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const existing = await Subscriber.findOne({ email });
    if (existing) {
      return res.json({ message: 'You are already subscribed!' });
    }

    await Subscriber.create({ email });
    res.status(201).json({ message: 'Subscribed successfully!' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
