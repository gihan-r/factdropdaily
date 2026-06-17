/**
 * FactDropDaily SPA Core JavaScript
 */

const API_BASE = '/api';

// Application State
const state = {
  currentPath: window.location.pathname,
  theme: localStorage.getItem('theme') || 'dark',
  config: null,
  trendingPosts: [],
  breakingPosts: [],
  adminToken: localStorage.getItem('admin_token') || null,
  activeAdminTab: 'dashboard',
  // Keep track of search results pagination or general feed pages
  homePage: 1,
  factsPage: 1,
  newsPage: 1,
  categoryPage: 1,
  searchPage: 1,
};

let heartbeatInterval = null;

function startAdminHeartbeat() {
  if (heartbeatInterval) return;
  // Ping immediately first
  pingHeartbeat();
  heartbeatInterval = setInterval(pingHeartbeat, 10000); // 10 seconds
}

function stopAdminHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function pingHeartbeat() {
  if (!state.adminToken) {
    stopAdminHeartbeat();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/heartbeat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.adminToken}`
      }
    });
    if (!res.ok) {
      // Session expired or taken over
      stopAdminHeartbeat();
      localStorage.removeItem('admin_token');
      state.adminToken = null;
      alert('Your administrator session has expired or was terminated.');
      navigate('/admin');
    }
  } catch (err) {
    console.warn('Heartbeat ping failed:', err);
  }
}

function clearSessionOnServer() {
  if (!state.adminToken) return;
  // Use sendBeacon for reliable delivery during page unload/navigation
  if (navigator.sendBeacon) {
    navigator.sendBeacon(`${API_BASE}/auth/logout`);
  } else {
    // Fallback synchronous XHR request
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/auth/logout`, false); // sync
    xhr.send();
  }
}

// Elements cache
const els = {
  appView: document.getElementById('app-view-container'),
  themeToggle: document.getElementById('theme-toggle-btn'),
  searchForm: document.getElementById('header-search-form'),
  searchInput: document.getElementById('search-input-field'),
  mobileToggle: document.getElementById('mobile-menu-toggle'),
  nav: document.getElementById('main-navigation'),
  ticker: document.getElementById('breaking-news-ticker'),
  tickerItems: document.getElementById('ticker-items-container'),
  trendingSidebar: document.getElementById('trending-posts-sidebar'),
  newsletterForm: document.getElementById('newsletter-form-element'),
  newsletterEmail: document.getElementById('newsletter-email-field'),
  newsletterMsg: document.getElementById('newsletter-msg-box'),
  editModal: document.getElementById('admin-edit-modal-backdrop'),
  editForm: document.getElementById('admin-post-edit-form'),
  editTitle: document.getElementById('edit-post-title'),
  editContent: document.getElementById('edit-post-content'),
  editExcerpt: document.getElementById('edit-post-excerpt'),
  editImage: document.getElementById('edit-post-image'),
  editCategory: document.getElementById('edit-post-category'),
  editStatus: document.getElementById('edit-post-status'),
  editId: document.getElementById('edit-post-id'),
  modalTitle: document.getElementById('modal-title-text'),
  modalClose: document.getElementById('modal-close-btn'),
  modalCancel: document.getElementById('modal-cancel-btn'),
};

/* ============================================================
 * HELPER UTILITIES
 * ========================================================== */

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateText(text, length) {
  if (!text) return '';
  const stripped = text.replace(/<[^>]*>/g, '');
  if (stripped.length <= length) return stripped;
  return stripped.substring(0, length) + '...';
}

function updateSeoMeta(title, description = '') {
  document.title = title ? `${title} — FactDropDaily` : 'FactDropDaily — Premium Daily News & Facts Portal';
  
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) {
    descMeta.setAttribute('content', description || 'Get your daily dose of amazing facts mixed with top world news.');
  }

  // Update OG tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title || 'FactDropDaily');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', description || 'Curated facts and news.');
}

// Inject JSON-LD structured schema dynamically
function injectJsonLd(post) {
  // Remove existing dynamic script tag
  const existing = document.getElementById('dynamic-jsonld');
  if (existing) existing.remove();

  if (!post) return;

  const script = document.createElement('script');
  script.id = 'dynamic-jsonld';
  script.type = 'application/ld+json';

  const isBlog = post.source === 'blogger';
  const schema = {
    "@context": "https://schema.org",
    "@type": isBlog ? "BlogPosting" : "NewsArticle",
    "headline": post.title,
    "description": post.excerpt || post.title,
    "image": post.image || '/logo.png',
    "datePublished": post.publishedAt,
    "dateModified": post.bloggerUpdatedAt || post.publishedAt,
    "author": {
      "@type": "Organization",
      "name": isBlog ? "FactDropDaily Team" : (post.sourceName || "World News")
    },
    "publisher": {
      "@type": "Organization",
      "name": "FactDropDaily",
      "logo": {
        "@type": "ImageObject",
        "url": window.location.origin + "/logo.png"
      }
    }
  };

  script.text = JSON.stringify(schema);
  document.head.appendChild(script);
}

/* ============================================================
 * API SERVICES
 * ========================================================== */

async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) {
      if (res.status === 401 && endpoint.startsWith('/admin')) {
        // Token expired/invalid, clear session
        localStorage.removeItem('admin_token');
        state.adminToken = null;
        navigate('/admin');
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed with status ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err);
    throw err;
  }
}

// Authenticated Admin requests
function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${state.adminToken}`,
  };
}

/* ============================================================
 * CORE INITIALIZATION
 * ========================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  setupTheme();
  setupEventListeners();
  await loadSiteConfig();
  await loadBreakingTicker();
  await loadSidebarTrending();
  
  // Start router
  handleRoute(window.location.pathname);
});

function setupTheme() {
  const icon = els.themeToggle.querySelector('i');
  
  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('theme', themeName);
    state.theme = themeName;
    if (themeName === 'light') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  }

  // Set initial icon
  applyTheme(state.theme);

  els.themeToggle.addEventListener('click', () => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
}

function setupEventListeners() {
  // Mobile Hamburger Toggle
  els.mobileToggle.addEventListener('click', () => {
    els.nav.classList.toggle('open');
    const icon = els.mobileToggle.querySelector('i');
    if (els.nav.classList.contains('open')) {
      icon.className = 'fa-solid fa-xmark';
    } else {
      icon.className = 'fa-solid fa-bars';
    }
  });

  // Intercept Navigation Links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    
    const href = link.getAttribute('href');
    // If it's a relative path, route it internally
    if (href && href.startsWith('/') && !link.getAttribute('target')) {
      e.preventDefault();
      els.nav.classList.remove('open');
      const icon = els.mobileToggle.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-bars';
      
      // If we are currently on the admin panel and navigation is leaving it
      if (state.currentPath.startsWith('/admin') && !href.startsWith('/admin')) {
        clearSessionOnServer();
        localStorage.removeItem('admin_token');
        state.adminToken = null;
      }
      
      // Track clicks to articles/news details
      if (href.startsWith('/article/') || href.startsWith('/news/')) {
        const targetSlug = href.split('/').pop();
        fetch(`${API_BASE}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: href, type: 'click', targetSlug })
        }).catch(err => console.warn('Tracking click failed:', err));
      }
      
      navigate(href);
    }
  });

  // Release session lease if tab is closed or window is navigated away
  window.addEventListener('pagehide', () => {
    if (state.currentPath.startsWith('/admin')) {
      clearSessionOnServer();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.currentPath.startsWith('/admin')) {
      clearSessionOnServer();
    }
  });

  // Search Submit
  els.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = els.searchInput.value.trim();
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      els.searchInput.value = '';
    }
  });

  // Sidebar Newsletter submit
  els.newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = els.newsletterEmail.value.trim();
    if (!email) return;

    try {
      const btn = els.newsletterForm.querySelector('button');
      btn.disabled = true;
      btn.innerText = 'Subscribing...';
      
      const res = await fetch(`${API_BASE}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      btn.disabled = false;
      btn.innerText = 'Subscribe';

      if (res.ok) {
        els.newsletterMsg.innerText = data.message || 'Subscribed successfully!';
        els.newsletterMsg.className = 'newsletter-msg success';
        els.newsletterEmail.value = '';
      } else {
        els.newsletterMsg.innerText = data.error || 'Subscription failed.';
        els.newsletterMsg.className = 'newsletter-msg error';
      }
    } catch (err) {
      els.newsletterMsg.innerText = 'Network connection error.';
      els.newsletterMsg.className = 'newsletter-msg error';
    }

    setTimeout(() => {
      els.newsletterMsg.innerText = '';
      els.newsletterMsg.className = 'newsletter-msg';
    }, 5000);
  });

  // Edit Modal Cancel Events
  const closeModal = () => els.editModal.classList.remove('open');
  els.modalClose.addEventListener('click', closeModal);
  els.modalCancel.addEventListener('click', closeModal);
  els.editModal.addEventListener('click', (e) => {
    if (e.target === els.editModal) closeModal();
  });

  // Route back/forward navigation
  window.addEventListener('popstate', () => {
    handleRoute(window.location.pathname);
  });
}

// Router trigger helper
function navigate(path) {
  window.history.pushState({}, '', path);
  handleRoute(path);
}

async function loadSiteConfig() {
  try {
    const config = await apiFetch('/site/config');
    state.config = config;
    renderAdSenseSlots();
  } catch (err) {
    console.warn('Could not load site configuration.', err);
  }
}

async function loadBreakingTicker() {
  try {
    const data = await apiFetch('/breaking');
    if (data.posts && data.posts.length > 0 && state.config?.breakingTickerEnabled !== false) {
      state.breakingPosts = data.posts;
      els.tickerItems.innerHTML = data.posts.map(post => `
        <a href="${post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`}" class="ticker-item">
          <span class="ticker-dot"><i class="fa-solid fa-circle"></i></span>
          ${post.title}
        </a>
      `).join(' ');
      els.ticker.style.display = 'flex';
    } else {
      els.ticker.style.display = 'none';
    }
  } catch (err) {
    els.ticker.style.display = 'none';
  }
}

async function loadSidebarTrending() {
  try {
    const data = await apiFetch('/trending?limit=5');
    state.trendingPosts = data.posts || [];
    if (state.trendingPosts.length > 0) {
      els.trendingSidebar.innerHTML = state.trendingPosts.map((post, idx) => `
        <div class="trending-item">
          <div class="trending-num">0${idx + 1}</div>
          <div class="trending-item-content">
            <h4 class="trending-item-title">
              <a href="${post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`}">${post.title}</a>
            </h4>
            <div class="trending-meta">${formatDate(post.publishedAt)} · ${post.badge}</div>
          </div>
        </div>
      `).join('');
    } else {
      els.trendingSidebar.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">No trending stories today.</p>';
    }
  } catch (err) {
    els.trendingSidebar.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted);">Could not fetch trending posts.</p>';
  }
}

function renderAdSenseSlots() {
  if (!state.config || !state.config.adSlots) return;
  const slots = state.config.adSlots;

  document.querySelectorAll('.ad-slot-card').forEach(slotDiv => {
    const slotName = slotDiv.getAttribute('data-slot');
    const conf = slots[slotName];
    if (conf && conf.enabled && conf.code) {
      slotDiv.innerHTML = conf.code;
      slotDiv.style.border = 'none';
      slotDiv.style.background = 'none';
      slotDiv.style.display = ''; // Show
    } else {
      // Hide slot completely if not enabled or empty code
      slotDiv.style.display = 'none';
    }
  });

  // Sticky banner logic
  const stickySlot = document.getElementById('ad-mobile-sticky-bottom');
  if (stickySlot) {
    if (window.innerWidth <= 768 && (slots.mobileSticky?.enabled || slots.mobileStickyBottom?.enabled)) {
      stickySlot.style.display = 'flex';
    } else {
      stickySlot.style.display = 'none';
    }
  }
}

function getAdDimensions(slotName) {
  switch(slotName) {
    case 'headerLeaderboard': return '728 x 90';
    case 'afterHero': return '970 x 90';
    case 'inArticle': return '336 x 280';
    case 'sidebarTop': return '300 x 250';
    case 'sidebarBottom': return '300 x 250';
    case 'betweenGrid': return '728 x 90';
    case 'footerBanner': return '728 x 90';
    case 'mobileSticky': return '320 x 50';
    case 'mobileStickyBottom': return '320 x 50';
    default: return '300 x 250';
  }
}

/* ============================================================
 * CLIENT ROUTER & VIEW RENDERING
 * ========================================================== */

function handleRoute(path) {
  state.currentPath = path;

  // Active header link indicator
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });

  // Sidebar visibility configuration
  // Hide sidebar on the full article details / previews, login and admin pages
  const isArticleOrAdmin = path.includes('/article/') || path.includes('/news/') || path.startsWith('/admin');
  if (isArticleOrAdmin) {
    document.getElementById('main-content-layout').style.gridTemplateColumns = '1fr';
    document.getElementById('sidebar-layout-container').style.display = 'none';
  } else {
    document.getElementById('main-content-layout').style.gridTemplateColumns = '';
    document.getElementById('sidebar-layout-container').style.display = 'flex';
  }

  // Exact Routing Matches
  if (path === '/' || path === '') {
    renderHomeView();
  } else if (path === '/facts') {
    renderFactsArchiveView();
  } else if (path === '/trending') {
    renderTrendingView();
  } else if (path === '/breaking') {
    renderBreakingView();
  } else if (path.startsWith('/category/')) {
    const catName = path.split('/category/')[1];
    renderCategoryView(catName);
  } else if (path.startsWith('/search')) {
    const params = new URLSearchParams(window.location.search);
    renderSearchView(params.get('q'));
  } else if (path.startsWith('/article/')) {
    const slug = path.split('/article/')[1];
    renderArticleView(slug);
  } else if (path.startsWith('/news/')) {
    const slug = path.split('/news/')[1];
    renderNewsView(slug);
  } else if (path === '/admin') {
    renderAdminView();
  } else if (path === '/about') {
    renderAboutView();
  } else if (path === '/contact') {
    renderContactView();
  } else if (path === '/privacy') {
    renderPrivacyView();
  } else {
    render404();
  }

  // Handle heartbeat management based on page
  if (path.startsWith('/admin') && state.adminToken) {
    startAdminHeartbeat();
  } else {
    // If they left admin, stop heartbeat and logout
    stopAdminHeartbeat();
    if (state.adminToken) {
      clearSessionOnServer();
      localStorage.removeItem('admin_token');
      state.adminToken = null;
    }
  }

  // Fire pageview traffic track ping (don't block UI rendering)
  if (!path.startsWith('/api')) {
    fetch(`${API_BASE}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'pageview' })
    }).catch(err => console.warn('Tracking pageview failed:', err));
  }

  // Scroll to top
  window.scrollTo(0, 0);
}

