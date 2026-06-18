require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');

const connectDB = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiter');
const { startScheduler } = require('./cron/scheduler');

const postsRoutes = require('./routes/posts');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const newsletterRoutes = require('./routes/newsletter');
const siteRoutes = require('./routes/site');

const app = express();

// ---------------- CORE MIDDLEWARE ----------------
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(cors({
  origin: [
    'https://factdropdaily.pages.dev',
    'https://factdropdaily-production.up.railway.app',
  ]
}));

app.use(express.json({ limit: '2mb' }));

// ---------------- PATHS ----------------
const publicPath = path.join(__dirname, '..', 'public');

// ---------------- STATIC FILES ----------------
app.use(express.static(publicPath));

// ---------------- API ROUTES ----------------
app.use('/api', apiLimiter);
app.use('/api', postsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/site', siteRoutes);

// ---------------- HEALTH CHECK ----------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---------------- SITEMAP ROUTES (IMPORTANT: BEFORE "*") ----------------
app.get('/sitemap.xml', (req, res) => {
  const sitemapPath = path.join(publicPath, 'sitemap.xml');

  if (fs.existsSync(sitemapPath)) {
    res.header('Content-Type', 'application/xml');
    return res.sendFile(sitemapPath);
  }

  return res.status(404).json({ error: 'Sitemap not generated yet' });
});

app.get('/news-sitemap.xml', (req, res) => {
  const sitemapPath = path.join(publicPath, 'news-sitemap.xml');

  if (fs.existsSync(sitemapPath)) {
    res.header('Content-Type', 'application/xml');
    return res.sendFile(sitemapPath);
  }

  return res.status(404).json({ error: 'News sitemap not generated yet' });
});

// ---------------- SPA FALLBACK (MUST BE LAST) ----------------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ---------------- 404 API ----------------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------- ERROR HANDLER ----------------
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
    startScheduler();

    app.listen(PORT, () => {
      console.log(`[Server] FactDropDaily running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;