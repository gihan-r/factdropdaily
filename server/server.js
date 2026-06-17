require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const connectDB = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiter');
const { startScheduler } = require('./cron/scheduler');

const postsRoutes = require('./routes/posts');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const newsletterRoutes = require('./routes/newsletter');
const siteRoutes = require('./routes/site');

const app = express();

// --- Core middleware ---
app.use(
  helmet({
    contentSecurityPolicy: false, // relaxed for now; tighten once frontend assets are finalized
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow cached news images to be embedded
  })
);
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// --- Static frontend (HTML/CSS/JS) ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API routes ---
app.use('/api', apiLimiter);
app.use('/api', postsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/site', siteRoutes);

// --- Health check (useful for Render.com) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- SPA-style fallback for frontend routes (article/:slug, category/:name, etc.) ---
// Falls through to index.html so client-side routing/templating can handle the URL.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) next(err);
  });
});

// --- 404 for unmatched API routes ---
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
    startScheduler();

    app.listen(PORT, () => {
      console.log(`[Server] FactDropDaily API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
