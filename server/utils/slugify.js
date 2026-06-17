/**
 * Convert a title string into a URL-safe slug.
 * "World's Oldest Tree Discovered!" -> "worlds-oldest-tree-discovered"
 */
function slugify(text = '') {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // strip special chars
    .replace(/[\s_]+/g, '-') // spaces/underscores -> dash
    .replace(/-+/g, '-') // collapse multiple dashes
    .replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
}

/**
 * Generate a slug guaranteed to be short + append a short unique suffix
 * derived from an external id, so two posts with the same title never collide.
 */
function slugWithSuffix(text, suffixSource) {
  const base = slugify(text).slice(0, 70) || 'post';
  const crypto = require('crypto');
  const suffix = crypto
    .createHash('md5')
    .update(String(suffixSource))
    .digest('hex')
    .slice(0, 6);
  return `${base}-${suffix}`;
}

module.exports = { slugify, slugWithSuffix };
