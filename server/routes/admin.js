const express = require('express');
const Post = require('../models/Post');
const Settings = require('../models/Settings');
const Subscriber = require('../models/Subscriber');
const FacebookLog = require('../models/FacebookLog');
const TrafficLog = require('../models/TrafficLog');

const { requireAdmin } = require('../middleware/auth');
const { syncBloggerPosts } = require('../services/bloggerSync');
const { syncNewsApi } = require('../services/newsApiSync');
const { manualPostToFacebook } = require('../services/facebookPoster');
const { sendNewsletterToAll } = require('../services/mailer');
const { generateSitemaps } = require('../services/sitemapGenerator');
const { NEWSAPI_CATEGORY_MAP } = require('../utils/categoryMap');

const router = express.Router();

// Every route below requires a valid admin JWT
router.use(requireAdmin);

/* ============================================================
 * DASHBOARD
 * ========================================================== */

/**
 * GET /api/admin/dashboard
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [todaysViews, totalPosts, bloggerCount, newsCount, subscriberCount, settings, topTrending] =
      await Promise.all([
        Post.aggregate([{ $group: { _id: null, total: { $sum: '$viewsToday' } } }]),
        Post.countDocuments({}),
        Post.countDocuments({ source: 'blogger' }),
        Post.countDocuments({ source: 'newsapi' }),
        Subscriber.countDocuments({}),
        Settings.getSettings(),
        Post.find({ status: 'active' }).sort({ trendingScore: -1 }).limit(5),
      ]);

    res.json({
      todaysViews: todaysViews[0]?.total || 0,
      totalPosts,
      bloggerPosts: bloggerCount,
      newsPosts: newsCount,
      newsletterSubscribers: subscriberCount,
      lastSync: {
        blogger: settings.lastBloggerSync,
        newsapi: settings.lastNewsApiFetch,
      },
      topTrending: topTrending.map((p) => ({
        _id: p._id,
        title: p.title,
        slug: p.slug,
        source: p.source,
        views: p.views,
        trendingScore: p.trendingScore,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * BLOGGER SYNC MANAGER
 * ========================================================== */

/**
 * GET /api/admin/blogger - sync status + category map
 */