function renderLoading() {
  els.appView.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; min-height:400px;">
      <i class="fa-solid fa-spinner fa-spin fa-2xl" style="color:var(--orange);"></i>
    </div>
  `;
}

function renderError(message) {
  els.appView.innerHTML = `
    <div style="text-align:center; padding: 60px 20px;">
      <i class="fa-solid fa-triangle-exclamation fa-3xl" style="color:#e63946; margin-bottom:16px;"></i>
      <h2 style="margin-bottom:12px;">Something went wrong</h2>
      <p style="color:var(--text-muted); max-width:480px; margin:0 auto 24px auto;">${message}</p>
      <a href="/" class="cta-button" style="margin-top:0;">Back to Home</a>
    </div>
  `;
}

function render404() {
  updateSeoMeta('Page Not Found');
  els.appView.innerHTML = `
    <div style="text-align:center; padding: 80px 20px;">
      <h1 style="font-size: 5rem; color: var(--orange); margin-bottom: 8px;">404</h1>
      <h2 style="margin-bottom:16px;">Story Not Found</h2>
      <p style="color:var(--text-muted); max-width:480px; margin:0 auto 24px auto;">The article you are looking for has expired, was removed, or never existed.</p>
      <a href="/" class="cta-button" style="margin-top:0;">Back to Homepage</a>
    </div>
  `;
}

/* ============================================================
 * VIEW: HOME
 * ========================================================== */

async function renderHomeView() {
  updateSeoMeta('FactDropDaily — Mixed Blogger & Live World News');
  renderLoading();

  try {
    const data = await apiFetch(`/posts?page=${state.homePage}&limit=13`);
    let posts = data.posts || [];
    const totalPages = data.totalPages || 1;

    if (posts.length === 0) {
      els.appView.innerHTML = '<p style="text-align:center; padding: 48px;">No articles found. Start a Blogger/NewsAPI sync in the admin panel.</p>';
      return;
    }

    // Identify featured/hero item (first item if it has an image)
    const heroItem = posts.find(p => p.image);
    const gridItems = heroItem ? posts.filter(p => p._id !== heroItem._id) : posts;

    let html = '';

    // RENDER HERO
    if (heroItem) {
      const link = heroItem.source === 'blogger' ? `/article/${heroItem.slug}` : `/news/${heroItem.slug}`;
      html += `
        <section class="hero-section">
          <a href="${link}">
            <div class="hero-card" style="background-image: url('${heroItem.image}');">
              <div class="hero-overlay"></div>
              <div class="hero-content">
                <span class="badge-tag ${heroItem.source === 'blogger' ? '' : 'news'}">${heroItem.badge}</span>
                <h2 class="hero-title">${heroItem.title}</h2>
                <p class="hero-excerpt">${truncateText(heroItem.excerpt || heroItem.content, 180)}</p>
                <div class="post-meta">
                  <span><i class="fa-solid fa-calendar"></i> ${formatDate(heroItem.publishedAt)}</span>
                  <span><i class="fa-solid fa-eye"></i> ${heroItem.views || 0} views</span>
                  ${heroItem.sourceName ? `<span><i class="fa-solid fa-paper-plane"></i> ${heroItem.sourceName}</span>` : ''}
                </div>
              </div>
            </div>
          </a>
        </section>
      `;
    }

    // Dynamic AdSense Slot: after hero section (970x90)
    html += `
      <div id="ad-after-hero" class="ad-slot-card ad-hero-footer" data-slot="afterHero">
        <div class="ad-slot-label">Advertisement</div>
        <div class="ad-slot-size">After Hero Banner (970 x 90)</div>
      </div>
    `;

    // Highlight Box: Fact of the day (Latest Blogger post)
    const factOfDay = posts.find(p => p.source === 'blogger');
    if (factOfDay) {
      html += `
        <div class="fact-of-day-box">
          <div class="fact-title-row">
            <i class="fa-solid fa-lightbulb"></i> FACT OF THE DAY
          </div>
          <p class="fact-of-day-text">
            <strong>${factOfDay.title}</strong> — ${truncateText(factOfDay.content || factOfDay.excerpt, 220)}
            <a href="/article/${factOfDay.slug}">Read More</a>
          </p>
        </div>
      `;
    }

    // Grid Title
    html += `<h3 class="section-title">Latest Updates</h3>`;

    // GRID RENDER
    html += `<div class="news-grid">`;
    gridItems.forEach((post, index) => {
      // Intersperse an ad banner inside the grid rows (e.g. after index 6)
      if (index === 6) {
        html += `
          </div>
          <div id="ad-grid-middle" class="ad-slot-card ad-grid-middle" data-slot="betweenGrid" style="margin:24px 0;">
            <div class="ad-slot-label">Advertisement</div>
            <div class="ad-slot-size">Between Grid Rows (728 x 90)</div>
          </div>
          <div class="news-grid">
        `;
      }

      const cardLink = post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`;
      const borderClass = post.source === 'blogger' ? 'our-post' : '';

      html += `
        <article class="card-item ${borderClass}">
          <a href="${cardLink}">
            <div class="card-image-wrap">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3C/svg%3E" data-src="${post.image || '/logo.png'}" alt="${post.title}" class="card-image lazy-img" />
              <span class="badge-tag ${post.source === 'blogger' ? '' : 'news'}" style="position:absolute; top:12px; left:12px; margin-bottom:0;">${post.badge}</span>
            </div>
            <div class="card-body">
              <div class="card-category">${post.category || 'World'}</div>
              <h4 class="card-title">${post.title}</h4>
              <p class="card-excerpt">${truncateText(post.excerpt || post.content, 110)}</p>
              <div class="card-footer">
                <span><i class="fa-solid fa-clock"></i> ${formatDate(post.publishedAt)}</span>
                <span>${post.sourceName || 'FactDropDaily'}</span>
              </div>
            </div>
          </a>
        </article>
      `;
    });
    html += `</div>`;

    // --- Smart Pagination ---
    // Show a window of page numbers around current page
    const currentPage = state.homePage;
    const windowSize = 5; // how many page numbers to show at once
    const halfWindow = Math.floor(windowSize / 2);
    let startPage = Math.max(1, currentPage - halfWindow);
    let endPage = Math.min(totalPages, startPage + windowSize - 1);
    if (endPage - startPage + 1 < windowSize) {
      startPage = Math.max(1, endPage - windowSize + 1);
    }

    let pageButtons = '';
    if (startPage > 1) {
      pageButtons += `<button class="btn-secondary page-num-btn" data-page="1">1</button>`;
      if (startPage > 2) pageButtons += `<span style="color:var(--text-muted); padding:0 4px;">…</span>`;
    }
    for (let p = startPage; p <= endPage; p++) {
      const isActive = p === currentPage;
      pageButtons += `<button class="btn-secondary page-num-btn${isActive ? ' page-active' : ''}" data-page="${p}" ${isActive ? 'disabled' : ''}>${p}</button>`;
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pageButtons += `<span style="color:var(--text-muted); padding:0 4px;">…</span>`;
      pageButtons += `<button class="btn-secondary page-num-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    const isLastPage = currentPage >= totalPages;
    html += `
      <div class="pagination" style="gap:6px; flex-wrap:wrap;">
        <button class="btn-secondary" id="home-prev-btn" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>
        ${pageButtons}
        <button class="btn-secondary" id="home-next-btn" ${isLastPage ? 'disabled style="opacity:0.35; cursor:not-allowed;"' : ''}>Next →</button>
      </div>
      <p style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-top:8px;">
        Page ${currentPage} of ${totalPages}
      </p>
    `;

    els.appView.innerHTML = html;

    // Setup lazy loading & pagination listeners
    initializeLazyLoading();
    renderAdSenseSlots();

    document.getElementById('home-prev-btn').addEventListener('click', () => {
      if (state.homePage > 1) {
        state.homePage--;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        renderHomeView();
      }
    });
    document.getElementById('home-next-btn').addEventListener('click', () => {
      if (state.homePage < totalPages) {
        state.homePage++;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        renderHomeView();
      }
    });
    document.querySelectorAll('.page-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-page'), 10);
        if (!isNaN(p) && p !== state.homePage) {
          state.homePage = p;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          renderHomeView();
        }
      });
    });

  } catch (err) {
    renderError(err.message);
  }
}

function initializeLazyLoading() {
  const images = document.querySelectorAll('.lazy-img');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.getAttribute('data-src');
          img.classList.remove('lazy-img');
          obs.unobserve(img);
        }
      });
    });
    images.forEach(img => observer.observe(img));
  } else {
    // Fallback for older browsers
    images.forEach(img => img.src = img.getAttribute('data-src'));
  }
}

/* ============================================================
 * VIEW: FULL ARTICLE (BLOGGER FACTS)
 * ========================================================== */

async function renderArticleView(slug) {
  renderLoading();

  try {
    const data = await apiFetch(`/post/${slug}`);
    const post = data.post;

    if (!post) {
      render404();
      return;
    }

    updateSeoMeta(post.title, post.excerpt || truncateText(post.content, 150));
    injectJsonLd(post);

    let html = `
      <div class="breadcrumbs">
        <a href="/">Home</a>
        <i class="fa-solid fa-chevron-right"></i>
        <a href="/category/${post.category.toLowerCase()}">${post.category}</a>
        <i class="fa-solid fa-chevron-right"></i>
        <span>${truncateText(post.title, 24)}</span>
      </div>

      <article class="article-container">
        <header class="article-header">
          <span class="badge-tag">${post.badge}</span>
          <h1 class="article-title">${post.title}</h1>
          <div class="article-meta">
            <span><i class="fa-solid fa-calendar"></i> Published: ${formatDate(post.publishedAt)}</span>
            <span><i class="fa-solid fa-eye"></i> Views: ${post.views || 0}</span>
            <span><i class="fa-solid fa-tags"></i> Category: ${post.category}</span>
          </div>
        </header>

        ${post.image ? `<img src="${post.image}" alt="${post.title}" class="article-image" />` : ''}

        <div class="article-body">
          ${post.content || `<p>${post.excerpt}</p>`}
        </div>

        <!-- In-article Ad Slot after paragraph 3 (concept layout) -->
        <div id="ad-in-article" class="ad-slot-card" data-slot="inArticle" style="margin: 24px 0;">
          <div class="ad-slot-label">Advertisement</div>
          <div class="ad-slot-size">In-Article Slot (336 x 280)</div>
        </div>

        <!-- Share Buttons -->
        <div style="margin-top:32px; padding-top:20px; border-top:1px solid var(--border-color); display:flex; align-items:center; gap:12px;">
          <strong style="font-size:0.9rem;">Share this Fact:</strong>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" target="_blank" class="action-btn" style="padding:6px 12px; background:#1877f2; color:#fff; border:none; border-radius:4px;"><i class="fa-brands fa-facebook"></i> Facebook</a>
          <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(post.title)}" target="_blank" class="action-btn" style="padding:6px 12px; background:#1da1f2; color:#fff; border:none; border-radius:4px;"><i class="fa-brands fa-twitter"></i> Twitter</a>
        </div>
      </article>
    `;

    els.appView.innerHTML = html;
    renderAdSenseSlots();

  } catch (err) {
    renderError(err.message);
  }
}

/* ============================================================
 * VIEW: EXTERNAL NEWS DETAIL (NEWSAPI PREVIEW)
 * ========================================================== */

async function renderNewsView(slug) {
  renderLoading();

  try {
    const data = await apiFetch(`/post/${slug}`);
    const post = data.post;

    if (!post) {
      render404();
      return;
    }

    updateSeoMeta(post.title, post.excerpt || 'Read external article preview');
    injectJsonLd(post);

    let html = `
      <div class="breadcrumbs">
        <a href="/">Home</a>
        <i class="fa-solid fa-chevron-right"></i>
        <a href="/category/${post.category.toLowerCase()}">${post.category}</a>
        <i class="fa-solid fa-chevron-right"></i>
        <span>News Preview</span>
      </div>

      <div class="external-news-container">
        <div class="external-logo">
          <i class="fa-solid fa-globe"></i> ${post.sourceName || 'World News'}
        </div>
        
        <h1 class="article-title" style="margin-bottom: 16px;">${post.title}</h1>
        
        <div class="article-meta" style="justify-content: center; border-bottom: none; margin-bottom: 24px;">
          <span><i class="fa-solid fa-calendar"></i> ${formatDate(post.publishedAt)}</span>
          <span><i class="fa-solid fa-tags"></i> Category: ${post.category}</span>
        </div>

        ${post.image ? `<img src="${post.image}" alt="${post.title}" class="article-image" style="max-height:360px; margin-bottom:24px;" />` : ''}

        <p style="font-size:1.1rem; max-width:720px; margin:0 auto 24px auto; line-height:1.6; color:var(--text-color);">
          ${post.excerpt || 'Click below to read the full article directly from the publisher.'}
        </p>

        <a href="${post.sourceUrl}" target="_blank" rel="noopener noreferrer" class="cta-button">
          Read Full Article <i class="fa-solid fa-arrow-up-right-from-square" style="margin-left:8px;"></i>
        </a>
        
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top: 16px;">
          You will be redirected to the original article hosted at ${new URL(post.sourceUrl).hostname}.
        </p>
      </div>
    `;

    els.appView.innerHTML = html;

  } catch (err) {
    renderError(err.message);
  }
}

/* ============================================================
 * VIEW: CATEGORY PAGES
 * ========================================================== */

async function renderCategoryView(catName) {
  renderLoading();

  try {
    const data = await apiFetch(`/categories/${catName}?page=${state.categoryPage}&limit=12`);
    const posts = data.posts || [];
    const categoryTitle = data.category || catName;

    updateSeoMeta(`${categoryTitle} News & Facts`);

    let html = `<h2 class="section-title">Category: ${categoryTitle}</h2>`;

    if (posts.length === 0) {
      html += `<p style="text-align:center; padding: 48px;">No posts found in this category.</p>`;
      els.appView.innerHTML = html;
      return;
    }

    html += `<div class="news-grid">`;
    posts.forEach(post => {
      const cardLink = post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`;
      const borderClass = post.source === 'blogger' ? 'our-post' : '';

      html += `
        <article class="card-item ${borderClass}">
          <a href="${cardLink}">
            <div class="card-image-wrap">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3C/svg%3E" data-src="${post.image || '/logo.png'}" alt="${post.title}" class="card-image lazy-img" />
              <span class="badge-tag ${post.source === 'blogger' ? '' : 'news'}" style="position:absolute; top:12px; left:12px;">${post.badge}</span>
            </div>
            <div class="card-body">
              <h4 class="card-title">${post.title}</h4>
              <p class="card-excerpt">${truncateText(post.excerpt || post.content, 110)}</p>
              <div class="card-footer">
                <span><i class="fa-solid fa-clock"></i> ${formatDate(post.publishedAt)}</span>
                <span>${post.sourceName || 'FactDropDaily'}</span>
              </div>
            </div>
          </a>
        </article>
      `;
    });
    html += `</div>`;

    html += `
      <div class="pagination">
        <button class="btn-secondary" id="cat-prev-btn" ${state.categoryPage === 1 ? 'disabled' : ''}>Previous</button>
        <span style="font-size:0.9rem; font-weight:600;">Page ${state.categoryPage}</span>
        <button class="btn-secondary" id="cat-next-btn">Next</button>
      </div>
    `;

    els.appView.innerHTML = html;
    initializeLazyLoading();

    document.getElementById('cat-prev-btn').addEventListener('click', () => {
      if (state.categoryPage > 1) {
        state.categoryPage--;
        renderCategoryView(catName);
      }
    });
    document.getElementById('cat-next-btn').addEventListener('click', () => {
      state.categoryPage++;
      renderCategoryView(catName);
    });

  } catch (err) {
    renderError(err.message);
  }
}

