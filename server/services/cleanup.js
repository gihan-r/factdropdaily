const Post = require('../models/Post');

const RETENTION_DAYS = 7;

/**
 * Delete NewsAPI-sourced posts older than RETENTION_DAYS.
 * Blogger ("Our Post") content is never deleted - it's the permanent
 * facts archive. Featured or currently-breaking news posts are spared
 * even if old.
 */
async function cleanupOldNews() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await Post.deleteMany({
    source: 'newsapi',
    publishedAt: { $lt: cutoff },
    featured: false,
    isBreaking: false,
  });

  return { deleted: result.deletedCount || 0, cutoff };
}

/**
 * Clear the "breaking" flag on posts whose breakingExpiresAt has passed.
 */
async function expireBreakingNews() {
  const result = await Post.updateMany(
    { isBreaking: true, breakingExpiresAt: { $lt: new Date() } },
    { $set: { isBreaking: false, breakingExpiresAt: null } }
  );
  return { expired: result.modifiedCount || 0 };
}

module.exports = { cleanupOldNews, expireBreakingNews, RETENTION_DAYS };
