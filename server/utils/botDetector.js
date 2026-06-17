/**
 * Lightweight Bot & Crawler Detection Utility
 */
const BOT_PATTERNS = [
  'bot',
  'spider',
  'crawler',
  'lighthouse',
  'headless',
  'googlebot',
  'bingbot',
  'yandexbot',
  'duckduckbot',
  'baiduspider',
  'sogou',
  'exabot',
  'facebot',
  'facebookexternalhit',
  'ia_archiver',
  'slurp',
  'curl',
  'wget',
  'python',
  'axios',
  'got',
  'node-fetch',
  'postman',
  'scrape',
  'selenium',
  'playwright',
  'puppeteer'
];

function detectBot(userAgent = '') {
  const ua = userAgent.toLowerCase();
  
  if (!ua) {
    return { isBot: true, reason: 'Empty User-Agent header' };
  }

  // 1. Match common bot signatures
  for (const pattern of BOT_PATTERNS) {
    if (ua.includes(pattern)) {
      return { isBot: true, reason: `Matches pattern: "${pattern}"` };
    }
  }

  return { isBot: false, reason: '' };
}

module.exports = { detectBot };
