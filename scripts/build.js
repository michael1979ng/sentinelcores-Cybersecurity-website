#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
//  SentinelCores SSG build.
//
//  Generates one real, fully pre-rendered static HTML file per
//  route — /, /news/, /news/<slug>/, /analysis/, /analysis/<slug>/,
//  /guides/, /guides/<slug>/, /threats/, /videos/ — so every
//  URL has real crawlable content, correct <title>/meta/canonical/OG
//  tags, and JSON-LD structured data in the raw HTML, not just
//  something the client JS renders after the fact.
//
//  The client-side script in index.html then "hydrates" over this
//  on load — re-rendering from the same data via the same shared
//  helpers (assets/render.js) — so first paint is real content and
//  everything after that is the normal single-page app, including
//  picking up live admin edits from JSONBin.
//
//  No dependencies — plain Node (18+, for global fetch).
// ═══════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const BIN_ID = process.env.JSONBIN_ID || "";
const API_KEY = process.env.JSONBIN_KEY || "";

const seed = require(path.join(ROOT, "assets", "seed-data.js"));
// render.js reads these as globals (same as it does `window.X` in the
// browser), so they must be set before any render.js function is called.
global.CATEGORY_NAMES = seed.CATEGORY_NAMES;
global.SECTION_CATEGORIES = seed.SECTION_CATEGORIES;
const R = require(path.join(ROOT, "assets", "render.js"));

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === "dist" || entry === "node_modules" || entry === ".git") continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function fetchCloudState() {
  if (!BIN_ID || !API_KEY) {
    console.log("[build] JSONBIN_ID/JSONBIN_KEY not set — shipping with the SEED_ARTICLES fallback only (no bake).");
    return null;
  }
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY, "X-Bin-Meta": "false" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("[build] Could not fetch JSONBin state, continuing without a bake:", err.message);
    return null;
  }
}

// Mirrors the client's applyState() merge rules exactly, so the
// build-time bake and the first client render agree.
function buildState(cloudState) {
  const site = Object.assign({}, seed.defaultSite(), (cloudState && cloudState.site) || {});
  const articles = cloudState && cloudState.articles && cloudState.articles.length ? cloudState.articles : seed.SEED_ARTICLES;
  const ticker = cloudState && cloudState.ticker && cloudState.ticker.length ? cloudState.ticker : seed.SEED_TICKER;
  const videos = cloudState && cloudState.videos ? cloudState.videos : seed.SEED_VIDEOS;
  const team = cloudState && cloudState.team && cloudState.team.length ? cloudState.team : seed.SEED_TEAM;
  return { site, articles, ticker, videos, team };
}

function published(articles) { return articles.filter((a) => !a.draft); }
function sorted(articles) { return articles.slice().sort((a, b) => new Date(b.date) - new Date(a.date)); }

const SECTION_LISTINGS = {
  news: { title: "News", desc: "Latest breaches, malware alerts, and vulnerability disclosures.", filterId: "newsFilters", gridId: "newsGrid" },
  analysis: { title: "Analysis", desc: "Deep dives and expert opinion on the stories that matter.", filterId: "analysisFilters", gridId: "analysisGrid" },
  guides: { title: "Guides", desc: "How-to security guidance for everyday users and teams.", filterId: "guidesFilters", gridId: "guidesGrid" },
};

function buildRoutes(state) {
  const routes = [
    { routePath: "/", kind: "home" },
    { routePath: "/news/", kind: "section", section: "news" },
    { routePath: "/analysis/", kind: "section", section: "analysis" },
    { routePath: "/guides/", kind: "section", section: "guides" },
    { routePath: "/threats/", kind: "threats" },
    { routePath: "/videos/", kind: "videos" },
  ];
  published(state.articles).forEach((a) => routes.push({ routePath: R.articlePath(a), kind: "article", article: a }));
  return routes;
}