/* ============================================================
 * VIEW: SEARCH RESULTS
 * ========================================================== */

async function renderSearchView(query) {
  if (!query) {
    renderError('No search query provided.');
    return;
  }
  renderLoading();

  try {
    const data = await apiFetch(`/search?q=${encodeURIComponent(query)}&page=${state.searchPage}&limit=12`);
    const posts = data.posts || [];

    updateSeoMeta(`Search results for "${query}"`);

    let html = `<h2 class="section-title">Search Results for: "${query}" (${data.total || 0})</h2>`;

    if (posts.length === 0) {
      html += `<p style="text-align:center; padding: 48px;">No matching facts or news articles found. Try another keyword!</p>`;
      els.appView.innerHTML = html;
      return;
    }

    html += `<div class="news-grid">`;
    posts.forEach(post => {
      const cardLink = post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`;
      const borderClass = post.source === 'blogger' ? 'our-post' : '';

      html += `
        <article class="card-item ${borderClass}">
          <a href="${cardLink}">
            <div class="card-image-wrap">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3C/svg%3E" data-src="${post.image || '/logo.png'}" alt="${post.title}" class="card-image lazy-img" />
              <span class="badge-tag ${post.source === 'blogger' ? '' : 'news'}" style="position:absolute; top:12px; left:12px;">${post.badge}</span>
            </div>
            <div class="card-body">
              <div class="card-category">${post.category}</div>
              <h4 class="card-title">${post.title}</h4>
              <p class="card-excerpt">${truncateText(post.excerpt || post.content, 110)}</p>
              <div class="card-footer">
                <span><i class="fa-solid fa-clock"></i> ${formatDate(post.publishedAt)}</span>
                <span>${post.sourceName || 'FactDropDaily'}</span>
              </div>
            </div>
          </a>
        </article>
      `;
    });
    html += `</div>`;

    html += `
      <div class="pagination">
        <button class="btn-secondary" id="search-prev-btn" ${state.searchPage === 1 ? 'disabled' : ''}>Previous</button>
        <span style="font-size:0.9rem; font-weight:600;">Page ${state.searchPage}</span>
        <button class="btn-secondary" id="search-next-btn">Next</button>
      </div>
    `;

    els.appView.innerHTML = html;
    initializeLazyLoading();

    document.getElementById('search-prev-btn').addEventListener('click', () => {
      if (state.searchPage > 1) {
        state.searchPage--;
        renderSearchView(query);
      }
    });
    document.getElementById('search-next-btn').addEventListener('click', () => {
      state.searchPage++;
      renderSearchView(query);
    });

  } catch (err) {
    renderError(err.message);
  }
}

/* ============================================================
 * OTHER CONTENT ARCHIVE VIEWS
 * ========================================================== */

async function renderFactsArchiveView() {
  updateSeoMeta('Our Blogger Facts Archive');
  renderLoading();

  try {
    const data = await apiFetch(`/facts?page=${state.factsPage}&limit=12`);
    const posts = data.posts || [];

    let html = `<h2 class="section-title">Curated Facts Archive</h2>`;

    if (posts.length === 0) {
      html += `<p style="text-align:center; padding: 48px;">No facts in the archive yet.</p>`;
      els.appView.innerHTML = html;
      return;
    }

    html += `<div class="news-grid">`;
    posts.forEach(post => {
      html += `
        <article class="card-item our-post">
          <a href="/article/${post.slug}">
            <div class="card-image-wrap">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3C/svg%3E" data-src="${post.image || '/logo.png'}" alt="${post.title}" class="card-image lazy-img" />
              <span class="badge-tag" style="position:absolute; top:12px; left:12px;">${post.badge}</span>
            </div>
            <div class="card-body">
              <div class="card-category">${post.category}</div>
              <h4 class="card-title">${post.title}</h4>
              <p class="card-excerpt">${truncateText(post.excerpt || post.content, 110)}</p>
              <div class="card-footer">
                <span><i class="fa-solid fa-clock"></i> ${formatDate(post.publishedAt)}</span>
                <span>FactDropDaily</span>
              </div>
            </div>
          </a>
        </article>
      `;
    });
    html += `</div>`;

    html += `
      <div class="pagination">
        <button class="btn-secondary" id="facts-prev-btn" ${state.factsPage === 1 ? 'disabled' : ''}>Previous</button>
        <span style="font-size:0.9rem; font-weight:600;">Page ${state.factsPage}</span>
        <button class="btn-secondary" id="facts-next-btn">Next</button>
      </div>
    `;

    els.appView.innerHTML = html;
    initializeLazyLoading();

    document.getElementById('facts-prev-btn').addEventListener('click', () => {
      if (state.factsPage > 1) {
        state.factsPage--;
        renderFactsArchiveView();
      }
    });
    document.getElementById('facts-next-btn').addEventListener('click', () => {
      state.factsPage++;
      renderFactsArchiveView();
    });

  } catch (err) {
    renderError(err.message);
  }
}

async function renderTrendingView() {
  updateSeoMeta('Trending News & Hot Facts');
  renderLoading();

  try {
    const data = await apiFetch('/trending?limit=20');
    const posts = data.posts || [];

    let html = `<h2 class="section-title">Trending & Most Viewed Today</h2>`;

    if (posts.length === 0) {
      html += `<p style="text-align:center; padding: 48px;">No trending posts recomputed yet.</p>`;
      els.appView.innerHTML = html;
      return;
    }

    html += `<div class="news-grid">`;
    posts.forEach(post => {
      const cardLink = post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`;
      const borderClass = post.source === 'blogger' ? 'our-post' : '';

      html += `
        <article class="card-item ${borderClass}">
          <a href="${cardLink}">
            <div class="card-image-wrap">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3C/svg%3E" data-src="${post.image || '/logo.png'}" alt="${post.title}" class="card-image lazy-img" />
              <span class="badge-tag ${post.source === 'blogger' ? '' : 'news'}" style="position:absolute; top:12px; left:12px;">${post.badge}</span>
            </div>
            <div class="card-body">
              <div class="card-category">${post.category}</div>
              <h4 class="card-title">${post.title}</h4>
              <p class="card-excerpt">${truncateText(post.excerpt || post.content, 110)}</p>
              <div class="card-footer">
                <span><i class="fa-solid fa-eye"></i> ${post.views || 0} views</span>
                <span>${post.sourceName || 'FactDropDaily'}</span>
              </div>
            </div>
          </a>
        </article>
      `;
    });
    html += `</div>`;

    els.appView.innerHTML = html;
    initializeLazyLoading();
  } catch (err) {
    renderError(err.message);
  }
}

