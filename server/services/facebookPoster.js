const axios = require('axios');
const Settings = require('../models/Settings');
const FacebookLog = require('../models/FacebookLog');

const GRAPH_VERSION = 'v19.0';

/**
 * Build the public-facing URL for a post on our own site.
 */
function buildPostUrl(post) {
  const base = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (post.source === 'blogger') {
    return `${base}/article/${post.slug}`;
  }
  // External news -> our "external news" preview page (which links onward)
  return `${base}/news/${post.slug}`;
}

/**
 * Build the message text for a Facebook post based on type.
 */
function buildMessage(post, type) {
  const title = post.title;
  const excerpt = post.excerpt ? `\n\n${post.excerpt}` : '';

  if (type === 'breaking') {
    return `🚨 BREAKING: ${title}${excerpt}`;
  }
  if (type === 'fact') {
    return `🧠 Did you know?\n\n${title}${excerpt}`;
  }
  // news
  return `📰 ${title}${excerpt}\n\nSource: ${post.sourceName || 'News'}`;
}

/**
 * Low-level call to the Facebook Graph API to publish a link post
 * to the configured Page feed.
 */
async function postToFacebookPage({ message, link }) {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;

  if (!pageId || !token) {
    throw new Error('FB_PAGE_ID / FB_PAGE_TOKEN not configured');
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;

  const { data } = await axios.post(url, null, {
    params: {
      message,
      link,
      access_token: token,
    },
    timeout: 15000,
  });

  return data; // { id: "<page-post-id>" }
}

/**
 * Check settings + post to Facebook if auto-posting is enabled
 * for this content type ('fact' | 'news' | 'breaking').
 * Always writes a FacebookLog entry (success or failure) when attempted.
 */
async function maybeAutoPostToFacebook(post, type) {
  const settings = await Settings.getSettings();

  const enabled = settings.facebookAutoPost?.[type === 'fact' ? 'facts' : type];
  if (!enabled) return null;

  const message = buildMessage(post, type);
  const link = buildPostUrl(post);

  try {
    const result = await postToFacebookPage({ message, link });
    await FacebookLog.create({
      post: post._id,
      fbPostId: result.id || '',
      type,
      status: 'success',
      postedAt: new Date(),
    });
    return result;
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    await FacebookLog.create({
      post: post._id,
      type,
      status: 'failed',
      error: errMsg,
      postedAt: new Date(),
    });
    throw new Error(errMsg);
  }
}

/**
 * Force a manual Facebook post regardless of auto-post settings
 * (used by the admin "Manual post to Facebook" button).
 */
async function manualPostToFacebook(post) {
  const message = buildMessage(post, post.source === 'blogger' ? 'fact' : 'news');
  const link = buildPostUrl(post);

  try {
    const result = await postToFacebookPage({ message, link });
    await FacebookLog.create({
      post: post._id,
      fbPostId: result.id || '',
      type: 'manual',
      status: 'success',
      postedAt: new Date(),
    });
    return result;
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    await FacebookLog.create({
      post: post._id,
      type: 'manual',
      status: 'failed',
      error: errMsg,
      postedAt: new Date(),
    });
    throw new Error(errMsg);
  }
}

module.exports = { maybeAutoPostToFacebook, manualPostToFacebook, postToFacebookPage };
