# FactDropDaily

Automated daily news & facts portal — Blogger RSS facts mixed with live world news from NewsAPI.org.

> **Status: Phase 1 of 4 — Backend Core & Auto-Content Engine**
> This phase delivers the full automated content pipeline, database models,
> cron jobs, and REST API. The public frontend pages, admin dashboard UI,
> Docker/Render deployment files, and full setup README will follow in the
> next phases. The placeholder page at `/` confirms the API is live.

---

## What's implemented in this phase

### Auto-content engine (core feature)
- **Blogger sync** (`services/bloggerSync.js`) — pulls from your Blogger GData
  feed, extracts title/content/image/labels/date, maps labels → site
  categories, de-dupes by Blogger entry ID, and **re-syncs edited posts**
  automatically by comparing `updated` timestamps.
- **NewsAPI sync** (`services/newsApiSync.js`) — fetches top headlines for
  World/Tech/Science/Health/Sports/Entertainment, de-dupes by URL hash,
  respects a source blacklist, tracks the **100/day free-tier quota**, and
  flags very fresh top stories as **breaking news** automatically.
- **node-cron scheduler** (`cron/scheduler.js`) —
  - every 30 min: Blogger sync
  - every 30 min: NewsAPI sync
  - every 5 min: expire breaking-news flags
  - every 1 hour: recompute trending scores + regenerate sitemaps
  - every 24h: cleanup news older than 7 days, reset daily view counters

### REST API (`routes/posts.js`)
- `GET /api/posts` — homepage feed: breaking news first, then a **3 news : 1
  fact** mixed feed (pagination supported)
- `GET /api/news` — NewsAPI ("World News") posts only
- `GET /api/facts` — Blogger ("Our Post") facts archive
- `GET /api/trending` — top posts by hot-ranking score
- `GET /api/breaking` — currently active breaking news
- `GET /api/categories/:name` — World, Technology, Science, Health, Sports,
  Entertainment, Space, Animals, General
- `GET /api/search?q=` — full-text search across both content sources
- `GET /api/post/:slug` — single post detail (increments view counters)
- `POST /api/newsletter/subscribe` — sidebar signup form
- `GET /api/site/config` — public ad-slot + ticker config for the frontend

### Admin API (`routes/admin.js`, JWT-protected)
Covers every section from the spec: dashboard stats, Blogger sync manager
(manual sync + category map editor), NewsAPI manager (manual fetch, category
toggles, source blacklist, usage counter), breaking-news manager, content
manager (edit/feature/delete posts), Facebook manager (settings + post
history + manual post), newsletter manager (subscriber list + send digest),
SEO manager (sitemap status/regenerate), and AdSense slot configuration.

Login: `POST /api/auth/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` →
returns a JWT (12h) used as `Authorization: Bearer <token>` on all
`/api/admin/*` routes.

### Facebook auto-posting (`services/facebookPoster.js`)
Posts to your Page's feed via the Graph API when a new fact syncs, breaking
news is detected, or (optionally) new world news arrives — each toggle is
independently configurable from the admin panel. Every attempt is logged to
`FacebookLog` for the admin history view.

### Image caching (`utils/imageProxy.js`)
NewsAPI article images are uploaded to Cloudinary (if `CLOUDINARY_URL` is
set) so the site never hotlinks third-party images. Falls back to the
original URL if Cloudinary isn't configured.

### SEO (`services/sitemapGenerator.js`)
Generates `/sitemap.xml` (all active posts + static pages) and
`/news-sitemap.xml` (Blogger posts from the last 48h, Google News format)
every hour and on-demand from the admin panel.

---

## Project structure

```
factdropdaily/
├── public/
│   └── index.html          # placeholder landing page (full frontend coming next)
└── server/
    ├── server.js            # Express app entry point
    ├── config/db.js          # MongoDB connection
    ├── models/                # Post, Settings, Subscriber, FacebookLog
    ├── services/              # bloggerSync, newsApiSync, facebookPoster,
    │                          # mailer, cleanup, trending, sitemapGenerator
    ├── cron/scheduler.js       # node-cron job registrations
    ├── middleware/             # auth (JWT), rate limiters
    ├── routes/                 # posts, auth, admin, newsletter, site
    ├── utils/                  # slugify, categoryMap, imageProxy
    ├── package.json
    └── .env.example
```

---

## Running locally

```bash
cd server
cp .env.example .env   # then fill in your real keys
npm install
npm start
```

The server will fail fast with a clear error if `MONGODB_URI` is missing —
all other integrations (NewsAPI, Cloudinary, Facebook, Gmail) degrade
gracefully or are only called when their cron job / route actually runs.

Once running:
- `GET /api/health` → `{ "status": "ok" }`
- `GET /api/posts` → mixed homepage feed (empty until the first sync runs)
- `POST /api/admin/blogger/sync` (with admin JWT) → trigger a manual Blogger
  sync immediately instead of waiting 30 minutes

---

## Roadmap (next phases)

1. **Frontend pages** — homepage (ticker, hero, 3-column grid, fact-of-the-day,
   sidebar), article page, external-news page, category pages, search,
   trending, facts archive, breaking news, About/Contact/Privacy — orange
   `#FF6B35` / navy `#1a1a2e` design with dark/light toggle, lazy-loaded
   images, AdSense slot placeholders.
2. **Admin panel UI** — dashboard + the 8 manager screens wired to the API
   above.
3. **Deployment** — `Dockerfile`, `render.yaml`, and the full step-by-step
   README (NewsAPI key, Facebook Graph token, MongoDB Atlas, Render deploy).