async function renderBreakingView() {
  updateSeoMeta('Breaking Live News updates');
  renderLoading();

  try {
    const data = await apiFetch('/breaking');
    const posts = data.posts || [];

    let html = `<h2 class="section-title">Breaking News Headlines</h2>`;

    if (posts.length === 0) {
      html += `<p style="text-align:center; padding: 48px;">No active breaking news currently.</p>`;
      els.appView.innerHTML = html;
      return;
    }

    html += `<div class="news-grid">`;
    posts.forEach(post => {
      const cardLink = post.source === 'blogger' ? `/article/${post.slug}` : `/news/${post.slug}`;
      const borderClass = post.source === 'blogger' ? 'our-post' : '';

      html += `
        <article class="card-item ${borderClass}">
          <a href="${cardLink}">
            <div class="card-image-wrap">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3C/svg%3E" data-src="${post.image || '/logo.png'}" alt="${post.title}" class="card-image lazy-img" />
              <span class="badge-tag ${post.source === 'blogger' ? '' : 'news'}" style="position:absolute; top:12px; left:12px;">${post.badge}</span>
            </div>
            <div class="card-body">
              <div class="card-category">${post.category}</div>
              <h4 class="card-title">${post.title}</h4>
              <p class="card-excerpt">${truncateText(post.excerpt || post.content, 110)}</p>
              <div class="card-footer">
                <span><i class="fa-solid fa-clock"></i> ${formatDate(post.publishedAt)}</span>
                <span>${post.sourceName || 'FactDropDaily'}</span>
              </div>
            </div>
          </a>
        </article>
      `;
    });
    html += `</div>`;

    els.appView.innerHTML = html;
    initializeLazyLoading();
  } catch (err) {
    renderError(err.message);
  }
}

/* ============================================================
 * VIEW: STATIC PAGES
 * ========================================================== */

function renderAboutView() {
  updateSeoMeta('About Us');
  els.appView.innerHTML = `
    <article class="article-container">
      <h1 style="margin-bottom:16px;">About FactDropDaily</h1>
      <p style="font-size:1.1rem; margin-bottom:16px;">Welcome to FactDropDaily, your premier source for daily curated facts and headlines.</p>
      <p>Our platform combines the best of both worlds: automated world news from verified RSS networks and custom facts synchronized directly from our Blogger publishing channel.</p>
      <p>Designed as a fast, clean, and highly responsive feed portal, FactDropDaily aims to deliver knowledge nuggets interspersed with global tech, science, health, space, and sports alerts.</p>
    </article>
  `;
}

function renderContactView() {
  updateSeoMeta('Contact Us');
  els.appView.innerHTML = `
    <article class="article-container">
      <h1 style="margin-bottom:16px;">Contact FactDropDaily</h1>
      <p style="margin-bottom:24px;">Have questions, advertising proposals, or copyright concerns? Reach out to our editor team.</p>
      <form style="display:flex; flex-direction:column; gap:16px; max-width:480px;" onsubmit="event.preventDefault(); alert('Message sent!'); this.reset();">
        <div class="form-group">
          <label>Your Name</label>
          <input type="text" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Message Description</label>
          <textarea class="form-control" rows="5" required></textarea>
        </div>
        <button type="submit" class="btn-primary" style="align-self: flex-start; width: auto; padding: 10px 24px;">Send Message</button>
      </form>
    </article>
  `;
}

function renderPrivacyView() {
  updateSeoMeta('Privacy Policy');
  els.appView.innerHTML = `
    <article class="article-container">
      <h1 style="margin-bottom:16px;">Privacy Policy</h1>
      <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">Last Updated: June 15, 2026</p>
      <p>At FactDropDaily, we respect the privacy of our visitors. This Privacy Policy documents what types of information we collect and how we utilize it.</p>
      <h3>1. Information We Collect</h3>
      <p>We only collect information directly provided by you, such as your email address when you voluntarily sign up for our weekly newsletters, or details submitted via the contact form.</p>
      <h3>2. Cookie Usage</h3>
      <p>We utilize standard browser storage (such as localStorage) to cache your selected color preference (Dark/Light theme toggle) to prevent screen flashing on subsequent reloads.</p>
      <h3>3. Third-party Advertisements</h3>
      <p>We display AdSense advertisements to monetize the portal. Third-party vendors may use tracking pixels and cookies to serve ads based on your previous visits to this or other websites.</p>
    </article>
  `;
}

/* ============================================================
 * VIEW: ADMIN PORTAL
 * ========================================================== */

function renderAdminView() {
  updateSeoMeta('Admin Panel Control');

  if (!state.adminToken) {
    renderAdminLogin();
  } else {
    renderAdminDashboard();
  }
}

function renderAdminLogin() {
  els.appView.innerHTML = `
    <div class="admin-login-container">
      <h2 style="text-align:center; margin-bottom:24px; font-family:var(--font-brand);">Admin Login</h2>
      <div id="login-error-msg" style="color:#e63946; font-size:0.85rem; text-align:center; margin-bottom:16px; display:none;"></div>
      <form id="admin-login-form">
        <div class="form-group">
          <label for="admin-user">Username</label>
          <input type="text" class="form-control" id="admin-user" required />
        </div>
        <div class="form-group">
          <label for="admin-pass">Password</label>
          <input type="password" class="form-control" id="admin-pass" required />
        </div>
        <button type="submit" class="btn-primary">Authenticate</button>
      </form>
    </div>
  `;

  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-user').value.trim();
    const password = document.getElementById('admin-pass').value.trim();
    const errorMsg = document.getElementById('login-error-msg');

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok) {
        state.adminToken = data.token;
        localStorage.setItem('admin_token', data.token);
        renderAdminDashboard();
      } else {
        errorMsg.innerText = data.error || 'Authentication credentials rejected.';
        errorMsg.style.display = 'block';
      }
    } catch (err) {
      errorMsg.innerText = 'Network error communicating with auth server.';
      errorMsg.style.display = 'block';
    }
  });
}

