const axios = require('axios');
const crypto = require('crypto');
const Post = require('../models/Post');
const Settings = require('../models/Settings');
const { resolveNewsApiCategory } = require('../utils/categoryMap');
const { slugWithSuffix } = require('../utils/slugify');
const { cacheImage } = require('../utils/imageProxy');
const { maybeAutoPostToFacebook } = require('./facebookPoster');

const NEWSAPI_BASE = 'https://newsapi.org/v2/top-headlines';
const FREE_TIER_DAILY_LIMIT = 100;

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

/**
 * Ensure the daily NewsAPI usage counter is reset if the date rolled over,
 * then check we still have quota. Returns true if a request is allowed,
 * and increments the counter as a side effect.
 */
function consumeQuota(settings) {
  const today = todayStr();
  if (settings.newsApiUsage.date !== today) {
    settings.newsApiUsage.date = today;
    settings.newsApiUsage.count = 0;
  }

  if (settings.newsApiUsage.count >= FREE_TIER_DAILY_LIMIT) {
    return false;
  }

  settings.newsApiUsage.count += 1;
  return true;
}

/**
 * Fetch top headlines for a single NewsAPI category and upsert into Posts.
 * Returns { fetched, created, skipped, breaking }
 */
async function syncCategory(category, settings, apiKey) {
  if (!consumeQuota(settings)) {
    return { fetched: 0, created: 0, skipped: 0, breaking: 0, quotaExceeded: true };
  }

  const { data } = await axios.get(NEWSAPI_BASE, {
    params: {
      category,
      language: 'en',
      pageSize: 10,
      apiKey,
    },
    timeout: 20000,
  });

  const articles = data?.articles || [];
  const siteCategory = resolveNewsApiCategory(category);
  const blacklist = (settings.blacklistedSources || []).map((s) => s.toLowerCase());

  let created = 0;
  let skipped = 0;
  let breaking = 0;

  for (let i = 0; i < articles.length; i += 1) {
    const article = articles[i];
    const sourceName = article.source?.name || 'Unknown';

    if (blacklist.includes(sourceName.toLowerCase())) {
      skipped += 1;
      continue;
    }

    if (!article.url || !article.title || article.title === '[Removed]') {
      skipped += 1;
      continue;
    }

    const externalId = hashUrl(article.url);
    const existing = await Post.findOne({ externalId });
    if (existing) {
      skipped += 1;
      continue;
    }

    const image = await cacheImage(article.urlToImage || '');
    const slug = slugWithSuffix(article.title, externalId);
    const publishedAt = article.publishedAt ? new Date(article.publishedAt) : new Date();

    // --- Auto breaking-news heuristic ---
    // The very top story of the "general" (World) category, if published
    // within the last hour, is flagged as breaking news.
    let isBreaking = false;
    let breakingExpiresAt = null;
    if (
      settings.autoBreakingDetectionEnabled &&
      category === 'general' &&
      i === 0 &&
      Date.now() - publishedAt.getTime() < 60 * 60 * 1000
    ) {
      isBreaking = true;
      breakingExpiresAt = new Date(Date.now() + settings.breakingDefaultDurationMinutes * 60 * 1000);
      breaking += 1;
    }

    const post = await Post.create({
      title: article.title,
      slug,
      content: '',
      excerpt: article.description || '',
      image,
      source: 'newsapi',
      sourceName,
      sourceUrl: article.url,
      externalId,
      category: siteCategory,
      labels: [],
      isBreaking,
      breakingExpiresAt,
      publishedAt,
      seo: {
        metaTitle: article.title,
        metaDescription: article.description || '',
        ogImage: image,
        canonicalUrl: article.url,
      },
    });

    created += 1;

    if (isBreaking) {
      maybeAutoPostToFacebook(post, 'breaking').catch((err) =>
        console.error('[FB] auto-post (breaking) failed:', err.message)
      );
    } else {
      maybeAutoPostToFacebook(post, 'news').catch((err) =>
        console.error('[FB] auto-post (news) failed:', err.message)
      );
    }
  }

  return { fetched: articles.length, created, skipped, breaking, quotaExceeded: false };
}

/**
 * Fetch top headlines for every enabled category in Settings.newsApiCategories.
 * Returns a per-category + total summary.
 */
async function syncNewsApi() {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    throw new Error('NEWSAPI_KEY is not configured');
  }

  const settings = await Settings.getSettings();
  const enabledCategories = Array.from(settings.newsApiCategories.entries())
    .filter(([, enabled]) => enabled)
    .map(([cat]) => cat);

  const results = {};
  let totals = { fetched: 0, created: 0, skipped: 0, breaking: 0 };
  let quotaExceeded = false;

  for (const category of enabledCategories) {
    try {
      const result = await syncCategory(category, settings, apiKey);
      results[category] = result;
      totals.fetched += result.fetched;
      totals.created += result.created;
      totals.skipped += result.skipped;
      totals.breaking += result.breaking;
      if (result.quotaExceeded) quotaExceeded = true;
    } catch (err) {
      results[category] = { error: err.response?.data?.message || err.message };
    }
  }

  settings.lastNewsApiFetch = new Date();
  settings.lastNewsApiStatus = quotaExceeded ? 'quota_exceeded' : 'success';
  settings.lastNewsApiError = quotaExceeded ? 'Daily NewsAPI free-tier quota (100) reached' : '';
  await settings.save();

  return { totals, results, quotaExceeded, usage: settings.newsApiUsage };
}

module.exports = { syncNewsApi };
