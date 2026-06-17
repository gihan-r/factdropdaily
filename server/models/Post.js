const mongoose = require('mongoose');
const { Schema } = mongoose;

const seoSchema = new Schema(
  {
    metaTitle: String,
    metaDescription: String,
    ogImage: String,
    canonicalUrl: String,
  },
  { _id: false }
);

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },

    // Full HTML body. Populated for Blogger ("Our Post") content only.
    // For NewsAPI content this stays empty - we link out to the source.
    content: { type: String, default: '' },

    // Short summary shown on cards / external news preview page
    excerpt: { type: String, default: '' },

    image: { type: String, default: '' },

    // Where this post came from
    source: { type: String, enum: ['blogger', 'newsapi'], required: true, index: true },

    // Display badge text: "Our Post" or the news outlet name (BBC, CNN, Reuters...)
    sourceName: { type: String, default: '' },

    // For NewsAPI posts: link to the original article ("Read Full Article")
    sourceUrl: { type: String, default: '' },

    // Unique identifier from the origin system, used for de-duplication:
    //  - Blogger: the entry's GData id (tag:blogger.com,...)
    //  - NewsAPI: md5 hash of the article URL
    externalId: { type: String, required: true, unique: true, index: true },

    category: { type: String, required: true, index: true },

    // Raw Blogger labels (used for re-mapping if category rules change)
    labels: { type: [String], default: [] },

    isBreaking: { type: Boolean, default: false, index: true },
    breakingExpiresAt: { type: Date, default: null },

    featured: { type: Boolean, default: false },

    views: { type: Number, default: 0 },
    viewsToday: { type: Number, default: 0 },
    trendingScore: { type: Number, default: 0, index: true },

    publishedAt: { type: Date, required: true, index: true },

    // Used to detect edits on the Blogger side and re-sync content
    bloggerUpdatedAt: { type: Date, default: null },

    seo: { type: seoSchema, default: () => ({}) },

    status: { type: String, enum: ['active', 'hidden'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Compound index used heavily by the homepage mixing query
postSchema.index({ source: 1, status: 1, publishedAt: -1 });
postSchema.index({ category: 1, status: 1, publishedAt: -1 });
postSchema.index({ title: 'text', excerpt: 'text', content: 'text' });

module.exports = mongoose.model('Post', postSchema);