async function renderAdminDashboard() {
  renderLoading();

  try {
    // Generate dashboard shell layout
    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h2>Control Panel</h2>
        <button class="btn-secondary" id="admin-logout-btn"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
      </div>

      <div class="admin-layout">
        <aside class="admin-nav">
          <button class="admin-nav-item ${state.activeAdminTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard"><i class="fa-solid fa-chart-line"></i> Dashboard</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'blogger' ? 'active' : ''}" data-tab="blogger"><i class="fa-solid fa-rotate"></i> Blogger Sync</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'newsapi' ? 'active' : ''}" data-tab="newsapi"><i class="fa-solid fa-newspaper"></i> NewsAPI Settings</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'breaking' ? 'active' : ''}" data-tab="breaking"><i class="fa-solid fa-bolt"></i> Breaking news</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'content' ? 'active' : ''}" data-tab="content"><i class="fa-solid fa-list-check"></i> Content Manager</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'facebook' ? 'active' : ''}" data-tab="facebook"><i class="fa-brands fa-facebook"></i> Facebook Manager</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'newsletter' ? 'active' : ''}" data-tab="newsletter"><i class="fa-solid fa-envelope-open-text"></i> Newsletters</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'seo' ? 'active' : ''}" data-tab="seo"><i class="fa-solid fa-magnifying-glass-chart"></i> SEO & Ads</button>
          <button class="admin-nav-item ${state.activeAdminTab === 'traffic' ? 'active' : ''}" data-tab="traffic"><i class="fa-solid fa-users-viewfinder"></i> Traffic Monitor</button>
        </aside>

        <section class="admin-panel-content" id="admin-tab-viewport">
          <!-- Sub-tab gets loaded here -->
        </section>
      </div>
    `;

    els.appView.innerHTML = html;

    // Attach menu toggles
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeAdminTab = btn.getAttribute('data-tab');
        loadAdminTab(state.activeAdminTab);
      });
    });

    document.getElementById('admin-logout-btn').addEventListener('click', () => {
      stopAdminHeartbeat();
      clearSessionOnServer();
      localStorage.removeItem('admin_token');
      state.adminToken = null;
      navigate('/admin');
    });

    // Load initial sub-tab
    loadAdminTab(state.activeAdminTab);

  } catch (err) {
    renderError(err.message);
  }
}

async function loadAdminTab(tabName) {
  const viewport = document.getElementById('admin-tab-viewport');
  viewport.innerHTML = `
    <div style="text-align:center; padding: 48px;">
      <i class="fa-solid fa-spinner fa-spin fa-lg" style="color:var(--orange);"></i>
    </div>
  `;

  try {
    switch(tabName) {
      case 'dashboard':
        await renderDashboardTab(viewport);
        break;
      case 'blogger':
        await renderBloggerTab(viewport);
        break;
      case 'newsapi':
        await renderNewsApiTab(viewport);
        break;
      case 'breaking':
        await renderBreakingTab(viewport);
        break;
      case 'content':
        await renderContentTab(viewport);
        break;
      case 'facebook':
        await renderFacebookTab(viewport);
        break;
      case 'newsletter':
        await renderNewsletterTab(viewport);
        break;
      case 'seo':
        await renderSeoTab(viewport);
        break;
      case 'traffic':
        await renderTrafficTab(viewport);
        break;
      default:
        viewport.innerHTML = '<p>Tab layout not found.</p>';
    }
  } catch(err) {
    viewport.innerHTML = `<div style="color:#e63946; padding: 24px;">Failed to load tab data: ${err.message}</div>`;
  }
}

/* ============================================================
 * ADMIN SUB-TABS: DASHBOARD
 * ========================================================== */

async function renderDashboardTab(container) {
  const data = await apiFetch('/admin/dashboard', { headers: adminHeaders() });

  container.innerHTML = `
    <h3 style="margin-bottom:20px;">System Overview</h3>
    
    <div class="admin-stats-grid">
      <div class="stat-card">
        <div class="stat-card-title">Today's views</div>
        <div class="stat-card-val">${data.todaysViews || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Blogger Posts</div>
        <div class="stat-card-val">${data.bloggerPosts || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">NewsAPI Stories</div>
        <div class="stat-card-val">${data.newsPosts || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Subscribers</div>
        <div class="stat-card-val">${data.newsletterSubscribers || 0}</div>
      </div>
    </div>

    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:24px;">
      <h4 style="margin-bottom:12px;">Last Auto-Sync Status</h4>
      <p style="font-size:0.9rem;"><strong>Blogger Feed Sync:</strong> ${data.lastSync.blogger ? formatDate(data.lastSync.blogger) : 'Never'}</p>
      <p style="font-size:0.9rem; margin-top:6px;"><strong>NewsAPI Headlines:</strong> ${data.lastSync.newsapi ? formatDate(data.lastSync.newsapi) : 'Never'}</p>
    </div>

    <h4 style="margin-bottom:12px;">Top 5 Hot Trending Articles</h4>
    <div class="admin-table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Total views</th>
            <th>Trending Score</th>
          </tr>
        </thead>
        <tbody>
          ${data.topTrending.map(p => `
            <tr>
              <td><strong>${p.title}</strong></td>
              <td><span class="action-badge ${p.source}">${p.source === 'blogger' ? 'Our Post' : 'News'}</span></td>
              <td>${p.views || 0}</td>
              <td>${Math.round(p.trendingScore || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ============================================================
 * ADMIN SUB-TABS: BLOGGER
 * ========================================================== */

async function renderBloggerTab(container) {
  const data = await apiFetch('/admin/blogger', { headers: adminHeaders() });

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">Blogger Sync Manager</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Synchronize facts automatically from factdropdaily.blogspot.com every 30 minutes.</p>

    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:28px;">
      <p style="font-size:0.9rem;"><strong>Total blogger posts synced:</strong> ${data.totalSynced || 0}</p>
      <p style="font-size:0.9rem; margin-top:6px;"><strong>Last sync:</strong> ${data.lastSync ? formatDate(data.lastSync) : 'Never'}</p>
      <p style="font-size:0.9rem; margin-top:6px;"><strong>Sync status:</strong> <span style="color:${data.status === 'success' ? '#2ec4b6' : '#e63946'}; font-weight:600;">${data.status || 'Unknown'}</span></p>
      ${data.error ? `<p style="font-size:0.85rem; color:#e63946; margin-top:6px; background:rgba(230,57,70,0.08); padding:8px; border-radius:4px;">Error: ${data.error}</p>` : ''}
      
      <button class="btn-primary" id="trigger-blogger-sync-btn" style="margin-top:16px; width:auto;"><i class="fa-solid fa-arrows-rotate"></i> Sync Blogger RSS Feed Now</button>
      <div id="blogger-sync-log" class="logs-console" style="display:none;"></div>
    </div>

    <h4 style="margin-bottom:12px;">Custom Blogger Tag Mapping</h4>
    <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:12px;">Map Blogger post labels (tags) into website main categories (first match wins).</p>

    <div id="mapping-rules-container" style="margin-bottom:20px;">
      <!-- Generate map list dynamic inputs -->
    </div>
    
    <button class="btn-secondary" id="add-mapping-rule-btn" style="margin-bottom:20px; font-size:0.8rem;"><i class="fa-solid fa-plus"></i> Add Rule</button>
    <button class="btn-primary" id="save-blogger-mapping-btn" style="display:block; width:auto; padding:8px 20px;">Save Mapping Rules</button>
  `;

  // Populate dynamic mapping inputs
  const rulesContainer = document.getElementById('mapping-rules-container');
  const rules = data.categoryMap || [];

  function renderRules() {
    if (rules.length === 0) {
      rulesContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No mapping overrides set. System falls back to default mapping config.</p>';
      return;
    }
    rulesContainer.innerHTML = rules.map((rule, idx) => `
      <div class="inline-form" style="margin-bottom:10px;" data-index="${idx}">
        <div style="flex-grow:1;">
          <label style="font-size:0.75rem;">If Blogger tag contains</label>
          <input type="text" class="form-control rule-match" value="${rule.match}" style="padding:6px 12px; font-size:0.85rem;" />
        </div>
        <div style="flex-grow:1;">
          <label style="font-size:0.75rem;">Map to Site Category</label>
          <select class="form-control rule-category" style="padding:6px 12px; font-size:0.85rem;">
            <option value="World" ${rule.category === 'World' ? 'selected' : ''}>World</option>
            <option value="Technology" ${rule.category === 'Technology' ? 'selected' : ''}>Technology</option>
            <option value="Science" ${rule.category === 'Science' ? 'selected' : ''}>Science</option>
            <option value="Health" ${rule.category === 'Health' ? 'selected' : ''}>Health</option>
            <option value="Sports" ${rule.category === 'Sports' ? 'selected' : ''}>Sports</option>
            <option value="Entertainment" ${rule.category === 'Entertainment' ? 'selected' : ''}>Entertainment</option>
            <option value="Space" ${rule.category === 'Space' ? 'selected' : ''}>Space</option>
            <option value="Animals" ${rule.category === 'Animals' ? 'selected' : ''}>Animals</option>
            <option value="General" ${rule.category === 'General' ? 'selected' : ''}>General</option>
          </select>
        </div>
        <button class="action-btn delete remove-rule-btn" style="padding: 8px 12px; font-size:0.85rem;"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join('');

    // Attach delete listeners
    rulesContainer.querySelectorAll('.remove-rule-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.closest('.inline-form').getAttribute('data-index'), 10);
        rules.splice(idx, 1);
        renderRules();
      });
    });
  }

  renderRules();

  // Add rule button
  document.getElementById('add-mapping-rule-btn').addEventListener('click', () => {
    rules.push({ match: '', category: 'General' });
    renderRules();
  });

  // Sync feed button
  document.getElementById('trigger-blogger-sync-btn').addEventListener('click', async () => {
    const logDiv = document.getElementById('blogger-sync-log');
    logDiv.style.display = 'block';
    logDiv.innerText = '[System] Triggering Blogger RSS feed manual sync...\n';

    try {
      const res = await apiFetch('/admin/blogger/sync', {
        method: 'POST',
        headers: adminHeaders(),
      });
      logDiv.innerText += `[Success] Sync finished successfully.\n[Sync Info] Fetched: ${res.fetched}, Synced: ${res.synced}, Updated: ${res.updated}`;
      setTimeout(() => loadAdminTab('blogger'), 3000);
    } catch(err) {
      logDiv.innerText += `[Failed] Sync failed: ${err.message}`;
    }
  });

  // Save mapping rules button
  document.getElementById('save-blogger-mapping-btn').addEventListener('click', async () => {
    // Collect mapping details
    const updatedMap = [];
    rulesContainer.querySelectorAll('.inline-form').forEach(div => {
      const matchVal = div.querySelector('.rule-match').value.trim();
      const catVal = div.querySelector('.rule-category').value;
      if (matchVal) {
        updatedMap.push({ match: matchVal, category: catVal });
      }
    });

    try {
      await apiFetch('/admin/blogger/category-map', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ categoryMap: updatedMap }),
      });
      alert('Mapping overrides saved successfully.');
      loadAdminTab('blogger');
    } catch(err) {
      alert(`Could not save rules: ${err.message}`);
    }
  });
}

/* ============================================================
 * ADMIN SUB-TABS: NEWSAPI
 * ========================================================== */

async function renderNewsApiTab(container) {
  const data = await apiFetch('/admin/newsapi', { headers: adminHeaders() });

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">NewsAPI Manager</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Control live headlines fetched from NewsAPI.org. The free tier limits requests to 100/day.</p>

    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:28px;">
      <p style="font-size:0.9rem;"><strong>Free quota usage counter:</strong> ${data.usage || 0} / ${data.dailyLimit || 100} calls today</p>
      <p style="font-size:0.9rem; margin-top:6px;"><strong>Last fetch:</strong> ${data.lastFetch ? formatDate(data.lastFetch) : 'Never'}</p>
      <p style="font-size:0.9rem; margin-top:6px;"><strong>Last status:</strong> <span style="color:${data.status === 'success' ? '#2ec4b6' : '#e63946'}; font-weight:600;">${data.status || 'Unknown'}</span></p>
      ${data.error ? `<p style="font-size:0.85rem; color:#e63946; margin-top:6px; background:rgba(230,57,70,0.08); padding:8px; border-radius:4px;">Error: ${data.error}</p>` : ''}
      
      <button class="btn-primary" id="trigger-newsapi-sync-btn" style="margin-top:16px; width:auto;"><i class="fa-solid fa-cloud-arrow-down"></i> Fetch Top Headlines Now</button>
      <div id="newsapi-sync-log" class="logs-console" style="display:none;"></div>
    </div>

    <div class="admin-stats-grid" style="grid-template-columns: 1fr 1fr; gap:28px; margin-bottom:24px;">
      <div>
        <h4 style="margin-bottom:12px;">Enable Categories</h4>
        <form id="newsapi-categories-form" style="display:flex; flex-direction:column; gap:8px;">
          ${data.availableCategories.map(cat => `
            <label style="font-size:0.9rem; display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" name="cat-${cat}" ${data.categories[cat] !== false ? 'checked' : ''} />
              ${cat.charAt(0).toUpperCase() + cat.slice(1)}
            </label>
          `).join('')}
          <button type="submit" class="btn-primary" style="margin-top:12px; font-size:0.8rem; width:auto; padding:6px 16px;">Save Categories</button>
        </form>
      </div>

      <div>
        <h4 style="margin-bottom:12px;">Blacklisted News Sources</h4>
        <p style="color:var(--text-muted); font-size:0.75rem; margin-bottom:10px;">Exclude tabloids or paywalled domains (separated by commas).</p>
        <textarea class="form-control" id="news-blacklist-textarea" rows="5" placeholder="e.g. Daily Mail, The Sun, Breitbart">${(data.blacklistedSources || []).join(', ')}</textarea>
        <button class="btn-primary" id="save-news-blacklist-btn" style="margin-top:16px; font-size:0.8rem; width:auto; padding:6px 16px;">Save Blacklist</button>
      </div>
    </div>
  `;

  // Fetch button trigger
  document.getElementById('trigger-newsapi-sync-btn').addEventListener('click', async () => {
    const logDiv = document.getElementById('newsapi-sync-log');
    logDiv.style.display = 'block';
    logDiv.innerText = '[System] Triggering NewsAPI.org manual sync request...\n';

    try {
      const res = await apiFetch('/admin/newsapi/sync', {
        method: 'POST',
        headers: adminHeaders(),
      });
      const t = res.totals || {};
      const byCategory = Object.entries(res.results || {})
        .map(([cat, r]) => r.error ? `  ${cat}: ERROR - ${r.error}` : `  ${cat}: +${r.created} added, ${r.skipped} skipped`)
        .join('\n');
      logDiv.innerText += `[Success] NewsAPI fetch complete.\n[Sync Info] Fetched: ${t.fetched ?? 0}, Added: ${t.created ?? 0}, Skipped: ${t.skipped ?? 0}, Breaking: ${t.breaking ?? 0}\n[Daily Usage] ${res.usage?.count ?? '?'}/${100} requests used\n\n[Per Category]\n${byCategory}`;
      setTimeout(() => loadAdminTab('newsapi'), 3000);
    } catch(err) {
      logDiv.innerText += `[Failed] Sync failed: ${err.message}`;
    }
  });

  // Save categories checklist
  document.getElementById('newsapi-categories-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const categories = {};
    data.availableCategories.forEach(cat => {
      const checkbox = e.target.querySelector(`input[name="cat-${cat}"]`);
      if (checkbox) {
        categories[cat] = checkbox.checked;
      }
    });

    try {
      await apiFetch('/admin/newsapi/categories', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ categories }),
      });
      alert('NewsAPI categories updated.');
      loadAdminTab('newsapi');
    } catch(err) {
      alert(`Could not save categories settings: ${err.message}`);
    }
  });

  // Save blacklist
  document.getElementById('save-news-blacklist-btn').addEventListener('click', async () => {
    const text = document.getElementById('news-blacklist-textarea').value.trim();
    const sources = text ? text.split(',').map(s => s.trim()).filter(Boolean) : [];

    try {
      await apiFetch('/admin/newsapi/blacklist', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ sources }),
      });
      alert('Source blacklist updated.');
      loadAdminTab('newsapi');
    } catch(err) {
      alert(`Could not save blacklist: ${err.message}`);
    }
  });
}

