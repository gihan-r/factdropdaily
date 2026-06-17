const cron = require('node-cron');
const { syncBloggerPosts } = require('../services/bloggerSync');
const { syncNewsApi } = require('../services/newsApiSync');
const { cleanupOldNews, expireBreakingNews } = require('../services/cleanup');
const { updateTrendingScores, resetDailyViewCounters } = require('../services/trending');
const { generateSitemaps } = require('../services/sitemapGenerator');

let started = false;

/**
 * Register all scheduled jobs. Safe to call once at server startup.
 *
 * Schedule:
 *  - Blogger sync:  every 30 min, but ONLY between 10:00 AM and 3:00 PM
 *  - NewsAPI sync:  4 times daily — 6:00 AM, 12:00 PM, 6:00 PM, 11:00 PM
 *  - Every 5 min:   expire breaking news whose timer ran out
 *  - Every 1 hour:  recompute trending scores + regenerate sitemaps
 *  - Every 24h:     cleanup old news + reset daily view counters (at 3AM)
 */
function startScheduler() {
  if (started) return;
  started = true;

  // --- Blogger sync: every 30 min, only between 10:00 and 15:00 (10AM–3PM) ---
  // Cron: at :00 and :30 of hours 10, 11, 12, 13, 14
  cron.schedule('0,30 10-14 * * *', async () => {
    try {
      const result = await syncBloggerPosts();
      console.log('[CRON] Blogger sync:', result);
    } catch (err) {
      console.error('[CRON] Blogger sync failed:', err.message);
      try {
        const Settings = require('../models/Settings');
        const settings = await Settings.getSettings();
        settings.lastBloggerSyncStatus = 'error';
        settings.lastBloggerSyncError = err.message;
        await settings.save();
      } catch (_) {
        /* ignore */
      }
    }
  });

  // --- NewsAPI sync: 4 fixed times per day ---
  // 06:00 = Morning, 12:00 = Afternoon, 18:00 = Evening, 23:00 = Night
  cron.schedule('0 6,12,18,23 * * *', async () => {
    const hour = new Date().getHours();
    const label = hour < 9 ? 'Morning' : hour < 15 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
    try {
      const result = await syncNewsApi();
      console.log(`[CRON] NewsAPI sync (${label}):`, result.totals);
    } catch (err) {
      console.error(`[CRON] NewsAPI sync (${label}) failed:`, err.message);
    }
  });

  // --- Expire breaking news: every 5 minutes ---
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await expireBreakingNews();
      if (result.expired) console.log('[CRON] Expired breaking news:', result);
    } catch (err) {
      console.error('[CRON] Expire breaking news failed:', err.message);
    }
  });

  // --- Trending recalculation + sitemap refresh: every hour ---
  cron.schedule('0 * * * *', async () => {
    try {
      const trending = await updateTrendingScores();
      console.log('[CRON] Trending scores updated:', trending);
    } catch (err) {
      console.error('[CRON] Trending update failed:', err.message);
    }

    try {
      const sitemap = await generateSitemaps();
      console.log('[CRON] Sitemaps regenerated:', sitemap);
    } catch (err) {
      console.error('[CRON] Sitemap generation failed:', err.message);
    }
  });

  // --- Daily cleanup: every 24 hours (at 03:00 server time) ---
  cron.schedule('0 3 * * *', async () => {
    try {
      const cleanup = await cleanupOldNews();
      console.log('[CRON] Old news cleanup:', cleanup);
    } catch (err) {
      console.error('[CRON] Cleanup failed:', err.message);
    }

    try {
      const reset = await resetDailyViewCounters();
      console.log('[CRON] Daily view counters reset:', reset);
    } catch (err) {
      console.error('[CRON] View counter reset failed:', err.message);
    }
  });

  console.log('[CRON] Scheduler started');
  console.log('[CRON]  - Blogger: every 30 min (10AM - 3PM only)');
  console.log('[CRON]  - NewsAPI: 6AM (Morning), 12PM (Afternoon), 6PM (Evening), 11PM (Night)');
}

module.exports = { startScheduler };

