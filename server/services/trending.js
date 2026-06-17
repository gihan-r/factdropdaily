const Post = require('../models/Post');

/**
 * Recalculate trendingScore for all active posts published in the last 48h.
 * Uses a Reddit-style "hot" formula so recent + popular posts rise,
 * and posts naturally fall off as they age.
 *
 *   score = viewsToday / (hoursSincePublish + 2) ^ 1.5
 */
async function updateTrendingScores() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const posts = await Post.find({
    status: 'active',
    publishedAt: { $gte: cutoff },
  }).select('_id views viewsToday publishedAt');

  const ops = posts.map((post) => {
    const hoursSincePublish = Math.max(0, (Date.now() - post.publishedAt.getTime()) / 3600000);
    const score = (post.viewsToday || 0) / Math.pow(hoursSincePublish + 2, 1.5);

    return {
      updateOne: {
        filter: { _id: post._id },
        update: { $set: { trendingScore: score } },
      },
    };
  });

  if (ops.length) {
    await Post.bulkWrite(ops);
  }

  return { updated: ops.length };
}

/**
 * Reset the per-day view counters. Intended to run once daily
 * (paired with the cleanup cron) so "Most read today" stays accurate.
 */
async function resetDailyViewCounters() {
  const result = await Post.updateMany({}, { $set: { viewsToday: 0 } });
  return { reset: result.modifiedCount || 0 };
}

module.exports = { updateTrendingScores, resetDailyViewCounters };