/* ============================================================
 * ADMIN SUB-TABS: BREAKING NEWS
 * ========================================================== */

async function renderBreakingTab(container) {
  const data = await apiFetch('/admin/breaking', { headers: adminHeaders() });

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">Breaking News Manager</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Manage scrolling ticker announcements and mark custom posts as breaking news.</p>

    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:28px;">
      <h4 style="margin-bottom:12px;">Ticker Settings</h4>
      <form id="breaking-settings-form" style="display:flex; flex-direction:column; gap:12px;">
        <label style="font-size:0.9rem; display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="tickerEnabled" ${data.tickerEnabled !== false ? 'checked' : ''} />
          Enable scrolling breaking news ticker bar
        </label>
        <label style="font-size:0.9rem; display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="autoDetectionEnabled" ${data.autoDetectionEnabled !== false ? 'checked' : ''} />
          Auto-flag very fresh news as breaking (1h cutoff)
        </label>
        <div style="display:flex; align-items:center; gap:8px; font-size:0.9rem;">
          <span>Default breaking duration:</span>
          <input type="number" class="form-control" name="defaultDurationMinutes" value="${data.defaultDurationMinutes || 120}" style="width:100px; padding:4px 8px; font-size:0.85rem;" />
          <span>minutes</span>
        </div>
        <button type="submit" class="btn-primary" style="width:auto; padding:6px 16px; font-size:0.8rem; margin-top:8px;">Save Settings</button>
      </form>
    </div>

    <h4 style="margin-bottom:12px;">Currently Active Breaking Stories</h4>
    <div class="admin-table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Expires At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${data.posts.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No active breaking stories.</td></tr>' : ''}
          ${data.posts.map(p => `
            <tr>
              <td><strong>${p.title}</strong></td>
              <td><span class="action-badge ${p.source}">${p.source === 'blogger' ? 'Our Post' : 'News'}</span></td>
              <td>${formatDate(p.breakingExpiresAt)} ${new Date(p.breakingExpiresAt).toLocaleTimeString()}</td>
              <td>
                <button class="action-btn delete remove-breaking-btn" data-id="${p._id}"><i class="fa-solid fa-circle-minus"></i> Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Attach delete buttons
  container.querySelectorAll('.remove-breaking-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      try {
        await apiFetch(`/admin/breaking/${id}`, {
          method: 'DELETE',
          headers: adminHeaders(),
        });
        alert('Post unmarked as breaking.');
        loadAdminTab('breaking');
        loadBreakingTicker(); // reload global state
      } catch(err) {
        alert(err.message);
      }
    });
  });

  // Ticker settings submit
  document.getElementById('breaking-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const settings = {
      tickerEnabled: e.target.querySelector('input[name="tickerEnabled"]').checked,
      autoDetectionEnabled: e.target.querySelector('input[name="autoDetectionEnabled"]').checked,
      defaultDurationMinutes: parseInt(e.target.querySelector('input[name="defaultDurationMinutes"]').value, 10) || 120,
    };

    try {
      await apiFetch('/admin/breaking/settings', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify(settings),
      });
      alert('Settings saved.');
      loadAdminTab('breaking');
      loadBreakingTicker();
    } catch(err) {
      alert(err.message);
    }
  });
}

/* ============================================================
 * ADMIN SUB-TABS: CONTENT MANAGER
 * ========================================================== */

async function renderContentTab(container) {
  // Simple view variables for page filters
  let page = 1;
  let query = '';
  let source = '';
  
  function getPostListHtml(postsData) {
    return `
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Category</th>
              <th>Views</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${postsData.posts.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No posts matching filter conditions found.</td></tr>' : ''}
            ${postsData.posts.map(p => `
              <tr data-id="${p._id}">
                <td>
                  <strong style="display:block; max-width: 320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.title}</strong>
                  <span style="font-size:0.7rem; color:var(--text-muted);">${formatDate(p.publishedAt)}</span>
                </td>
                <td><span class="action-badge ${p.source}">${p.source === 'blogger' ? 'Our Post' : 'News'}</span></td>
                <td>${p.category}</td>
                <td>${p.views || 0}</td>
                <td>
                  <span style="color:${p.status === 'active' ? '#2ec4b6' : '#e63946'}; font-weight:600;">${p.status}</span>
                </td>
                <td>
                  <button class="action-btn edit-post-btn" data-id="${p._id}"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                  <button class="action-btn feature-post-btn" data-id="${p._id}" data-featured="${p.featured ? 'true' : 'false'}" style="color:${p.featured ? 'var(--orange)' : 'inherit'};">
                    <i class="fa-solid ${p.featured ? 'fa-star' : 'fa-star-o'}"></i> ${p.featured ? 'Featured' : 'Feature'}
                  </button>
                  <button class="action-btn breaking-post-btn" data-id="${p._id}" data-breaking="${p.isBreaking ? 'true' : 'false'}" style="color:${p.isBreaking ? 'var(--orange)' : 'inherit'};">
                    <i class="fa-solid fa-bolt"></i> Ticker
                  </button>
                  <button class="action-btn delete delete-post-btn" data-id="${p._id}"><i class="fa-solid fa-trash"></i> Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="pagination" style="margin-top: 16px;">
        <button class="btn-secondary" id="admin-post-prev" ${page === 1 ? 'disabled' : ''}>Previous</button>
        <span style="font-size:0.85rem;">Page ${page}</span>
        <button class="btn-secondary" id="admin-post-next" ${postsData.posts.length < 20 ? 'disabled' : ''}>Next</button>
      </div>
    `;
  }

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">Content Manager</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Edit details, hide, or delete synced fact sheets and news articles.</p>

    <!-- Filters row -->
    <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; align-items:center;">
      <input type="text" class="form-control" id="content-search-input" placeholder="Search keywords..." style="width:200px; padding:6px 12px; font-size:0.85rem;" />
      
      <select class="form-control" id="content-source-filter" style="width:130px; padding:6px 12px; font-size:0.85rem;">
        <option value="">All Sources</option>
        <option value="blogger">Blogger Only</option>
        <option value="newsapi">NewsAPI Only</option>
      </select>

      <button class="btn-primary" id="apply-content-filters-btn" style="width:auto; padding:8px 16px; font-size:0.85rem;">Filter</button>
    </div>

    <div id="posts-list-viewport">
      <!-- Loading list -->
    </div>
  `;

  const listViewport = document.getElementById('posts-list-viewport');

  async function loadPosts() {
    listViewport.innerHTML = '<p style="text-align:center; padding: 24px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading posts...</p>';
    try {
      const data = await apiFetch(`/admin/posts?page=${page}&limit=20&q=${encodeURIComponent(query)}&source=${source}`, {
        headers: adminHeaders(),
      });
      listViewport.innerHTML = getPostListHtml(data);
      attachListActionListeners(data.posts);
    } catch(err) {
      listViewport.innerHTML = `<p style="color:#e63946; padding:16px;">Failed to fetch posts: ${err.message}</p>`;
    }
  }

  function attachListActionListeners(posts) {
    // Prev / Next pagination
    const prevBtn = document.getElementById('admin-post-prev');
    const nextBtn = document.getElementById('admin-post-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { page--; loadPosts(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { page++; loadPosts(); });

    // Edit modal trigger
    listViewport.querySelectorAll('.edit-post-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const post = posts.find(p => p._id === id);
        if (post) openEditModal(post);
      });
    });

    // Delete post trigger
    listViewport.querySelectorAll('.delete-post-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this post permanently?')) return;
        const id = btn.getAttribute('data-id');
        try {
          await apiFetch(`/admin/posts/${id}`, {
            method: 'DELETE',
            headers: adminHeaders(),
          });
          alert('Article deleted successfully.');
          loadPosts();
        } catch(err) {
          alert(`Failed to delete: ${err.message}`);
        }
      });
    });

    // Feature post toggle
    listViewport.querySelectorAll('.feature-post-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const currentlyFeatured = btn.getAttribute('data-featured') === 'true';
        try {
          await apiFetch(`/admin/posts/${id}/feature`, {
            method: 'PUT',
            headers: adminHeaders(),
            body: JSON.stringify({ featured: !currentlyFeatured }),
          });
          loadPosts();
        } catch(err) {
          alert(err.message);
        }
      });
    });

    // Breaking ticker toggle
    listViewport.querySelectorAll('.breaking-post-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const currentlyBreaking = btn.getAttribute('data-breaking') === 'true';
        try {
          if (currentlyBreaking) {
            await apiFetch(`/admin/breaking/${id}`, {
              method: 'DELETE',
              headers: adminHeaders(),
            });
          } else {
            await apiFetch(`/admin/breaking/${id}`, {
              method: 'POST',
              headers: adminHeaders(),
            });
          }
          alert('Breaking state toggled.');
          loadPosts();
          loadBreakingTicker();
        } catch(err) {
          alert(err.message);
        }
      });
    });
  }

  function openEditModal(post) {
    els.editId.value = post._id;
    els.editTitle.value = post.title;
    els.editExcerpt.value = post.excerpt || '';
    els.editImage.value = post.image || '';
    els.editCategory.value = post.category || 'General';
    els.editStatus.value = post.status || 'active';

    // Show/hide content input for newsapi articles (since they don't have body contents)
    if (post.source === 'newsapi') {
      document.getElementById('edit-post-content-group').style.display = 'none';
      els.editContent.value = '';
    } else {
      document.getElementById('edit-post-content-group').style.display = 'block';
      els.editContent.value = post.content || '';
    }

    els.modalTitle.innerText = `Edit: ${post.title.substring(0, 32)}...`;
    els.editModal.classList.add('open');
  }

  // Setup filters listener
  document.getElementById('apply-content-filters-btn').addEventListener('click', () => {
    query = document.getElementById('content-search-input').value.trim();
    source = document.getElementById('content-source-filter').value;
    page = 1;
    loadPosts();
  });

  // Modal form submit handler
  els.editForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = els.editId.value;
    const body = {
      title: els.editTitle.value.trim(),
      excerpt: els.editExcerpt.value.trim(),
      image: els.editImage.value.trim(),
      category: els.editCategory.value,
      status: els.editStatus.value,
    };
    if (els.editContent.value) {
      body.content = els.editContent.value.trim();
    }

    try {
      await apiFetch(`/admin/posts/${id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      alert('Post updated successfully.');
      els.editModal.classList.remove('open');
      loadPosts();
    } catch(err) {
      alert(`Save failed: ${err.message}`);
    }
  };

  // Load first page of posts
  loadPosts();
}

/* ============================================================
 * ADMIN SUB-TABS: FACEBOOK
 * ========================================================== */

async function renderFacebookTab(container) {
  const data = await apiFetch('/admin/facebook', { headers: adminHeaders() });

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">Facebook Auto-Poster</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Automatically distribute new facts and breaking news directly to your Facebook Page feed.</p>

    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:28px;">
      <h4 style="margin-bottom:12px;">Auto-Posting Toggles</h4>
      <form id="facebook-settings-form" style="display:flex; flex-direction:column; gap:8px;">
        <label style="font-size:0.9rem; display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="facts" ${data.autoPost?.facts ? 'checked' : ''} />
          Auto-post new Blogger facts when synced
        </label>
        <label style="font-size:0.9rem; display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="news" ${data.autoPost?.news ? 'checked' : ''} />
          Auto-post world news when fetched (Caution: consumes API / limits quickly)
        </label>
        <label style="font-size:0.9rem; display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" name="breaking" ${data.autoPost?.breaking ? 'checked' : ''} />
          Auto-post breaking news alerts immediately
        </label>
        <button type="submit" class="btn-primary" style="margin-top:12px; font-size:0.8rem; width:auto; padding:6px 16px;">Save FB Settings</button>
      </form>
    </div>

    <h4 style="margin-bottom:12px;">Graph API Post Logs & Share History</h4>
    <div class="admin-table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Article Title</th>
            <th>Platform Status</th>
            <th>FB Post ID / Error message</th>
            <th>Date Attempted</th>
          </tr>
        </thead>
        <tbody>
          ${data.history.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No Facebook share attempts logged.</td></tr>' : ''}
          ${data.history.map(log => `
            <tr>
              <td><strong>${log.post?.title || 'Unknown Post Title'}</strong></td>
              <td>
                <span style="color:${log.status === 'success' ? '#2ec4b6' : '#e63946'}; font-weight:600;">${log.status}</span>
              </td>
              <td style="font-family:monospace; font-size:0.75rem;">${log.fbPostId || log.error || '-'}</td>
              <td>${formatDate(log.createdAt)} ${new Date(log.createdAt).toLocaleTimeString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Submit settings listener
  document.getElementById('facebook-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const config = {
      facts: e.target.querySelector('input[name="facts"]').checked,
      news: e.target.querySelector('input[name="news"]').checked,
      breaking: e.target.querySelector('input[name="breaking"]').checked,
    };

    try {
      await apiFetch('/admin/facebook/settings', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify(config),
      });
      alert('Facebook auto-post configurations updated.');
      loadAdminTab('facebook');
    } catch(err) {
      alert(`Failed to save Facebook config: ${err.message}`);
    }
  });
}

/* ============================================================
 * ADMIN SUB-TABS: NEWSLETTER
 * ========================================================== */

async function renderNewsletterTab(container) {
  let page = 1;

  function renderSubscribersList(subData) {
    return `
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Email Address</th>
              <th>Subscription Date</th>
            </tr>
          </thead>
          <tbody>
            ${subData.subscribers.length === 0 ? '<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">No subscribers listed.</td></tr>' : ''}
            ${subData.subscribers.map(sub => `
              <tr>
                <td><strong>${sub.email}</strong></td>
                <td>${formatDate(sub.subscribedAt)} ${new Date(sub.subscribedAt).toLocaleTimeString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button class="btn-secondary" id="newsletter-prev-btn" ${page === 1 ? 'disabled' : ''}>Previous</button>
        <span style="font-size:0.85rem;">Page ${page}</span>
        <button class="btn-secondary" id="newsletter-next-btn" ${subData.subscribers.length < 50 ? 'disabled' : ''}>Next</button>
      </div>
    `;
  }

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">Newsletter Campaigns</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Manage mailing subscribers list and dispatch manual weekly digests containing your Blogger facts.</p>

    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:28px;">
      <h4 style="margin-bottom:12px;">Mailing Campaigns Dispatcher</h4>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:14px;">Triggering the newsletter digest sends the latest 5 facts combined with 5 world news articles in a beautiful HTML layout via Nodemailer SMTP.</p>
      <button class="btn-primary" id="trigger-send-newsletter-btn" style="width:auto;"><i class="fa-solid fa-paper-plane"></i> Send Newsletter Digest to All Subscribers Now</button>
      <div id="newsletter-trigger-log" class="logs-console" style="display:none;"></div>
    </div>

    <h4 style="margin-bottom:12px;">Subscribers List</h4>
    <div id="subscribers-list-viewport">
      <!-- Loading list -->
    </div>
  `;

  const listViewport = document.getElementById('subscribers-list-viewport');

  async function loadSubs() {
    listViewport.innerHTML = '<p><i class="fa-solid fa-spinner fa-spin"></i> Loading mailing list...</p>';
    try {
      const data = await apiFetch(`/admin/newsletter?page=${page}&limit=50`, {
        headers: adminHeaders(),
      });
      listViewport.innerHTML = renderSubscribersList(data);
      
      const prevBtn = document.getElementById('newsletter-prev-btn');
      const nextBtn = document.getElementById('newsletter-next-btn');
      if (prevBtn) prevBtn.addEventListener('click', () => { page--; loadSubs(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { page++; loadSubs(); });

    } catch(err) {
      listViewport.innerHTML = `<p style="color:#e63946;">Failed to load mailing list: ${err.message}</p>`;
    }
  }

  // Send newsletter trigger
  document.getElementById('trigger-send-newsletter-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to send the email campaign digest to all subscribers?')) return;
    const logDiv = document.getElementById('newsletter-trigger-log');
    logDiv.style.display = 'block';
    logDiv.innerText = '[System] Dispatching newsletter campaigns queue...\n';

    try {
      const res = await apiFetch('/admin/newsletter/send', {
        method: 'POST',
        headers: adminHeaders(),
      });
      logDiv.innerText += `[Success] Campaign newsletter sent to ${res.sentCount} subscribers.`;
    } catch(err) {
      logDiv.innerText += `[Failed] Dispatch failed: ${err.message}`;
    }
  });

  loadSubs();
}

/* ============================================================
 * ADMIN SUB-TABS: SEO & ADSENSE
 * ========================================================== */

async function renderSeoTab(container) {
  const data = await apiFetch('/admin/seo', { headers: adminHeaders() });
  const settingsData = await apiFetch('/admin/settings', { headers: adminHeaders() });
  const settings = settingsData.settings || {};
  const adSlots = settings.adSlots || {};

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">SEO & AdSense Settings</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:20px;">Re-generate sitemaps on demand, insert custom AdSense codes, and toggle visual display banners.</p>

    <div class="admin-stats-grid" style="grid-template-columns: 1fr 1fr; gap:24px; margin-bottom:28px;">
      
      <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px;">
        <h4 style="margin-bottom:12px;">Sitemaps Status</h4>
        <p style="font-size:0.85rem; margin-bottom:6px;"><strong>General Sitemap:</strong> <a href="${data.sitemapUrl}" target="_blank">${data.sitemapUrl}</a></p>
        <p style="font-size:0.85rem; margin-bottom:6px;"><strong>Google News Sitemap:</strong> <a href="${data.newsSitemapUrl}" target="_blank">${data.newsSitemapUrl}</a></p>
        <p style="font-size:0.85rem; margin-bottom:12px;"><strong>Last generated:</strong> ${data.sitemapLastGenerated ? formatDate(data.sitemapLastGenerated) : 'Never'}</p>
        <button class="btn-primary" id="regenerate-sitemaps-btn" style="font-size:0.8rem; width:auto; padding:6px 12px;"><i class="fa-solid fa-rotate"></i> Regenerate Sitemaps Now</button>
      </div>

      <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px;">
        <h4 style="margin-bottom:12px;">Google News Feed Preview</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">The sitemap generator automatically bundles fresh blogger posts from the last 48 hours in the schema formats required by Google News crawlers.</p>
        <span class="action-badge success" style="background:rgba(46,196,182,0.12); color:#2ec4b6; font-size:0.75rem;"><i class="fa-solid fa-circle-check"></i> RSS Active</span>
      </div>

    </div>

    <h4 style="margin-bottom:12px;">AdSense Slots Configuration</h4>
    <form id="adsense-slots-form">
      
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${Object.keys(adSlots).map(slotKey => {
          const slot = adSlots[slotKey];
          const dims = getAdDimensions(slotKey);
          return `
            <div style="background:var(--panel-color); border:1px solid var(--border-color); padding:16px; border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <strong style="text-transform:capitalize; font-size:0.9rem;">${slotKey.replace(/([A-Z])/g, ' $1').trim()} (${dims})</strong>
                <label style="font-size:0.8rem; display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <input type="checkbox" name="enabled-${slotKey}" ${slot.enabled ? 'checked' : ''} />
                  Show Slot
                </label>
              </div>
              <textarea class="form-control" name="code-${slotKey}" rows="2" style="font-family:monospace; font-size:0.75rem;" placeholder="Insert AdSense tag code script...">${slot.code || ''}</textarea>
            </div>
          `;
        }).join('')}
      </div>

      <button type="submit" class="btn-primary" style="margin-top:24px; width:auto; padding:10px 28px;">Save AdSense Codes</button>
    </form>
  `;

  // Regenerate sitemaps listener
  document.getElementById('regenerate-sitemaps-btn').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/admin/seo/regenerate-sitemap', {
        method: 'POST',
        headers: adminHeaders(),
      });
      alert(`Sitemaps regenerated.\nIndexed Links: ${res.urls}, News Links: ${res.newsUrls}`);
      loadAdminTab('seo');
    } catch(err) {
      alert(`Failed to regenerate: ${err.message}`);
    }
  });

  // Save Adsense codes
  document.getElementById('adsense-slots-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const adSlotsPayload = {};

    Object.keys(adSlots).forEach(slotKey => {
      const enabled = e.target.querySelector(`input[name="enabled-${slotKey}"]`).checked;
      const code = e.target.querySelector(`textarea[name="code-${slotKey}"]`).value.trim();
      adSlotsPayload[slotKey] = { enabled, code };
    });

    try {
      await apiFetch('/admin/settings/ad-slots', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ adSlots: adSlotsPayload }),
      });
      alert('AdSense settings updated.');
      loadAdminTab('seo');
      await loadSiteConfig(); // reload site header config state
    } catch(err) {
      alert(err.message);
    }
  });
}

