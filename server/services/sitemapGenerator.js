const fs = require('fs');
const path = require('path');
const Post = require('../models/Post');
const Settings = require('../models/Settings');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function escapeXml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate the standard sitemap.xml covering all active posts + static pages,
 * and a Google News sitemap (news-sitemap.xml) covering articles published
 * in the last 48 hours (Google News only accepts recent content).
 *
 * Both files are written into /public so they're served as static files
 * at /sitemap.xml and /news-sitemap.xml.
 */
async function generateSitemaps() {
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');

  const staticPages = [
    '',
    '/facts',
    '/trending',
    '/breaking',
    '/search',
    '/about',
    '/contact',
    '/privacy',
    '/category/world',
    '/category/technology',
    '/category/science',
    '/category/health',
    '/category/space',
    '/category/animals',
  ];

  const allPosts = await Post.find({ status: 'active' })
    .select('slug source updatedAt publishedAt')
    .sort({ publishedAt: -1 })
    .limit(5000);

  // --- sitemap.xml ---
  const urlEntries = [
    ...staticPages.map(
      (p) => `  <url>\n    <loc>${siteUrl}${p}</loc>\n  </url>`
    ),
    ...allPosts.map((post) => {
      const pathPrefix = post.source === 'blogger' ? '/article' : '/news';
      const lastmod = (post.updatedAt || post.publishedAt).toISOString();
      return `  <url>\n    <loc>${siteUrl}${pathPrefix}/${escapeXml(
        post.slug
      )}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    }),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join(
    '\n'
  )}\n</urlset>\n`;

  // --- news-sitemap.xml (last 48h, Blogger "facts" content only) ---
  const newsCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentPosts = await Post.find({
    status: 'active',
    source: 'blogger',
    publishedAt: { $gte: newsCutoff },
  })
    .select('slug title publishedAt')
    .sort({ publishedAt: -1 })
    .limit(1000);

  const newsEntries = recentPosts.map((post) => {
    return `  <url>\n    <loc>${siteUrl}/article/${escapeXml(post.slug)}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>FactDropDaily</news:name>\n        <news:language>en</news:language>\n      </news:publication>\n      <news:publication_date>${post.publishedAt.toISOString()}</news:publication_date>\n      <news:title>${escapeXml(
      post.title
    )}</news:title>\n    </news:news>\n  </url>`;
  });

  const newsSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${newsEntries.join(
    '\n'
  )}\n</urlset>\n`;

  // Write to /public so Express static serves them directly
  try {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml);
    fs.writeFileSync(path.join(PUBLIC_DIR, 'news-sitemap.xml'), newsSitemapXml);
  } catch (err) {
    console.warn('[Sitemap] Could not write sitemap files:', err.message);
  }

  const settings = await Settings.getSettings();
  settings.sitemapLastGenerated = new Date();
  await settings.save();

  return {
    urls: urlEntries.length,
    newsUrls: newsEntries.length,
    generatedAt: settings.sitemapLastGenerated,
  };
}

module.exports = { generateSitemaps };