router.get('/blogger', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      lastSync: settings.lastBloggerSync,
      status: settings.lastBloggerSyncStatus,
      error: settings.lastBloggerSyncError,
      totalSynced: settings.bloggerPostsSynced,
      categoryMap: settings.bloggerCategoryMap,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/blogger/sync - manual sync button
 */
router.post('/blogger/sync', async (req, res, next) => {
  try {
    const result = await syncBloggerPosts();
    res.json({ message: 'Blogger sync complete', ...result });
  } catch (err) {
    try {
      const settings = await Settings.getSettings();
      settings.lastBloggerSyncStatus = 'error';
      settings.lastBloggerSyncError = err.message;
      await settings.save();
    } catch (_) {
      /* ignore */
    }
    res.status(502).json({ error: `Blogger sync failed: ${err.message}` });
  }
});

/**
 * PUT /api/admin/blogger/category-map
 * Body: { categoryMap: [{ match: 'space', category: 'Space' }, ...] }
 */
router.put('/blogger/category-map', async (req, res, next) => {
  try {
    const { categoryMap } = req.body || {};
    if (!Array.isArray(categoryMap)) {
      return res.status(400).json({ error: 'categoryMap must be an array' });
    }

    const settings = await Settings.getSettings();
    settings.bloggerCategoryMap = categoryMap;
    await settings.save();

    res.json({ message: 'Category map updated', categoryMap: settings.bloggerCategoryMap });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * NEWSAPI MANAGER
 * ========================================================== */

/**
 * GET /api/admin/newsapi - fetch status, usage, category toggles, blacklist
 */
router.get('/newsapi', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      lastFetch: settings.lastNewsApiFetch,
      status: settings.lastNewsApiStatus,
      error: settings.lastNewsApiError,
      usage: settings.newsApiUsage,
      dailyLimit: 100,
      categories: Object.fromEntries(settings.newsApiCategories),
      availableCategories: Object.keys(NEWSAPI_CATEGORY_MAP),
      blacklistedSources: settings.blacklistedSources,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/newsapi/sync - manual fetch button
 */
router.post('/newsapi/sync', async (req, res, next) => {
  try {
    const result = await syncNewsApi();
    res.json({ message: 'NewsAPI sync complete', ...result });
  } catch (err) {
    res.status(502).json({ error: `NewsAPI sync failed: ${err.message}` });
  }
});

/**
 * PUT /api/admin/newsapi/categories
 * Body: { categories: { general: true, technology: false, ... } }
 */
router.put('/newsapi/categories', async (req, res, next) => {
  try {
    const { categories } = req.body || {};
    if (!categories || typeof categories !== 'object') {
      return res.status(400).json({ error: 'categories object is required' });
    }

    const settings = await Settings.getSettings();
    for (const [key, value] of Object.entries(categories)) {
      if (key in NEWSAPI_CATEGORY_MAP) {
        settings.newsApiCategories.set(key, Boolean(value));
      }
    }
    await settings.save();

    res.json({ message: 'Categories updated', categories: Object.fromEntries(settings.newsApiCategories) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/newsapi/blacklist
 * Body: { sources: ['Daily Mail', 'Some Tabloid'] }
 */
router.put('/newsapi/blacklist', async (req, res, next) => {
  try {
    const { sources } = req.body || {};
    if (!Array.isArray(sources)) {
      return res.status(400).json({ error: 'sources must be an array of strings' });
    }

    const settings = await Settings.getSettings();
    settings.blacklistedSources = sources.map((s) => String(s));
    await settings.save();

    res.json({ message: 'Blacklist updated', blacklistedSources: settings.blacklistedSources });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * BREAKING NEWS MANAGER
 * ========================================================== */

/**
 * GET /api/admin/breaking - list current breaking posts + ticker settings
 */
router.get('/breaking', async (req, res, next) => {
  try {
    const [posts, settings] = await Promise.all([
      Post.find({ isBreaking: true }).sort({ breakingExpiresAt: -1 }),
      Settings.getSettings(),
    ]);

    res.json({
      posts,
      tickerEnabled: settings.breakingTickerEnabled,
      autoDetectionEnabled: settings.autoBreakingDetectionEnabled,
      defaultDurationMinutes: settings.breakingDefaultDurationMinutes,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/breaking/:id - mark a post as breaking
 * Body: { durationMinutes?: number }
 */
router.post('/breaking/:id', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    const durationMinutes = req.body?.durationMinutes || settings.breakingDefaultDurationMinutes;

    const post = await Post.findByIdAndUpdate(
      req.params.id,
      {
        isBreaking: true,
        breakingExpiresAt: new Date(Date.now() + durationMinutes * 60 * 1000),
      },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ message: 'Post marked as breaking', post });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/breaking/:id - unmark a post as breaking
 */
router.delete('/breaking/:id', async (req, res, next) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { isBreaking: false, breakingExpiresAt: null },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ message: 'Breaking flag removed', post });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/breaking/settings
 * Body: { tickerEnabled?, autoDetectionEnabled?, defaultDurationMinutes? }
 */
router.put('/breaking/settings', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    const { tickerEnabled, autoDetectionEnabled, defaultDurationMinutes } = req.body || {};

    if (typeof tickerEnabled === 'boolean') settings.breakingTickerEnabled = tickerEnabled;
    if (typeof autoDetectionEnabled === 'boolean') settings.autoBreakingDetectionEnabled = autoDetectionEnabled;
    if (typeof defaultDurationMinutes === 'number') settings.breakingDefaultDurationMinutes = defaultDurationMinutes;

    await settings.save();
    res.json({ message: 'Breaking news settings updated', settings });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * CONTENT MANAGER
 * ========================================================== */

/**
 * GET /api/admin/posts - list all posts with optional filters
 * Query: source, category, status, q, page, limit
 */
router.get('/posts', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = {};
    if (req.query.source) filter.source = req.query.source;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) filter.title = { $regex: req.query.q, $options: 'i' };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    res.json({ page, limit, total, posts });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/posts/:id - edit title / excerpt / category / status
 */
router.put('/posts/:id', async (req, res, next) => {
  try {
    const allowed = ['title', 'excerpt', 'content', 'category', 'status', 'image'];
    const updates = {};
    for (const key of allowed) {
      if (key in (req.body || {})) updates[key] = req.body[key];
    }

    const post = await Post.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    res.json({ message: 'Post updated', post });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/posts/:id/feature - toggle featured flag
 * Body: { featured: true|false }
 */
router.put('/posts/:id/feature', async (req, res, next) => {
  try {
    const featured = Boolean(req.body?.featured);
    const post = await Post.findByIdAndUpdate(req.params.id, { featured }, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    res.json({ message: `Post ${featured ? 'featured' : 'unfeatured'}`, post });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/posts/:id - delete an unwanted post (e.g. bad news article)
 */
router.delete('/posts/:id', async (req, res, next) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    res.json({ message: 'Post deleted', id: req.params.id });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * FACEBOOK MANAGER
 * ========================================================== */

/**
 * GET /api/admin/facebook - auto-post settings + recent post history
 */
router.get('/facebook', async (req, res, next) => {
  try {
    const [settings, history] = await Promise.all([
      Settings.getSettings(),
      FacebookLog.find({}).sort({ createdAt: -1 }).limit(50).populate('post', 'title slug source'),
    ]);

    res.json({ autoPost: settings.facebookAutoPost, history });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/facebook/settings
 * Body: { facts?: bool, news?: bool, breaking?: bool }
 */
router.put('/facebook/settings', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    const { facts, news, breaking } = req.body || {};

    if (typeof facts === 'boolean') settings.facebookAutoPost.facts = facts;
    if (typeof news === 'boolean') settings.facebookAutoPost.news = news;
    if (typeof breaking === 'boolean') settings.facebookAutoPost.breaking = breaking;

    await settings.save();
    res.json({ message: 'Facebook settings updated', autoPost: settings.facebookAutoPost });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/facebook/post/:id - manually post a specific post to Facebook
 */
router.post('/facebook/post/:id', async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const result = await manualPostToFacebook(post);
    res.json({ message: 'Posted to Facebook', result });
  } catch (err) {
    res.status(502).json({ error: `Facebook post failed: ${err.message}` });
  }
});

/* ============================================================
 * NEWSLETTER MANAGER
 * ========================================================== */

/**
 * GET /api/admin/newsletter - subscriber list
 */
router.get('/newsletter', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const [subscribers, total] = await Promise.all([
      Subscriber.find({}).sort({ subscribedAt: -1 }).skip((page - 1) * limit).limit(limit),
      Subscriber.countDocuments({}),
    ]);

    res.json({ page, limit, total, subscribers });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/newsletter/send - send the digest to all subscribers now
 */
router.post('/newsletter/send', async (req, res, next) => {
  try {
    const result = await sendNewsletterToAll();
    res.json({ message: 'Newsletter sent', ...result });
  } catch (err) {
    res.status(502).json({ error: `Newsletter send failed: ${err.message}` });
  }
});

/* ============================================================
 * SEO MANAGER
 * ========================================================== */

/**
 * GET /api/admin/seo - sitemap status + a meta tag preview for a given post
 */
router.get('/seo', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      sitemapLastGenerated: settings.sitemapLastGenerated,
      sitemapUrl: '/sitemap.xml',
      newsSitemapUrl: '/news-sitemap.xml',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/seo/regenerate-sitemap
 */
router.post('/seo/regenerate-sitemap', async (req, res, next) => {
  try {
    const result = await generateSitemaps();
    res.json({ message: 'Sitemaps regenerated', ...result });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * SITE SETTINGS (AdSense slots, etc.)
 * ========================================================== */

/**
 * GET /api/admin/settings - full settings document (for general settings screen)
 */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/settings/ad-slots
 * Body: { adSlots: { headerLeaderboard: { enabled, code }, ... } }
 */
router.put('/settings/ad-slots', async (req, res, next) => {
  try {
    const { adSlots } = req.body || {};
    if (!adSlots || typeof adSlots !== 'object') {
      return res.status(400).json({ error: 'adSlots object is required' });
    }

    const settings = await Settings.getSettings();
    for (const [slotName, config] of Object.entries(adSlots)) {
      if (settings.adSlots[slotName]) {
        if (typeof config.enabled === 'boolean') settings.adSlots[slotName].enabled = config.enabled;
        if (typeof config.code === 'string') settings.adSlots[slotName].code = config.code;
      }
    }
    await settings.save();

    res.json({ message: 'Ad slots updated', adSlots: settings.adSlots });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/traffic
 * Returns summary and detailed logs of traffic visits and clicks, including bot stats and top posts.
 */
router.get('/traffic', async (req, res, next) => {
  try {
    const totalCount = await TrafficLog.countDocuments();
    const botCount = await TrafficLog.countDocuments({ isBot: true });
    const humanCount = totalCount - botCount;

    const pageviews = await TrafficLog.countDocuments({ type: 'pageview' });
    const clicks = await TrafficLog.countDocuments({ type: 'click' });

    // Aggregate top 10 clicked posts
    const topClickedAgg = await TrafficLog.aggregate([
      { $match: { type: 'click', targetSlug: { $ne: '' } } },
      { $group: { _id: '$targetSlug', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Resolve post titles
    const topPosts = [];
    for (const item of topClickedAgg) {
      const post = await Post.findOne({ slug: item._id }).select('title source');
      topPosts.push({
        slug: item._id,
        count: item.count,
        title: post ? post.title : item._id,
        source: post ? post.source : 'unknown'
      });
    }

    // Get last 100 entries ordered by newest first
    const logs = await TrafficLog.find()
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      summary: {
        total: totalCount,
        bots: botCount,
        humans: humanCount,
        pageviews,
        clicks
      },
      topPosts,
      logs
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