// ── Small, targeted string-surgery helpers ──────────────────
// Every target below is a unique, controlled literal from our own
// template (see index.html), so exact/regex string replacement is
// reliable here without needing an HTML parser dependency.
function injectEmpty(html, emptyTag, content) {
  const idx = html.indexOf(emptyTag);
  if (idx === -1) throw new Error("[build] Expected to find template anchor: " + emptyTag);
  const closeIdx = idx + emptyTag.length;
  const closeTagStart = emptyTag.lastIndexOf("<");
  const opening = emptyTag.slice(0, closeTagStart);
  return html.slice(0, idx) + opening + content + emptyTag.slice(closeTagStart) + html.slice(closeIdx);
}
function setActivePage(html, pageId) {
  html = html.replace('class="page active" id="page-home"', 'class="page" id="page-home"');
  html = html.replace('class="page" id="page-' + pageId + '"', 'class="page active" id="page-' + pageId + '"');
  return html;
}
function setActiveNav(html, navId) {
  html = html.replace('class="hnl active" data-nav="home"', 'class="hnl" data-nav="home"');
  html = html.replace('class="hnl" data-nav="' + navId + '"', 'class="hnl active" data-nav="' + navId + '"');
  return html;
}
function applyMeta(html, opts) {
  return html.replace(/<title>[\s\S]*?<meta name="twitter:image"[^>]*>/, R.metaTagsHtml(opts));
}
function applyExtraJsonLd(html, extraNodes) {
  if (!extraNodes || !extraNodes.length) return html;
  const doc = { "@context": "https://schema.org", "@graph": extraNodes };
  const tag = '<script type="application/ld+json">' + JSON.stringify(doc).replace(/</g, "\\u003c") + "</script>\n</head>";
  return html.replace("</head>", tag);
}
function breadcrumbsFor(route, state) {
  const crumbs = [{ name: "Home", path: "/" }];
  if (route.kind === "section") crumbs.push({ name: SECTION_LISTINGS[route.section].title, path: route.routePath });
  else if (route.kind === "threats") crumbs.push({ name: "Threats", path: "/threats/" });
  else if (route.kind === "videos") crumbs.push({ name: "Videos", path: "/videos/" });
  else if (route.kind === "article") {
    const s = route.article.section;
    crumbs.push({ name: (SECTION_LISTINGS[s] && SECTION_LISTINGS[s].title) || s, path: "/" + s + "/" });
    crumbs.push({ name: route.article.title, path: route.routePath });
  }
  return crumbs.length > 1 ? [R.breadcrumbSchema(crumbs)] : [];
}

