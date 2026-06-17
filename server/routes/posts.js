const express = require('express');
const Post = require('../models/Post');
const { searchLimiter } = require('../middleware/rateLimiter');
const { SITE_CATEGORIES } = require('../utils/categoryMap');

const router = express.Router();

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function parsePagination(req) {
  let page = parseInt(req.query.page, 10) || 1;
  let limit = parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
  if (page < 1) page = 1;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  return { page, limit };
}

/**
 * Shape a Post document for API responses, adding display-only fields
 * the frontend needs for badges/borders.
 */
function serializePost(post) {
  const obj = post.toObject ? post.toObject() : post;
  return {
    ...obj,
    badge: obj.source === 'blogger' ? 'Our Post' : 'World News',
    isOurPost: obj.source === 'blogger',
  };
}

/**
 * Interleave news + fact posts at a 3:1 ratio (3 news, then 1 fact),
 * filling from whichever array still has items if the other runs dry.
 */
function interleavePosts(newsPosts, factPosts, limit) {
  const result = [];
  let ni = 0;
  let fi = 0;

  while (result.length < limit && (ni < newsPosts.length || fi < factPosts.length)) {
    for (let k = 0; k < 3 && result.length < limit; k += 1) {
      if (ni < newsPosts.length) {
        result.push(newsPosts[ni]);
        ni += 1;
      } else if (fi < factPosts.length) {
        result.push(factPosts[fi]);
        fi += 1;
      } else {
        break;
      }
    }

    if (result.length < limit) {
      if (fi < factPosts.length) {
        result.push(factPosts[fi]);
        fi += 1;
      } else if (ni < newsPosts.length) {
        result.push(newsPosts[ni]);
        ni += 1;
      }
    }
  }

  return result;
}

/**
 * GET /api/posts
 * Homepage feed: breaking news first (page 1 only), then a 3-news:1-fact
 * mix of the latest content.
 */
router.get('/posts', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req);

    let breaking = [];
    if (page === 1) {
      breaking = await Post.find({
        status: 'active',
        isBreaking: true,
        breakingExpiresAt: { $gt: new Date() },
      })
        .sort({ publishedAt: -1 })
        .limit(5);
    }

    const breakingIds = breaking.map((p) => p._id);
    const remainingLimit = Math.max(limit - breaking.length, 0);

    // Ratio: 1 fact per 3 news -> facts make up 1/4 of the remaining slots
    const factsNeeded = Math.max(1, Math.ceil(remainingLimit / 4));
    const newsNeeded = remainingLimit - factsNeeded;

    const factsSkip = (page - 1) * factsNeeded;
    const newsSkip = (page - 1) * newsNeeded;

    const [factPosts, newsPosts, totalFacts, totalNews] = await Promise.all([
      Post.find({ source: 'blogger', status: 'active', _id: { $nin: breakingIds } })
        .sort({ publishedAt: -1 })
        .skip(factsSkip)
        .limit(factsNeeded),
      Post.find({ source: 'newsapi', status: 'active', _id: { $nin: breakingIds } })
        .sort({ publishedAt: -1 })
        .skip(newsSkip)
        .limit(newsNeeded),
      Post.countDocuments({ source: 'blogger', status: 'active', _id: { $nin: breakingIds } }),
      Post.countDocuments({ source: 'newsapi', status: 'active', _id: { $nin: breakingIds } }),
    ]);

    const mixed = interleavePosts(newsPosts, factPosts, remainingLimit);
    const posts = [...breaking, ...mixed].map(serializePost);

    // Total pages = max pages across both sources
    const totalFactPages = Math.ceil(totalFacts / factsNeeded);
    const totalNewsPages = Math.ceil(totalNews / newsNeeded);
    const totalPages = Math.max(totalFactPages, totalNewsPages, 1);
    const total = totalFacts + totalNews;

    res.json({ page, limit, total, totalPages, breakingCount: breaking.length, posts });
  } catch (err) {
    next(err);
  }
});


/**
 * GET /api/news - NewsAPI ("World News") content only
 */
router.get('/news', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req);
    const filter = { source: 'newsapi', status: 'active' };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    res.json({ page, limit, total, posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facts - Blogger ("Our Post") content only - the facts archive
 */
router.get('/facts', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req);
    const filter = { source: 'blogger', status: 'active' };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    res.json({ page, limit, total, posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trending - top posts by trendingScore (recomputed hourly)
 */
router.get('/trending', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, MAX_LIMIT);

    const posts = await Post.find({ status: 'active' })
      .sort({ trendingScore: -1, views: -1 })
      .limit(limit);

    res.json({ posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/breaking - currently active breaking news items
 */
router.get('/breaking', async (req, res, next) => {
  try {
    const posts = await Post.find({
      status: 'active',
      isBreaking: true,
      breakingExpiresAt: { $gt: new Date() },
    }).sort({ publishedAt: -1 });

    res.json({ posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/categories/:name - posts within a single category
 */
router.get('/categories/:name', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req);
    const categoryName = SITE_CATEGORIES.find(
      (c) => c.toLowerCase() === req.params.name.toLowerCase()
    );

    if (!categoryName) {
      return res.status(404).json({ error: 'Unknown category' });
    }

    const filter = { category: categoryName, status: 'active' };

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    res.json({ category: categoryName, page, limit, total, posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/search?q=keyword - full-text search across Blogger + NewsAPI content
 */
router.get('/search', searchLimiter, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const { page, limit } = parsePagination(req);

    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const filter = { status: 'active', $text: { $search: q } };

    const [posts, total] = await Promise.all([
      Post.find(filter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter),
    ]);

    res.json({ query: q, page, limit, total, posts: posts.map(serializePost) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/post/:slug - single post detail (full article page).
 * Increments view counters (used for trending + "most read today").
 */
router.get('/post/:slug', async (req, res, next) => {
  try {
    const post = await Post.findOneAndUpdate(
      { slug: req.params.slug, status: 'active' },
      { $inc: { views: 1, viewsToday: 1 } },
      { new: true }
    );

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ post: serializePost(post) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
