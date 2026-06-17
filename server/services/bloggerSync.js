const axios = require('axios');
const Post = require('../models/Post');
const Settings = require('../models/Settings');
const { resolveBloggerCategory } = require('../utils/categoryMap');
const { slugWithSuffix } = require('../utils/slugify');
const { maybeAutoPostToFacebook } = require('./facebookPoster');

/**
 * Extract the first <img src="..."> from an HTML blob.
 */
function extractFirstImage(html = '') {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

/**
 * Strip HTML tags to produce a plain-text excerpt.
 */
function htmlToExcerpt(html = '', maxLen = 200) {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

/**
 * Find the "alternate" (HTML) link for a Blogger entry.
 */
function getAlternateLink(entry) {
  const links = entry.link || [];
  const alt = links.find((l) => l.rel === 'alternate');
  return alt ? alt.href : '';
}

/**
 * Normalize a single Blogger GData entry into the shape we store.
 */
function normalizeEntry(entry, categoryMapRules) {
  const externalId = entry.id?.$t || '';
  const title = entry.title?.$t || 'Untitled';
  const content = entry.content?.$t || '';
  const publishedAt = entry.published?.$t ? new Date(entry.published.$t) : new Date();
  const updatedAt = entry.updated?.$t ? new Date(entry.updated.$t) : publishedAt;

  const labels = (entry.category || []).map((c) => c.term).filter(Boolean);

  // Prefer a large in-content image over Blogger's tiny thumbnail
  const contentImage = extractFirstImage(content);
  const thumbnail = entry.media$thumbnail?.url || '';
  // Blogger thumbnails often end in /s72-c/ - bump to a larger size if used as fallback
  const image = contentImage || thumbnail.replace(/\/s\d+(-c)?\//, '/s1200/');

  const category = resolveBloggerCategory(labels, categoryMapRules);

  return {
    externalId,
    title,
    content,
    excerpt: htmlToExcerpt(content),
    image,
    labels,
    category,
    publishedAt,
    bloggerUpdatedAt: updatedAt,
    sourceUrl: getAlternateLink(entry),
  };
}

/**
 * Sync posts from the Blogger feed:
 *  - Insert new posts as "Our Post" (source = blogger)
 *  - Update existing posts if they were edited on Blogger (updated timestamp changed)
 *  - Skip unchanged duplicates
 *
 * Returns a summary object: { fetched, created, updated, skipped }
 */
async function syncBloggerPosts() {
  const feedUrl = process.env.BLOGGER_FEED;
  if (!feedUrl) {
    throw new Error('BLOGGER_FEED is not configured');
  }

  const settings = await Settings.getSettings();

  // Request a generous batch and ask for full content
  const separator = feedUrl.includes('?') ? '&' : '?';
  const url = `${feedUrl}${separator}max-results=50`;

  const { data } = await axios.get(url, { timeout: 20000 });
  const entries = data?.feed?.entry || [];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    const normalized = normalizeEntry(entry, settings.bloggerCategoryMap);
    if (!normalized.externalId) {
      skipped += 1;
      continue;
    }

    const existing = await Post.findOne({ externalId: normalized.externalId });

    if (!existing) {
      const slug = slugWithSuffix(normalized.title, normalized.externalId);

      const post = await Post.create({
        title: normalized.title,
        slug,
        content: normalized.content,
        excerpt: normalized.excerpt,
        image: normalized.image,
        source: 'blogger',
        sourceName: 'Our Post',
        sourceUrl: normalized.sourceUrl,
        externalId: normalized.externalId,
        category: normalized.category,
        labels: normalized.labels,
        publishedAt: normalized.publishedAt,
        bloggerUpdatedAt: normalized.bloggerUpdatedAt,
        seo: {
          metaTitle: normalized.title,
          metaDescription: normalized.excerpt,
          ogImage: normalized.image,
        },
      });

      created += 1;

      // Fire-and-forget Facebook auto-post for newly synced facts
      maybeAutoPostToFacebook(post, 'fact').catch((err) =>
        console.error('[FB] auto-post (fact) failed:', err.message)
      );
      continue;
    }

    // Detect edits on the Blogger side via the "updated" timestamp
    const existingUpdated = existing.bloggerUpdatedAt ? existing.bloggerUpdatedAt.getTime() : 0;
    const incomingUpdated = normalized.bloggerUpdatedAt.getTime();

    if (incomingUpdated > existingUpdated) {
      existing.title = normalized.title;
      existing.content = normalized.content;
      existing.excerpt = normalized.excerpt;
      existing.image = normalized.image || existing.image;
      existing.category = normalized.category;
      existing.labels = normalized.labels;
      existing.bloggerUpdatedAt = normalized.bloggerUpdatedAt;
      existing.seo.metaTitle = existing.seo.metaTitle || normalized.title;
      existing.seo.metaDescription = normalized.excerpt;
      await existing.save();
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  settings.lastBloggerSync = new Date();
  settings.lastBloggerSyncStatus = 'success';
  settings.lastBloggerSyncError = '';
  settings.bloggerPostsSynced += created;
  await settings.save();

  return { fetched: entries.length, created, updated, skipped };
}

module.exports = { syncBloggerPosts };
