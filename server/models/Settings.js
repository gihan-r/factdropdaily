const mongoose = require('mongoose');
const { Schema } = mongoose;

const adSlotSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    code: { type: String, default: '' }, // raw AdSense <script>/<ins> snippet
  },
  { _id: false }
);

const bloggerMapRuleSchema = new Schema(
  {
    match: String, // substring to match against a label (case-insensitive)
    category: String, // site category to assign
  },
  { _id: false }
);

const settingsSchema = new Schema(
  {
    // Singleton lookup key - always 'global'
    key: { type: String, default: 'global', unique: true },

    // --- Blogger sync ---
    bloggerCategoryMap: { type: [bloggerMapRuleSchema], default: [] },
    lastBloggerSync: { type: Date, default: null },
    lastBloggerSyncStatus: { type: String, default: 'never' }, // success | error | never
    lastBloggerSyncError: { type: String, default: '' },
    bloggerPostsSynced: { type: Number, default: 0 },

    // --- NewsAPI sync ---
    newsApiCategories: {
      type: Map,
      of: Boolean,
      default: () => ({
        general: true,
        technology: true,
        science: true,
        health: true,
        sports: true,
        entertainment: true,
      }),
    },
    blacklistedSources: { type: [String], default: [] },
    lastNewsApiFetch: { type: Date, default: null },
    lastNewsApiStatus: { type: String, default: 'never' },
    lastNewsApiError: { type: String, default: '' },
    newsApiUsage: {
      date: { type: String, default: '' }, // YYYY-MM-DD
      count: { type: Number, default: 0 },
    },

    // --- Breaking news ---
    breakingTickerEnabled: { type: Boolean, default: true },
    autoBreakingDetectionEnabled: { type: Boolean, default: true },
    breakingDefaultDurationMinutes: { type: Number, default: 180 },

    // --- Facebook auto-posting ---
    facebookAutoPost: {
      facts: { type: Boolean, default: true },
      news: { type: Boolean, default: false },
      breaking: { type: Boolean, default: true },
    },

    // --- AdSense slots ---
    adSlots: {
      headerLeaderboard: { type: adSlotSchema, default: () => ({}) },
      afterHero: { type: adSlotSchema, default: () => ({}) },
      inArticle: { type: adSlotSchema, default: () => ({}) },
      sidebarTop: { type: adSlotSchema, default: () => ({}) },
      sidebarBottom: { type: adSlotSchema, default: () => ({}) },
      betweenGrid: { type: adSlotSchema, default: () => ({}) },
      footerBanner: { type: adSlotSchema, default: () => ({}) },
      mobileSticky: { type: adSlotSchema, default: () => ({}) },
    },

    // --- SEO ---
    sitemapLastGenerated: { type: Date, default: null },
  },
  { timestamps: true }
);

settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  } else {
    // If adSlots is unpopulated (e.g. settings schema updated on existing db)
    let modified = false;
    if (!settings.adSlots || !settings.adSlots.headerLeaderboard) {
      settings.adSlots = {
        headerLeaderboard: { enabled: false, code: '' },
        afterHero: { enabled: false, code: '' },
        inArticle: { enabled: false, code: '' },
        sidebarTop: { enabled: false, code: '' },
        sidebarBottom: { enabled: false, code: '' },
        betweenGrid: { enabled: false, code: '' },
        footerBanner: { enabled: false, code: '' },
        mobileSticky: { enabled: false, code: '' },
      };
      modified = true;
    }
    if (modified) {
      await settings.save();
    }
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