function renderRoute(baseHtml, route, state) {
  let html = baseHtml;
  const arts = published(state.articles);

  // Always-present chrome, pre-rendered on every route.
  html = html.replace("<!-- ADSENSE -->", R.adsenseTagsHtml(state.site.adsenseClientId));
  html = injectEmpty(html, '<div class="ticker-inner" id="tickerInner"></div>', R.tickerHtml(state.ticker));
  html = injectEmpty(html, '<div class="stats-boxes" id="statsBoxes"></div>', R.computedStatBoxesHtml(arts));
  html = injectEmpty(html, '<div id="threatMeter"></div>', R.threatMeterHtml(arts));
  html = injectEmpty(html, '<div id="trendingList"></div>', R.trendingListHtml(arts));
  html = injectEmpty(html, '<div id="followWidget"></div>', R.followWidgetHtml(state.site.socials));
  html = html.replace(/<p id="footTagline">[\s\S]*?<\/p>/, '<p id="footTagline">' + R.esc(state.site.footTagline) + "</p>");
  html = html.replace(
    /<div class="foot-col" id="footSocials">[\s\S]*?<\/div>/,
    '<div class="foot-col" id="footSocials">' + R.footerSocialsHtml(state.site.socials) + "</div>"
  );
  html = injectEmpty(html, '<div class="foot-bottom" id="footBottom"></div>', R.esc("© " + new Date().getFullYear() + " " + state.site.footBottomName + ". All rights reserved."));
  if (state.site.alertEnabled && state.site.alertTitle) {
    html = html.replace('<div class="breaking-bar" id="breakingBar" style="display:none">', '<div class="breaking-bar" id="breakingBar">');
    html = injectEmpty(html, '<div class="breaking-txt" id="breakingTxt"></div>', R.esc(state.site.alertTitle));
    html = html.replace('<div class="side-card alert-card" id="alertCard" style="display:none">', '<div class="side-card alert-card" id="alertCard">');
    html = injectEmpty(html, '<h4 id="alertTitle"></h4>', R.esc(state.site.alertTitle));
    html = injectEmpty(html, '<p id="alertBody"></p>', R.esc(state.site.alertBody));
  }

  // Home-only content (present on the base template already, but every
  // other route needs it deactivated + its own content still intact
  // underneath in case client JS re-shows it).
  const featured = arts.find((a) => a.featured) || arts[0];
  html = injectEmpty(html, '<div class="hero-feat" id="heroFeat"></div>', R.heroFeatHtml(featured));
  html = injectEmpty(html, '<div class="feed-list" id="latestFeed"></div>', sorted(arts).slice(0, 12).map(R.articleCardHtml).join(""));

  // Section listing grids + filter chips — always pre-rendered (not
  // just the current route's), so navigating client-side into one
  // never shows a flash of empty content while state re-renders.
  Object.keys(SECTION_LISTINGS).forEach((sec) => {
    const cfg = SECTION_LISTINGS[sec];
    const secArts = sorted(arts.filter((a) => a.section === sec));
    html = injectEmpty(html, '<div class="filter-row" id="' + cfg.filterId + '"></div>', R.filterChipsHtml(sec, ""));
    html = injectEmpty(html, '<div class="listing-grid" id="' + cfg.gridId + '"></div>', R.listingGridHtml(secArts));
  });
  const threatCats = R.threatCategories();
  const threatArts = sorted(arts.filter((a) => threatCats.indexOf(a.category) !== -1));
  html = injectEmpty(html, '<div class="filter-row" id="threatFilters"></div>', R.threatFilterChipsHtml(""));
  html = injectEmpty(html, '<div class="listing-grid" id="threatsGrid"></div>', R.listingGridHtml(threatArts));
  html = injectEmpty(html, '<div class="video-grid" id="videoGrid"></div>', R.videoGridHtml(state.videos));

  // Route-specific: active page/nav, meta tags, JSON-LD, and (for
  // article routes) the fully pre-rendered reader content.
  let metaOpts, jsonLdNodes = [];
  if (route.kind === "home") {
    metaOpts = { title: "SentinelCores — Cybersecurity News, Threat Intelligence & Practical Defense", description: "SentinelCores covers data breaches, malware alerts, vulnerability disclosures, and practical security guidance for everyday users and IT teams.", path: "/" };
  } else if (route.kind === "section") {
    const cfg = SECTION_LISTINGS[route.section];
    html = setActivePage(html, route.section);
    html = setActiveNav(html, route.section);
    metaOpts = { title: cfg.title + " — SentinelCores", description: cfg.desc, path: route.routePath };
    jsonLdNodes = breadcrumbsFor(route, state);
  } else if (route.kind === "threats") {
    html = setActivePage(html, "threats");
    html = setActiveNav(html, "threats");
    metaOpts = { title: "Threats — SentinelCores", description: "Coverage organized by threat type — ransomware, malware, data breaches, vulnerabilities, phishing, and nation-state activity.", path: "/threats/" };
    jsonLdNodes = breadcrumbsFor(route, state);
  } else if (route.kind === "videos") {
    html = setActivePage(html, "videos");
    html = setActiveNav(html, "videos");
    metaOpts = { title: "Videos — SentinelCores", description: "Explainers and briefings from the SentinelCores desk.", path: "/videos/" };
    jsonLdNodes = breadcrumbsFor(route, state);
  } else if (route.kind === "article") {
    const a = route.article;
    html = setActivePage(html, a.section);
    html = setActiveNav(html, a.section);
    html = html.replace('<div class="art-reader" id="artReader">', '<div class="art-reader open" id="artReader">');
    html = injectEmpty(html, '<div class="reader-body" id="readerBody"></div>', R.articleReaderHtml(a, R.relatedFor(a, arts, 3)));
    metaOpts = {
      title: a.title + " — SentinelCores", description: a.dek || a.excerpt, path: route.routePath, type: "article",
      image: R.ogImageFor(a), author: a.author, publishedTime: a.date, modifiedTime: a.dateModified || a.date,
    };
    jsonLdNodes = breadcrumbsFor(route, state).concat([R.newsArticleSchema(a)]);
  }

  html = applyMeta(html, metaOpts);
  html = applyExtraJsonLd(html, jsonLdNodes);
  return html;
}

