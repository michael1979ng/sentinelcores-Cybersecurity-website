'use strict';
// ═══════════════════════════════════════════════════════════
//  Shared, DOM-free rendering helpers — the single source of
//  truth for turning article/site data into HTML strings.
//
//  Used by BOTH:
//   - index.html (client-side, in-browser rendering/re-rendering)
//   - scripts/build.js (Node, build-time static pre-rendering so
//     every real URL — /news/<slug>/ etc. — has actual crawlable
//     content in the raw HTML, not just JS-rendered on load)
//
//  Kept dependency-free and DOM-free on purpose: every function
//  here takes plain data in and returns a plain string out, so it
//  runs identically in a browser and in plain Node.
// ═══════════════════════════════════════════════════════════
(function (root) {

  function CAT_NAMES() { return root.CATEGORY_NAMES || {}; }
  function SEC_CATS() { return root.SECTION_CATEGORIES || {}; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function timeAgo(iso) {
    var d = new Date(iso), s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    var units = [[31557600, 'year'], [2629800, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (var i = 0; i < units.length; i++) {
      var v = Math.floor(s / units[i][0]);
      if (v >= 1) return v + ' ' + units[i][1] + (v === 1 ? '' : 's') + ' ago';
    }
    return 'just now';
  }
  function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
  function readingTime(md) { var words = String(md || '').trim().split(/\s+/).length; return Math.max(1, Math.round(words / 200)); }
  function catName(slug) { return CAT_NAMES()[slug] || slug; }
  function catHue(slug) { var h = 0; for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360; return h; }
  function catStyle(slug) { var h = catHue(slug); return 'color:hsl(' + h + ',45%,32%);background:hsl(' + h + ',55%,92%)'; }
  function iconForCat(slug) {
    var map = {
      'data-breaches': '&#128274;', ransomware: '&#128128;', vulnerabilities: '&#9888;', malware: '&#128027;',
      phishing: '&#127908;', cybercrime: '&#128373;', 'nation-state': '&#127760;', ddos: '&#9889;',
      'threat-intelligence': '&#128269;', 'security-research': '&#128300;', 'incident-analysis': '&#129513;', explainers: '&#128161;',
      privacy: '&#128737;', 'account-security': '&#128273;', 'windows-security': '&#129498;', 'mobile-security': '&#128241;', 'business-security': '&#127970;'
    };
    return map[slug] || '&#128272;';
  }
  // ── Threat-intel indicators: severity, CVE, incident status ─
  var SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];
  function severityBadgeHtml(sev) {
    if (!sev || SEVERITY_LEVELS.indexOf(sev) === -1) return '';
    var n = SEVERITY_LEVELS.indexOf(sev) + 1;
    var bars = '';
    for (var i = 1; i <= 4; i++) bars += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return '<span class="sev-badge sev-' + sev + '"><span class="sev-bars">' + bars + '</span>' + sev + '</span>';
  }
  function cveTagHtml(cve) {
    if (!cve) return '';
    var ids = Array.isArray(cve) ? cve : [cve];
    return ids.filter(Boolean).map(function (id) { return '<span class="cve-tag">' + esc(id) + '</span>'; }).join('');
  }
  var STATUS_DOT_CLASS = { active: 'live', ongoing: 'live', 'under investigation': 'warn', patched: 'ok', resolved: 'neutral' };
  function statusTagHtml(status) {
    if (!status) return '';
    var key = String(status).toLowerCase();
    var dot = STATUS_DOT_CLASS[key] || 'neutral';
    return '<span class="status-tag"><span class="status-dot ' + dot + '"></span>' + esc(status.toUpperCase()) + '</span>';
  }
  // The full threat-indicator row shown on cards and the reader —
  // severity + CVE + status together, only rendering what's present.
  function threatRowHtml(a) {
    var parts = [severityBadgeHtml(a.severity), cveTagHtml(a.cve), statusTagHtml(a.status)].filter(Boolean);
    return parts.length ? '<div class="tag-row">' + parts.join('') + '</div>' : '';
  }
  // Small stats-strip visualization: proportion of published articles
  // at each severity level, as a segmented bar + legend.
  function threatMeterHtml(articles) {
    var counts = { critical: 0, high: 0, medium: 0, low: 0 };
    var total = 0;
    (articles || []).forEach(function (a) { if (a.severity && counts.hasOwnProperty(a.severity)) { counts[a.severity]++; total++; } });
    if (!total) return '';
    var colorVar = { critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)' };
    var bar = SEVERITY_LEVELS.slice().reverse().map(function (lvl) {
      var pct = (counts[lvl] / total * 100).toFixed(1);
      return counts[lvl] ? '<span style="width:' + pct + '%;background:' + colorVar[lvl] + '"></span>' : '';
    }).join('');
    var legend = SEVERITY_LEVELS.slice().reverse().filter(function (lvl) { return counts[lvl]; }).map(function (lvl) {
      return '<span><i style="background:' + colorVar[lvl] + '"></i>' + counts[lvl] + ' ' + lvl.charAt(0).toUpperCase() + lvl.slice(1) + '</span>';
    }).join('');
    return '<div class="threat-meter"><div class="threat-meter-lbl"><span>Threat Level Mix</span><span>' + total + ' tracked</span></div>' +
      '<div class="threat-meter-bar">' + bar + '</div><div class="threat-meter-legend">' + legend + '</div></div>';
  }

  // images: optional [{url, alt}] — a body block that is just
  // "[IMAGE:1]" (1-indexed) on its own line renders as that inline
  // figure instead of a paragraph. Lets an article body place extra
  // photos/illustrations at chosen points, on top of the one hero
  // image every article already supports via a.image.
  function mdToHtml(md, images) {
    if (!md) return '';
    var blocks = String(md).split(/\n\s*\n/);
    return blocks.map(function (block) {
      var lines = block.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return '';
      var imgMatch = lines.length === 1 && lines[0].match(/^\[IMAGE:(\d+)\]$/);
      if (imgMatch && images && images[imgMatch[1] - 1]) {
        var img = images[imgMatch[1] - 1];
        var figClass = 'reader-inline-img' + (img.fit === 'contain' ? ' fit-contain' : '');
        return '<figure class="' + figClass + '"><img src="' + esc(img.url) + '" alt="' + esc(img.alt || '') + '">' +
          (img.alt ? '<figcaption>' + esc(img.alt) + '</figcaption>' : '') + '</figure>';
      }
      if (lines[0].indexOf('## ') === 0) return '<h3>' + inlineMd(lines[0].slice(3)) + '</h3>';
      if (lines.every(function (l) { return l.indexOf('- ') === 0; })) {
        return '<ul>' + lines.map(function (l) { return '<li>' + inlineMd(l.slice(2)) + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + inlineMd(lines.join(' ')) + '</p>';
    }).join('');
  }
  function inlineMd(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }

  // ── Routing paths ────────────────────────────────────────
  var SECTION_HREF = { home: '/', news: '/news/', threats: '/threats/', analysis: '/analysis/', guides: '/guides/', videos: '/videos/' };
  function sectionHref(id) { return SECTION_HREF[id] || '/'; }
  function articlePath(a) { return '/' + a.section + '/' + a.id + '/'; }

  function thumbInner(a) {
    if (a.image) return '<img src="' + esc(a.image) + '" alt="">';
    return '<div class="art-thumb-icon">' + iconForCat(a.category) + '</div>';
  }

  function articleCardHtml(a) {
    return '<a class="art-card" href="' + articlePath(a) + '" onclick="return navArticle(event,\'' + esc(a.id) + '\')">' +
      '<div class="art-thumb">' + thumbInner(a) + '</div>' +
      '<div class="art-body"><div class="art-card-top"><span class="cat-tag" style="' + catStyle(a.category) + '">' + esc(catName(a.category)) + '</span>' +
      severityBadgeHtml(a.severity) +
      '<span class="art-time">' + timeAgo(a.date) + '</span></div>' +
      '<h3>' + esc(a.title) + '</h3><p>' + esc(a.excerpt) + '</p></div></a>';
  }

  function gridCardHtml(a) {
    return '<a class="grid-card" href="' + articlePath(a) + '" onclick="return navArticle(event,\'' + esc(a.id) + '\')"><div class="grid-card-img">' +
      (a.image ? '<img src="' + esc(a.image) + '" alt="">' : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;opacity:.35;color:#fff">' + iconForCat(a.category) + '</div>') +
      '</div><div class="grid-card-body"><div class="tag-row"><span class="cat-tag" style="' + catStyle(a.category) + '">' + esc(catName(a.category)) + '</span>' +
      severityBadgeHtml(a.severity) + '</div>' +
      '<h3>' + esc(a.title) + '</h3><p>' + esc(a.excerpt) + '</p></div></a>';
  }

  function listingGridHtml(articles) {
    return articles.map(gridCardHtml).join('') || '<p class="empty-note">No articles published here yet.</p>';
  }

  function trendItemHtml(a, i) {
    return '<a class="trend-item" href="' + articlePath(a) + '" onclick="return navArticle(event,\'' + esc(a.id) + '\')"><span class="trend-num">' + (i + 1) + '</span><h4>' + esc(a.title) + '</h4></a>';
  }
  function trendingListHtml(articles) {
    var flagged = articles.filter(function (a) { return a.trending; });
    var rest = articles.filter(function (a) { return !a.trending; }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return flagged.concat(rest).slice(0, 5).map(trendItemHtml).join('');
  }

  function heroFeatHtml(featured) {
    if (!featured) return '';
    return '<a class="hero-feat" href="' + articlePath(featured) + '" onclick="return navArticle(event,\'' + esc(featured.id) + '\')">' +
      '<div class="hero-feat-img" style="' + (featured.image ? '' : 'background:linear-gradient(135deg,var(--navy),var(--teal-d))') + '">' +
      (featured.image ? '<img src="' + esc(featured.image) + '" alt="">' : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;opacity:.35">' + iconForCat(featured.category) + '</div>') +
      '</div><div class="hero-feat-body"><div class="tag-row">' +
      '<span class="cat-tag" style="' + catStyle(featured.category) + '">' + esc(catName(featured.category)) + '</span>' +
      severityBadgeHtml(featured.severity) + cveTagHtml(featured.cve) + '</div>' +
      '<h2>' + esc(featured.title) + '</h2><p>' + esc(featured.dek) + '</p>' +
      '<div class="hero-meta"><span>' + timeAgo(featured.date) + '</span><span>' + readingTime(featured.body) + ' min read</span></div>' +
      '<span class="read-more">Read More &rarr;</span></div></a>';
  }

  function takeawaysHtml(items) {
    if (!items || !items.length) return '';
    return '<div class="takeaways-box"><h4>Key Takeaways</h4><ul>' +
      items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
      '</ul></div>';
  }

  function shareBarHtml(slug) {
    var id = esc(slug);
    var btn = function (net, label, glyph) {
      return '<button class="share-btn" title="Share on ' + label + '" aria-label="Share on ' + label + '" onclick="shareArticle(\'' + net + '\',\'' + id + '\')">' + glyph + '</button>';
    };
    return '<div class="share-bar"><span class="share-label">Share</span>' +
      btn('x', 'X', 'X') +
      btn('linkedin', 'LinkedIn', 'in') +
      btn('facebook', 'Facebook', 'f') +
      btn('reddit', 'Reddit', '&#128125;') +
      btn('bluesky', 'Bluesky', '&#129419;') +
      btn('threads', 'Threads', '&#129525;') +
      btn('copy', 'Copy Link', '&#128279;') +
      '</div>';
  }

  function articleReaderHtml(a, related) {
    related = related || [];
    return '<div class="tag-row"><span class="cat-tag" style="' + catStyle(a.category) + '">' + esc(catName(a.category)) + '</span>' +
      severityBadgeHtml(a.severity) + cveTagHtml(a.cve) + '</div>' +
      '<h1>' + esc(a.title) + '</h1><p class="reader-dek">' + esc(a.dek) + '</p>' +
      takeawaysHtml(a.keyTakeaways) +
      '<div class="reader-meta"><span>' + esc(a.author) + '</span><span>' + fmtDate(a.date) + '</span><span>' + readingTime(a.body) + ' min read</span>' + statusTagHtml(a.status) + '</div>' +
      shareBarHtml(a.id) +
      (a.image ? '<div class="reader-img"><img src="' + esc(a.image) + '" alt="' + esc(a.imageAlt || '') + '"></div>' : '') +
      '<div class="reader-content">' + mdToHtml(a.body, a.images) + '</div>' +
      (a.sourceName ? '<div class="reader-source">Originally reported via ' + esc(a.sourceName) + '.</div>' : '') +
      (a.tags && a.tags.length ? '<div class="reader-tags">' + a.tags.map(function (t) { return '<span class="tag-pill">#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      (related.length ? '<div class="related-sec"><h3>Related Coverage</h3><div class="feed-list">' + related.map(articleCardHtml).join('') + '</div></div>' : '');
  }

  function relatedFor(a, allArticles, n) {
    return allArticles.filter(function (x) { return x.category === a.category && x.id !== a.id; }).slice(0, n || 3);
  }

  // ── Category filter chips (News/Analysis/Guides + Threats) ─
  function filterChipsHtml(section, activeCat) {
    var cats = SEC_CATS()[section] || [];
    var html = '<button class="filter-chip' + (activeCat ? '' : ' active') + '" data-cat="" onclick="filterSection(this,\'' + section + '\',\'\')">All</button>';
    cats.forEach(function (c) {
      html += '<button class="filter-chip' + (activeCat === c.slug ? ' active' : '') + '" data-cat="' + esc(c.slug) + '" onclick="filterSection(this,\'' + section + '\',\'' + esc(c.slug) + '\')">' + esc(c.name) + '</button>';
    });
    return html;
  }
  function threatCategories() { return (SEC_CATS().news || []).map(function (c) { return c.slug; }); }
  function threatFilterChipsHtml(activeCat) {
    var html = '<button class="filter-chip' + (activeCat ? '' : ' active') + '" data-cat="" onclick="filterThreats(this,\'\')">All Threats</button>';
    threatCategories().forEach(function (slug) {
      html += '<button class="filter-chip' + (activeCat === slug ? ' active' : '') + '" data-cat="' + esc(slug) + '" onclick="filterThreats(this,\'' + esc(slug) + '\')">' + esc(catName(slug)) + '</button>';
    });
    return html;
  }

  // ── Videos / Team / Stats / Footer ──────────────────────
  function videoCardHtml(vid) {
    return '<a class="video-card" href="https://www.youtube.com/watch?v=' + esc(vid.youtubeId) + '" target="_blank" rel="noopener">' +
      '<div class="video-thumb"><img src="https://img.youtube.com/vi/' + esc(vid.youtubeId) + '/hqdefault.jpg" alt=""><div class="video-play">&#9658;</div></div>' +
      '<h4>' + esc(vid.title) + '</h4></a>';
  }
  function videoGridHtml(videos) {
    return videos && videos.length ? videos.map(videoCardHtml).join('') : '<p class="empty-note">No videos added yet.</p>';
  }
  // Homepage strip: newest 4 only. New videos are unshift()'d onto the
  // front of state.videos when added in the admin, so the array is
  // already newest-first — a 5th video simply falls off this slice
  // without being removed from state, and stays reachable on /videos/.
  function homeVideosHtml(videos) {
    return videoGridHtml((videos || []).slice(0, 4));
  }
  function teamCardHtml(m) {
    return '<div class="team-card"><h4>' + esc(m.name) + '</h4><div class="role">' + esc(m.role) + '</div><p>' + esc(m.bio) + '</p></div>';
  }
  function teamGridHtml(team) { return (team || []).map(teamCardHtml).join(''); }
  // Every number here is a live count over the actual published
  // article set — nothing typed in by an editor, nothing estimated.
  // Anyone can verify these by counting the site's own content.
  function computedStatBoxesHtml(articles) {
    var list = articles || [];
    var critical = list.filter(function (a) { return a.severity === 'critical'; }).length;
    var cveCount = list.filter(function (a) { return a.cve && (Array.isArray(a.cve) ? a.cve.length : true); }).length;
    var categories = {};
    list.forEach(function (a) { if (a.category) categories[a.category] = true; });
    var stats = [
      { value: String(list.length), label: 'Articles Published' },
      { value: String(critical), label: 'Critical Incidents' },
      { value: String(cveCount), label: 'CVEs Documented' },
      { value: String(Object.keys(categories).length), label: 'Threat Categories' }
    ];
    return stats.map(function (s) { return '<div class="stat-box"><strong>' + esc(s.value) + '</strong><small>' + esc(s.label) + '</small></div>'; }).join('');
  }
  function tickerHtml(items) {
    var list = items && items.length ? items : ['No live items yet — add some from the admin Ticker panel.'];
    var html = list.map(function (t) { return '<span class="ti">' + esc(t) + '</span>'; }).join('');
    return html + html;
  }
  // Platform metadata used by both the footer link list and the sidebar
  // Follow widget, so a platform only has to be defined once. Emoji icons
  // match this site's existing convention (side-titles, alert bar, etc.)
  // rather than pulling in an SVG icon set for one small widget.
  var SOCIAL_META = {
    twitter: { icon: '𝕏', label: 'X / Twitter' },
    facebook: { icon: '📘', label: 'Facebook' },
    linkedin: { icon: '💼', label: 'LinkedIn' },
    instagram: { icon: '📷', label: 'Instagram' },
    youtube: { icon: '▶️', label: 'YouTube' },
    telegram: { icon: '✈️', label: 'Telegram' },
    mastodon: { icon: '🐘', label: 'Mastodon' },
    rss: { icon: '📡', label: 'RSS' }
  };
  function socialEntries(socials) {
    return Object.keys(socials || {}).map(function (k) {
      var s = socials[k] || {};
      var meta = SOCIAL_META[k] || { icon: '🔗', label: k };
      return { key: k, url: s.url, handle: s.handle || meta.label, icon: meta.icon };
    }).filter(function (e) { return e.url; });
  }
  function footerSocialsHtml(socials) {
    var entries = socialEntries(socials);
    var html = '<h4>Connect</h4>';
    entries.forEach(function (e) {
      html += '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + e.icon + ' ' + esc(e.handle) + '</a>';
    });
    return html;
  }
  // Sidebar "Follow Us" widget — one clickable pill per configured
  // platform, icon + handle, linking straight out to the profile.
  // Renders an empty-state note (rather than nothing) when no platform
  // has been configured yet, so an editor sees why the widget is blank.
  function followWidgetHtml(socials) {
    var entries = socialEntries(socials);
    if (!entries.length) return '<p class="empty-note">Add your social links in the admin Social panel.</p>';
    return '<div class="follow-list">' + entries.map(function (e) {
      return '<a class="follow-item" href="' + esc(e.url) + '" target="_blank" rel="noopener">' +
        '<span class="follow-icon">' + e.icon + '</span>' +
        '<span class="follow-handle">' + esc(e.handle) + '</span>' +
        '</a>';
    }).join('') + '</div>';
  }

  // ── Google AdSense ───────────────────────────────────────
  // Auto ads (not manually-placed ad units): one script tag lets
  // Google's own placement engine choose positions and density,
  // rather than us guessing slot-by-slot — and there's no per-unit
  // ad-slot ID to configure before an AdSense account even exists.
  // Renders to nothing at all when no client ID is set.
  function adsenseTagsHtml(clientId) {
    if (!clientId) return '';
    var id = esc(clientId);
    return '<meta name="google-adsense-account" content="' + id + '">\n' +
      '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + id + '" crossorigin="anonymous"></script>';
  }
  function adsPubId(clientId) {
    // "ca-pub-1234567890123456" -> "pub-1234567890123456" (ads.txt format)
    return clientId ? clientId.replace(/^ca-/, '') : '';
  }

  // ── SEO: meta tags + JSON-LD structured data ────────────
  var SITE_URL = 'https://sentinelcores.org';
  var SITE_NAME = 'SentinelCores';
  var DEFAULT_OG_IMAGE = { url: SITE_URL + '/assets/logo-full.jpg', width: 1408, height: 768 };

  function absUrl(path) { return SITE_URL + path; }

  function ogImageFor(a) {
    // Per-article images (once generated) have unknown dimensions, so
    // width/height are only emitted for the known default asset — both
    // are valid per the OG spec, which treats width/height as optional.
    if (a && a.image) return { url: /^https?:\/\//.test(a.image) ? a.image : absUrl(a.image) };
    return DEFAULT_OG_IMAGE;
  }

  // Builds the block of <title>/meta/canonical/OG/Twitter tags for one
  // route. Returned as a raw HTML string meant to replace the
  // equivalent block in the page <head>.
  function metaTagsHtml(opts) {
    var url = absUrl(opts.path);
    var image = opts.image || DEFAULT_OG_IMAGE;
    var lines = [
      '<title>' + esc(opts.title) + '</title>',
      '<meta name="description" content="' + esc(opts.description) + '">',
      '<meta name="keywords" content="cybersecurity news, data breach, malware, ransomware, vulnerability, threat intelligence, security guides">',
      '<meta name="robots" content="index, follow">',
      '<meta name="author" content="' + esc(opts.author || SITE_NAME) + '">',
      '<link rel="canonical" href="' + url + '">',
      '<meta property="og:type" content="' + (opts.type || 'website') + '">',
      '<meta property="og:title" content="' + esc(opts.title) + '">',
      '<meta property="og:description" content="' + esc(opts.description) + '">',
      '<meta property="og:site_name" content="' + SITE_NAME + '">',
      '<meta property="og:url" content="' + url + '">',
      '<meta property="og:image" content="' + esc(image.url) + '">'
    ];
    if (image.width) lines.push('<meta property="og:image:width" content="' + image.width + '">');
    if (image.height) lines.push('<meta property="og:image:height" content="' + image.height + '">');
    lines.push('<meta name="twitter:card" content="summary_large_image">');
    lines.push('<meta name="twitter:title" content="' + esc(opts.title) + '">');
    lines.push('<meta name="twitter:description" content="' + esc(opts.description) + '">');
    lines.push('<meta name="twitter:image" content="' + esc(image.url) + '">');
    if (opts.publishedTime) lines.push('<meta property="article:published_time" content="' + opts.publishedTime + '">');
    if (opts.modifiedTime) lines.push('<meta property="article:modified_time" content="' + opts.modifiedTime + '">');
    return lines.join('\n');
  }

  function orgSchema() {
    return {
      '@type': 'Organization',
      '@id': SITE_URL + '/#organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: DEFAULT_OG_IMAGE.url, width: DEFAULT_OG_IMAGE.width, height: DEFAULT_OG_IMAGE.height }
    };
  }
  function websiteSchema() {
    return {
      '@type': 'WebSite',
      '@id': SITE_URL + '/#website',
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { '@id': SITE_URL + '/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: SITE_URL + '/?s={search_term_string}' },
        'query-input': 'required name=search_term_string'
      }
    };
  }
  // A byline like "SentinelCores Desk" is an editorial desk, not a named
  // individual — schema.org Person would misrepresent it. Only bylines
  // that read as an actual person's name get typed as Person; anything
  // that looks like a desk/brand byline is typed as Organization instead.
  function isDeskByline(name) { return /\bdesk\b/i.test(name || '') || name === SITE_NAME; }
  function authorSchema(name) {
    if (isDeskByline(name)) return { '@type': 'Organization', name: name || SITE_NAME };
    return { '@type': 'Person', name: name };
  }
  // Team-page entries follow the same desk/individual distinction as
  // article bylines: a real name gets Person + jobTitle/worksFor; a
  // desk/brand entry is typed as Organization instead, since "Person"
  // would misrepresent it as a named individual.
  function personSchema(member) {
    if (isDeskByline(member.name)) return { '@type': 'Organization', name: member.name, description: member.bio };
    return { '@type': 'Person', name: member.name, jobTitle: member.role, description: member.bio, worksFor: { '@id': SITE_URL + '/#organization' } };
  }
  function breadcrumbSchema(crumbs) {
    // crumbs: [{name, path}] in order, path relative (e.g. '/news/')
    return {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map(function (c, i) {
        return { '@type': 'ListItem', position: i + 1, name: c.name, item: absUrl(c.path) };
      })
    };
  }
  function newsArticleSchema(a) {
    var image = ogImageFor(a);
    return {
      '@type': 'NewsArticle',
      '@id': absUrl(articlePath(a)) + '#article',
      headline: a.title,
      description: a.dek,
      image: [image.url],
      datePublished: a.date,
      dateModified: a.dateModified || a.date,
      author: authorSchema(a.author),
      publisher: { '@id': SITE_URL + '/#organization' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': absUrl(articlePath(a)) },
      articleSection: catName(a.category),
      keywords: (a.tags || []).join(', ')
    };
  }
  // Wraps one or more schema objects in a single @graph JSON-LD block,
  // always anchored by Organization + WebSite so every page identifies
  // the publisher (required for NewsArticle rich-result eligibility).
  function jsonLdHtml(extraNodes) {
    var graph = [orgSchema(), websiteSchema()].concat(extraNodes || []);
    var doc = { '@context': 'https://schema.org', '@graph': graph };
    return '<script type="application/ld+json">' + JSON.stringify(doc) + '</script>';
  }

  var R = {
    esc: esc, timeAgo: timeAgo, fmtDate: fmtDate, readingTime: readingTime,
    catName: catName, catHue: catHue, catStyle: catStyle, iconForCat: iconForCat,
    mdToHtml: mdToHtml, inlineMd: inlineMd,
    sectionHref: sectionHref, articlePath: articlePath,
    thumbInner: thumbInner, articleCardHtml: articleCardHtml, gridCardHtml: gridCardHtml, listingGridHtml: listingGridHtml,
    trendItemHtml: trendItemHtml, trendingListHtml: trendingListHtml, heroFeatHtml: heroFeatHtml,
    takeawaysHtml: takeawaysHtml, shareBarHtml: shareBarHtml, articleReaderHtml: articleReaderHtml, relatedFor: relatedFor,
    filterChipsHtml: filterChipsHtml, threatCategories: threatCategories, threatFilterChipsHtml: threatFilterChipsHtml,
    videoCardHtml: videoCardHtml, videoGridHtml: videoGridHtml, homeVideosHtml: homeVideosHtml, teamCardHtml: teamCardHtml, teamGridHtml: teamGridHtml,
    computedStatBoxesHtml: computedStatBoxesHtml, tickerHtml: tickerHtml, footerSocialsHtml: footerSocialsHtml, followWidgetHtml: followWidgetHtml,
    SITE_URL: SITE_URL, SITE_NAME: SITE_NAME, DEFAULT_OG_IMAGE: DEFAULT_OG_IMAGE, absUrl: absUrl, ogImageFor: ogImageFor,
    metaTagsHtml: metaTagsHtml, orgSchema: orgSchema, websiteSchema: websiteSchema, authorSchema: authorSchema,
    personSchema: personSchema, breadcrumbSchema: breadcrumbSchema, newsArticleSchema: newsArticleSchema, jsonLdHtml: jsonLdHtml,
    severityBadgeHtml: severityBadgeHtml, cveTagHtml: cveTagHtml, statusTagHtml: statusTagHtml, threatRowHtml: threatRowHtml, threatMeterHtml: threatMeterHtml,
    adsenseTagsHtml: adsenseTagsHtml, adsPubId: adsPubId
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  Object.keys(R).forEach(function (k) { root[k] = R[k]; });

})(typeof window !== 'undefined' ? window : global);
