/**
 * Master list of site categories shown across the site
 * (category pages, filters, admin toggles, etc.)
 */
const SITE_CATEGORIES = [
  'World',
  'Technology',
  'Science',
  'Health',
  'Sports',
  'Entertainment',
  'Space',
  'Animals',
  'General',
];

/**
 * NewsAPI top-headlines category -> site category.
 * NewsAPI free-tier categories: business, entertainment, general,
 * health, science, sports, technology
 */
const NEWSAPI_CATEGORY_MAP = {
  general: 'World',
  technology: 'Technology',
  science: 'Science',
  health: 'Health',
  sports: 'Sports',
  entertainment: 'Entertainment',
  business: 'World',
};

/**
 * Default Blogger label -> site category mapping.
 * Matching is case-insensitive and checks if the label CONTAINS the key.
 * Admins can extend/override this via Settings.bloggerCategoryMap.
 * Order matters: first match wins.
 */
const DEFAULT_BLOGGER_CATEGORY_MAP = [
  { match: 'space', category: 'Space' },
  { match: 'astronomy', category: 'Space' },
  { match: 'animal', category: 'Animals' },
  { match: 'wildlife', category: 'Animals' },
  { match: 'tech', category: 'Technology' },
  { match: 'science', category: 'Science' },
  { match: 'health', category: 'Health' },
  { match: 'medic', category: 'Health' },
  { match: 'sport', category: 'Sports' },
  { match: 'entertain', category: 'Entertainment' },
  { match: 'movie', category: 'Entertainment' },
  { match: 'world', category: 'World' },
  { match: 'news', category: 'World' },
];

/**
 * Resolve a Blogger post's labels into a single site category,
 * using the configured map (falls back to defaults), then 'General'.
 */
function resolveBloggerCategory(labels = [], customMap = null) {
  const map = customMap && customMap.length ? customMap : DEFAULT_BLOGGER_CATEGORY_MAP;
  const lowerLabels = labels.map((l) => String(l).toLowerCase());

  for (const rule of map) {
    const key = rule.match.toLowerCase();
    if (lowerLabels.some((label) => label.includes(key))) {
      return rule.category;
    }
  }
  return 'General';
}

/**
 * Resolve a NewsAPI category string into a site category.
 */
function resolveNewsApiCategory(newsApiCategory) {
  return NEWSAPI_CATEGORY_MAP[newsApiCategory] || 'World';
}

module.exports = {
  SITE_CATEGORIES,
  NEWSAPI_CATEGORY_MAP,
  DEFAULT_BLOGGER_CATEGORY_MAP,
  resolveBloggerCategory,
  resolveNewsApiCategory,
};