function writeRoute(routePath, html) {
  const dir = path.join(OUT, routePath.replace(/^\//, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function buildSitemap(routes) {
  const now = new Date().toISOString();
  const urls = routes
    .map((r) => `  <url>\n    <loc>${R.absUrl(r.routePath)}</loc>\n    <lastmod>${(r.article && r.article.date) ? r.article.date : now}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildAdsTxt(site) {
  const pubId = R.adsPubId(site.adsenseClientId);
  if (!pubId) {
    return (
      "# No Google AdSense publisher ID configured yet.\n" +
      "# Once approved, set it in the admin's Monetization panel and\n" +
      "# this file will automatically contain the real line on the next build:\n" +
      "# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0\n"
    );
  }
  return `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
}

function ensureRobotsTxt() {
  const p = path.join(OUT, "robots.txt");
  const sitemapLine = `Sitemap: ${R.SITE_URL}/sitemap.xml`;
  let body = "User-agent: *\nAllow: /\nDisallow: /admin/\n\n" + sitemapLine + "\n";
  if (fs.existsSync(p)) {
    const existing = fs.readFileSync(p, "utf8");
    body = existing.indexOf("Sitemap:") === -1 ? existing.replace(/\s*$/, "\n\n") + sitemapLine + "\n" : existing;
  }
  fs.writeFileSync(p, body);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });

  console.log("[build] Copying static files to dist/ …");
  fs.mkdirSync(OUT, { recursive: true });
  for (const entry of fs.readdirSync(ROOT)) {
    if (["dist", "node_modules", ".git", ".gitignore", "scripts", ".github", "README.md"].includes(entry)) continue;
    if (entry.endsWith(".log")) continue;
    copyRecursive(path.join(ROOT, entry), path.join(OUT, entry));
  }

  const indexPath = path.join(OUT, "index.html");
  let baseHtml = fs.readFileSync(indexPath, "utf8");
  baseHtml = baseHtml.replace("__SENTINELCORES_BIN_ID__", BIN_ID);
  // <base href="/"> only belongs in the deployed output: it's what
  // lets nested routes (/news/<slug>/) still resolve /assets/render.js
  // correctly over real HTTP. It's deliberately absent from the
  // checked-in source index.html, which people open via file:// during
  // local preview — there, <base href="/"> would resolve relative
  // asset paths against the drive root instead of this folder.
  baseHtml = baseHtml.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<base href="/">');

  const cloudState = await fetchCloudState();
  const state = buildState(cloudState);
  if (cloudState) {
    const stateJson = JSON.stringify(cloudState).replace(/</g, "\\u003c");
    const preloadTag = `<script>window.__PRELOADED_STATE__ = ${stateJson};</script>\n`;
    baseHtml = baseHtml.replace('<script src="assets/render.js">', preloadTag + '<script src="assets/render.js">');
    console.log(`[build] Baked ${(cloudState.articles && cloudState.articles.length) || 0} live article(s) into every page.`);
  }

  const routes = buildRoutes(state);
  console.log(`[build] Generating ${routes.length} static routes …`);
  for (const route of routes) {
    const html = renderRoute(baseHtml, route, state);
    if (route.kind === "home") fs.writeFileSync(indexPath, html);
    else writeRoute(route.routePath, html);
  }

  // GitHub Pages serves this for any unmatched path (keeping the
  // requested URL), which lets the router in index.html's JS resolve
  // brand-new admin-authored articles that haven't been baked into a
  // static file yet — see routeFromLocation()'s post-cloud-fetch retry.
  fs.copyFileSync(indexPath, path.join(OUT, "404.html"));

  fs.writeFileSync(path.join(OUT, "sitemap.xml"), buildSitemap(routes));
  ensureRobotsTxt();
  fs.writeFileSync(path.join(OUT, "ads.txt"), buildAdsTxt(state.site));
  if (R.adsPubId(state.site.adsenseClientId)) console.log("[build] AdSense enabled — ads.txt and script tags baked in.");

  console.log("[build] Done — output in dist/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