/* ============================================================
 * ADMIN SUB-TABS: TRAFFIC & BOT MONITOR
 * ========================================================== */

async function renderTrafficTab(container) {
  const data = await apiFetch('/admin/traffic', { headers: adminHeaders() });
  const s = data.summary || { total: 0, bots: 0, humans: 0, pageviews: 0, clicks: 0 };
  
  const humanPercent = s.total ? Math.round((s.humans / s.total) * 100) : 0;
  const botPercent = s.total ? Math.round((s.bots / s.total) * 100) : 0;

  const viewPercent = s.total ? Math.round((s.pageviews / s.total) * 100) : 0;
  const clickPercent = s.total ? Math.round((s.clicks / s.total) * 100) : 0;

  const maxClickCount = data.topPosts && data.topPosts.length > 0
    ? Math.max(...data.topPosts.map(p => p.count))
    : 1;

  container.innerHTML = `
    <h3 style="margin-bottom:12px;">Traffic & Bot Monitor</h3>
    <p style="color:var(--text-muted); font-size:0.88rem; margin-bottom:24px;">Real-time visitor logs, page views, link clicks, and automated bot detection.</p>

    <!-- Stats Grid -->
    <div class="admin-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:16px; margin-bottom:28px;">
      <div class="stat-card">
        <div class="stat-card-title">Total hits</div>
        <div class="stat-card-val">${s.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Humans</div>
        <div class="stat-card-val" style="color:#2ec4b6;">${s.humans} (${humanPercent}%)</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Bots & Crawlers</div>
        <div class="stat-card-val" style="color:#e63946;">${s.bots} (${botPercent}%)</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Pageviews</div>
        <div class="stat-card-val">${s.pageviews}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">Clickthroughs</div>
        <div class="stat-card-val" style="color:var(--orange);">${s.clicks}</div>
      </div>
    </div>

    <!-- Charts Layout Section -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:32px;">
      
      <!-- Chart 1: Audience Type (Human vs Bot) -->
      <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px;">
        <h4 style="margin-bottom:16px; font-size:0.95rem;"><i class="fa-solid fa-users"></i> Audience Mix</h4>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:6px;">
          <span style="color:#2ec4b6; font-weight:600;"><i class="fa-solid fa-user"></i> Humans (${humanPercent}%)</span>
          <span style="color:#e63946; font-weight:600;"><i class="fa-solid fa-robot"></i> Bots (${botPercent}%)</span>
        </div>
        <div style="height:16px; border-radius:8px; background:rgba(255,255,255,0.06); display:flex; overflow:hidden;">
          <div style="width:${humanPercent}%; background:#2ec4b6; transition:width 0.5s;"></div>
          <div style="width:${botPercent}%; background:#e63946; transition:width 0.5s;"></div>
        </div>
        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:10px; line-height:1.3;">
          Bots include search engines, scrapers, and headless crawlers detected by analyzing HTTP client User-Agents.
        </p>
      </div>

      <!-- Chart 2: Interaction split -->
      <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px;">
        <h4 style="margin-bottom:16px; font-size:0.95rem;"><i class="fa-solid fa-chart-simple"></i> Interaction Ratio</h4>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:6px;">
          <span style="color:var(--text-muted); font-weight:600;"><i class="fa-solid fa-eye"></i> Pageviews (${viewPercent}%)</span>
          <span style="color:var(--orange); font-weight:600;"><i class="fa-solid fa-arrow-pointer"></i> Clicks (${clickPercent}%)</span>
        </div>
        <div style="height:16px; border-radius:8px; background:rgba(255,255,255,0.06); display:flex; overflow:hidden;">
          <div style="width:${viewPercent}%; background:var(--text-muted); transition:width 0.5s;"></div>
          <div style="width:${clickPercent}%; background:var(--orange); transition:width 0.5s;"></div>
        </div>
        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:10px; line-height:1.3;">
          Displays relative percentage comparison between general page loads (views) and targeted links clicked by visitors.
        </p>
      </div>

    </div>

    <!-- Top Clicked Posts section -->
    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; padding:20px; margin-bottom:32px;">
      <h4 style="margin-bottom:16px; font-size:0.95rem;"><i class="fa-solid fa-fire"></i> Most Clicked Articles & Stories</h4>
      
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${(data.topPosts || []).map(post => {
          const widthVal = Math.round((post.count / maxClickCount) * 100);
          const badgeClass = post.source === 'blogger' ? '' : 'news';
          const badgeText = post.source === 'blogger' ? 'FACT' : 'NEWS';
          return `
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; font-size:0.82rem; margin-bottom:6px; gap:12px;">
                <span style="font-weight:500; text-align:left;">
                  <span class="badge-tag ${badgeClass}" style="font-size:0.65rem; padding:1px 5px; margin-right:4px;">${badgeText}</span>
                  ${post.title}
                </span>
                <strong style="color:var(--orange); white-space:nowrap;">${post.count} clicks</strong>
              </div>
              <div style="height:8px; border-radius:4px; background:rgba(255,255,255,0.04); overflow:hidden;">
                <div style="width:${widthVal}%; background:linear-gradient(90deg, var(--orange-glow), var(--orange)); height:100%; border-radius:4px; transition:width 0.6s;"></div>
              </div>
            </div>
          `;
        }).join('')}
        ${(!data.topPosts || data.topPosts.length === 0) ? `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:12px;">No article clicks tracked yet.</p>` : ''}
      </div>
    </div>

    <!-- Log Table -->
    <h4 style="margin-bottom:16px;">Recent 100 Logs</h4>
    <div style="background:var(--panel-color); border:1px solid var(--border-color); border-radius:8px; overflow:hidden;">
      <div style="overflow-x:auto;">
        <table class="admin-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-color); background:rgba(255,255,255,0.02);">
              <th style="padding:12px 16px;">Time</th>
              <th style="padding:12px 16px;">IP Address</th>
              <th style="padding:12px 16px;">Type</th>
              <th style="padding:12px 16px;">Path / Target</th>
              <th style="padding:12px 16px;">Bot?</th>
              <th style="padding:12px 16px;">User-Agent</th>
            </tr>
          </thead>
          <tbody>
            ${(data.logs || []).map(log => {
              const isBotBadge = log.isBot 
                ? `<span class="action-badge danger" style="padding:2px 6px; font-size:0.75rem; background:rgba(230,57,70,0.12); color:#e63946;" title="${log.botReason || ''}"><i class="fa-solid fa-robot"></i> Bot</span>` 
                : `<span class="action-badge success" style="padding:2px 6px; font-size:0.75rem; background:rgba(46,196,182,0.12); color:#2ec4b6;"><i class="fa-solid fa-user"></i> Human</span>`;
              
              const typeBadge = log.type === 'click'
                ? `<span style="color:var(--orange); font-weight:600;"><i class="fa-solid fa-arrow-pointer"></i> CLICK</span>`
                : `<span style="color:var(--text-muted);"><i class="fa-solid fa-eye"></i> VIEW</span>`;

              return `
                <tr style="border-bottom:1px solid var(--border-color); transition: background 0.2s;">
                  <td style="padding:12px 16px; white-space:nowrap; color:var(--text-muted);">${new Date(log.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
                  <td style="padding:12px 16px; font-family:monospace; font-weight:500;">${log.ip}</td>
                  <td style="padding:12px 16px;">${typeBadge}</td>
                  <td style="padding:12px 16px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${log.path}">
                    ${log.targetSlug ? `<strong>${log.targetSlug}</strong>` : log.path}
                  </td>
                  <td style="padding:12px 16px;">${isBotBadge}</td>
                  <td style="padding:12px 16px; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted); font-size:0.78rem;" title="${log.userAgent}">
                    ${log.userAgent}
                  </td>
                </tr>
              `;
            }).join('')}
            ${(!data.logs || data.logs.length === 0) ? `<tr><td colspan="6" style="padding:24px; text-align:center; color:var(--text-muted);">No traffic logs captured yet.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
