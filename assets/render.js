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
  function inlineMd(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

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

  // Real brand marks (simplified single-path SVGs, fill="currentColor")
  // instead of the old mix of plain-text letters and generic emoji —
  // emoji in particular never picked up the button's hover color swap
  // since emoji glyphs ignore CSS `color`, which is why the old bar
  // looked inconsistent on hover as well as dated.
  var SHARE_ICONS = {
    x: '<path d="M18.9 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.65h2.039L6.486 3.24H4.298Z"/>',
    linkedin: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
    facebook: '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 1.828-.287 1.839H13.46v7.98H9.101Z"/>',
    reddit: '<path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.248 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.249-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095Z"/>',
    bluesky: '<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364 3.912.58 7.387 2.005 2.83 7.078-5.013 5.19-6.87-1.113-7.823-4.308-.953 3.195-2.05 9.271-7.733 4.308-4.267-4.308-1.172-6.498 2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.203-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/>',
    threads: '<path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.028-3.579.878-6.43 2.523-8.481C5.845 1.205 8.599.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.319-6.015-2.973.022-5.221.936-6.68 2.717-1.365 1.667-2.07 4.098-2.093 7.226.023 3.126.728 5.557 2.093 7.225 1.459 1.781 3.707 2.694 6.68 2.716 2.68-.02 4.458-.65 5.947-2.106 1.7-1.658 1.67-3.7 1.13-4.907-.32-.717-.899-1.318-1.688-1.774-.198 1.403-.645 2.523-1.336 3.343-.912 1.084-2.207 1.675-3.85 1.706-1.247.024-2.443-.274-3.37-.84-1.098-.669-1.73-1.694-1.78-2.888-.048-1.164.406-2.235 1.278-3.017.833-.748 2.013-1.183 3.416-1.257a13.75 13.75 0 0 1 3.114.166c-.128-.782-.396-1.402-.8-1.848-.556-.617-1.416-.932-2.558-.939h-.033c-.917 0-2.148.253-2.937 1.457l-1.72-1.18c1.06-1.605 2.784-2.489 4.86-2.489h.043c3.474.022 5.543 2.14 5.75 5.855.118.05.234.101.348.155 1.617.762 2.798 1.916 3.417 3.339.86 1.975.938 5.198-1.657 7.706-1.9 1.834-4.203 2.66-7.462 2.683Zm1.106-11.083c-.253 0-.51.007-.77.023-1.874.106-3.043 1.002-2.976 2.283.07 1.34 1.499 1.963 2.873 1.893 1.253-.062 2.887-.556 3.164-3.755a10.9 10.9 0 0 0-2.291-.444Z"/>',
    copy: '<path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.41z"/>'
  };
  function shareIconSvg(net) {
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">' + SHARE_ICONS[net] + '</svg>';
  }
  function shareBarHtml(slug) {
    var id = esc(slug);
    var btn = function (net, label) {
      return '<button class="share-btn" title="Share on ' + label + '" aria-label="Share on ' + label + '" onclick="shareArticle(\'' + net + '\',\'' + id + '\')">' + shareIconSvg(net) + '</button>';
    };
    return '<div class="share-bar"><span class="share-label">Share</span>' +
      btn('x', 'X') +
      btn('linkedin', 'LinkedIn') +
      btn('facebook', 'Facebook') +
      btn('reddit', 'Reddit') +
      btn('bluesky', 'Bluesky') +
      btn('threads', 'Threads') +
      btn('copy', 'Copy Link') +
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
    reddit: { icon: '👽', label: 'Reddit' },
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
