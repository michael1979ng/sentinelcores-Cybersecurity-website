'use strict';

// ═══════════════════════════════════════════════════════════
//  SentinelCores CMS — writes to the same JSONBin.io bin the
//  public site (../index.html) reads from. No server of its own.
// ═══════════════════════════════════════════════════════════

var ADMIN_USER = localStorage.getItem('sc_admin_user') || 'admin';
var ADMIN_PASS = localStorage.getItem('sc_admin_pass') || 'sentinel2026';

var BIN_ID = localStorage.getItem('sc_bin_id') || '';
var API_KEY = localStorage.getItem('sc_api_key') || '';
function cloudURL() { return 'https://api.jsonbin.io/v3/b/' + BIN_ID; }
function hasCloud() { return BIN_ID.length > 4 && API_KEY.length > 4; }

async function cloudRead() {
  if (!hasCloud()) return null;
  try {
    var r = await fetch(cloudURL() + '/latest', { headers: { 'X-Master-Key': API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).record || null;
  } catch (e) { return null; }
}
async function cloudWrite(data) {
  if (!hasCloud()) return false;
  try {
    var r = await fetch(cloudURL(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY, 'X-Bin-Versioning': 'false', 'X-Bin-Private': 'false' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(8000)
    });
    return r.ok;
  } catch (e) { return false; }
}
function updateCloudStatus() {
  [['cloud-dot', 'cloud-lbl'], ['cloud-dot-2', 'cloud-lbl-2']].forEach(function (ids) {
    var dot = document.getElementById(ids[0]), lbl = document.getElementById(ids[1]);
    if (!dot || !lbl) return;
    if (hasCloud()) { dot.className = 'sdot sdot-green'; lbl.textContent = 'Cloud connected — changes sync to the live site immediately.'; }
    else { dot.className = 'sdot sdot-amber'; lbl.textContent = 'Cloud not configured — set up a JSONBin connection in Cloud & Login.'; }
  });
}

// defaultSite(), SEED_ARTICLES, SEED_TICKER, SEED_VIDEOS, SEED_TEAM come
// from ../assets/seed-data.js (shared with the public site) — the CMS
// starts from the same real content already live, not an empty slate.
var state = { site: defaultSite(), articles: SEED_ARTICLES.slice(), ticker: SEED_TICKER.slice(), videos: SEED_VIDEOS.slice(), team: SEED_TEAM.slice() };

// The cloud bin only ever holds NEW or edited articles — not all 40 —
// to stay under JSONBin's free 100KB cap. The other articles keep
// coming from SEED_ARTICLES (baked in at build time). These two
// helpers mirror scripts/build.js's mergeArticles / index.html's
// client-side copy: merge cloud articles onto seed by id when reading,
// and compute just the delta (new or changed vs. seed) when writing.
function mergeArticles(seedArticles, cloudArticles) {
  // Always return a fresh array, never seedArticles itself — otherwise
  // state.articles ends up *aliasing* SEED_ARTICLES, and editing an
  // article here silently mutates the "seed baseline" computeCloudArticles
  // diffs against, so the diff always comes back empty and nothing syncs.
  if (!cloudArticles || !cloudArticles.length) return seedArticles.slice();
  var byId = {}, order = [];
  seedArticles.forEach(function (a) { byId[a.id] = a; order.push(a.id); });
  cloudArticles.forEach(function (a) { if (!(a.id in byId)) order.push(a.id); byId[a.id] = a; });
  return order.map(function (id) { return byId[id]; });
}
function computeCloudArticles() {
  var seedById = {};
  SEED_ARTICLES.forEach(function (a) { seedById[a.id] = a; });
  return state.articles.filter(function (a) {
    var seedA = seedById[a.id];
    return !seedA || JSON.stringify(a) !== JSON.stringify(seedA);
  });
}
function cloudPayload() {
  return { site: state.site, articles: computeCloudArticles(), ticker: state.ticker, videos: state.videos, team: state.team };
}

// Returns true (cloud push succeeded), false (cloud configured but the
// push failed — e.g. bad credentials, oversized payload), or null (no
// cloud configured, saved locally only) — callers use this to show an
// honest status instead of always claiming success.
async function saveState() {
  localStorage.setItem('sc_state', JSON.stringify(state));
  if (!hasCloud()) return null;
  return await cloudWrite(cloudPayload());
}

async function loadInitial() {
  var cloud = await cloudRead();
  if (cloud) {
    state.site = Object.assign(defaultSite(), cloud.site || {});
    state.articles = mergeArticles(SEED_ARTICLES, cloud.articles);
    if (cloud.ticker && cloud.ticker.length) state.ticker = cloud.ticker;
    if (cloud.videos) state.videos = cloud.videos;
    if (cloud.team && cloud.team.length) state.team = cloud.team;
  } else {
    try {
      var local = JSON.parse(localStorage.getItem('sc_state') || 'null');
      if (local) { Object.assign(state, local); state.site = Object.assign(defaultSite(), local.site || {}); }
    } catch (e) {}
  }
  renderEverything();
}

// ── Auth ──────────────────────────────────────────────
function doLogin() {
  var u = document.getElementById('lu').value.trim(), p = document.getElementById('lp').value;
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('cmsApp').style.display = 'block';
    sessionStorage.setItem('sc_authed', '1');
    loadInitial();
  } else {
    document.getElementById('loginErr').style.display = 'block';
  }
}
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('lp').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('logoutBtn').addEventListener('click', function () {
  sessionStorage.removeItem('sc_authed');
  location.reload();
});
if (sessionStorage.getItem('sc_authed') === '1') {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('cmsApp').style.display = 'block';
  loadInitial();
}

// ── Sidebar nav ───────────────────────────────────────
document.querySelectorAll('.sb-item').forEach(function (item) {
  item.addEventListener('click', function () {
    document.querySelectorAll('.sb-item').forEach(function (i) { i.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    item.classList.add('active');
    var panel = item.getAttribute('data-panel');
    document.getElementById('panel-' + panel).classList.add('active');
    document.getElementById('topbarTitle').textContent = item.textContent.trim();
  });
});
setInterval(function () { document.getElementById('topbarTime').textContent = new Date().toLocaleTimeString(); }, 1000);

// ── Helpers ───────────────────────────────────────────
function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function showMsg(id, text, ok) { var el = document.getElementById(id); el.textContent = text; el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-err'); setTimeout(function () { el.textContent = ''; }, 4000); }
function slugify(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80); }
function extractYoutubeId(input) {
  var s = String(input).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  var m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) || s.match(/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Render everything ─────────────────────────────────
function renderEverything() {
  updateCloudStatus(); renderDash(); renderArticleTable(); renderTicker(); renderVideos(); renderTeam(); fillSiteForm(); fillSocialsForm(); fillMonetizationForm(); fillCloudForm();
}

function renderDash() {
  document.getElementById('dashArticles').textContent = state.articles.length;
  document.getElementById('dashNews').textContent = state.articles.filter(function (a) { return a.section === 'news'; }).length;
  document.getElementById('dashAnalysis').textContent = state.articles.filter(function (a) { return a.section === 'analysis'; }).length;
  document.getElementById('dashGuides').textContent = state.articles.filter(function (a) { return a.section === 'guides'; }).length;
  var draftCount = state.articles.filter(function (a) { return a.draft; }).length;
  document.getElementById('dashDrafts').textContent = draftCount;
  var draftsCard = document.getElementById('dashDraftsCard');
  if (draftsCard) draftsCard.style.display = draftCount ? '' : 'none';
}

// ── Articles ──────────────────────────────────────────
function renderArticleTable() {
  // Drafts surface first regardless of date — the newest unreviewed
  // items shouldn't get buried under older, already-published ones.
  var sorted = state.articles.slice().sort(function (a, b) {
    if (!!a.draft !== !!b.draft) return a.draft ? -1 : 1;
    return new Date(b.date) - new Date(a.date);
  });
  var rows = sorted.map(function (a) {
    return '<tr' + (a.draft ? ' style="background:rgba(184,147,90,.07)"' : '') + '><td>' + escapeHtml(a.title) +
      (a.draft ? ' <span class="badge" style="background:rgba(184,147,90,.25);color:var(--gold)">Pending Review</span>' : '') +
      (a.featured ? ' <span class="badge badge-gold">Featured</span>' : '') + (a.trending ? ' <span class="badge badge-teal">Trending</span>' : '') + '</td>' +
      '<td>' + a.section + '</td><td>' + escapeHtml(a.category) + '</td><td>' + new Date(a.date).toLocaleDateString() + '</td>' +
      '<td>' + (a.draft ? '<button class="btn btn-gold" style="padding:4px 10px;font-size:11px" onclick="publishArticle(\'' + a.id + '\')">Publish</button> ' : '') +
      '<button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="editArticle(\'' + a.id + '\')">Edit</button> ' +
      '<button class="del-btn" onclick="deleteArticle(\'' + a.id + '\')">✕</button></td></tr>';
  }).join('');
  document.getElementById('artTableBody').innerHTML = rows || '<tr><td colspan="5" style="color:var(--gr);text-align:center;padding:20px">No articles yet.</td></tr>';
}
function publishArticle(id) {
  var a = state.articles.find(function (x) { return x.id === id; });
  if (!a) return;
  a.draft = false;
  saveState(); renderArticleTable(); renderDash();
  showMsg('art-msg', '✅ Published' + (hasCloud() ? ' & live on the site.' : ' locally — connect Cloud & Login to sync live.'), true);
}
function resetArticleForm() {
  document.getElementById('art-editing-id').value = '';
  document.getElementById('artFormTitle').textContent = 'New Article';
  ['title', 'category', 'author', 'severity', 'status', 'cve', 'dek', 'excerpt', 'takeaways', 'body', 'image', 'tags', 'source'].forEach(function (f) { document.getElementById('art-' + f).value = ''; });
  document.getElementById('art-author').value = 'SentinelCores Desk';
  document.getElementById('art-section').value = 'news';
  document.getElementById('art-featured').checked = false;
  document.getElementById('art-trending').checked = false;
  document.getElementById('art-draft').checked = false;
}
function editArticle(id) {
  var a = state.articles.find(function (x) { return x.id === id; });
  if (!a) return;
  document.getElementById('art-editing-id').value = a.id;
  document.getElementById('artFormTitle').textContent = 'Editing: ' + a.title;
  document.getElementById('art-title').value = a.title;
  document.getElementById('art-section').value = a.section;
  document.getElementById('art-category').value = a.category;
  document.getElementById('art-author').value = a.author;
  document.getElementById('art-severity').value = a.severity || '';
  document.getElementById('art-status').value = a.status || '';
  document.getElementById('art-cve').value = Array.isArray(a.cve) ? a.cve.join(', ') : (a.cve || '');
  document.getElementById('art-dek').value = a.dek;
  document.getElementById('art-excerpt').value = a.excerpt;
  document.getElementById('art-takeaways').value = (a.keyTakeaways || []).join('\n');
  document.getElementById('art-body').value = a.body;
  document.getElementById('art-image').value = a.image || '';
  document.getElementById('art-tags').value = (a.tags || []).join(', ');
  document.getElementById('art-source').value = a.sourceName || '';
  document.getElementById('art-featured').checked = !!a.featured;
  document.getElementById('art-trending').checked = !!a.trending;
  document.getElementById('art-draft').checked = !!a.draft;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function saveArticle() {
  var title = document.getElementById('art-title').value.trim();
  if (!title) { showMsg('art-msg', 'Title is required.', false); return; }
  var editingId = document.getElementById('art-editing-id').value;
  // Start from the existing article (if editing) so fields with no form
  // input — like the images[]/imageAlt inline-image data — survive a
  // save instead of being silently dropped by a from-scratch rebuild.
  var existing = editingId ? state.articles.find(function (a) { return a.id === editingId; }) : null;
  var data = Object.assign({}, existing, {
    id: editingId || slugify(title) + '-' + uid().slice(-6),
    section: document.getElementById('art-section').value,
    category: slugify(document.getElementById('art-category').value || 'general'),
    author: document.getElementById('art-author').value.trim() || 'SentinelCores Desk',
    date: existing ? existing.date : new Date().toISOString(),
    title: title,
    severity: document.getElementById('art-severity').value,
    status: document.getElementById('art-status').value.trim(),
    cve: document.getElementById('art-cve').value.split(',').map(function (c) { return c.trim(); }).filter(Boolean),
    dek: document.getElementById('art-dek').value.trim(),
    excerpt: document.getElementById('art-excerpt').value.trim(),
    keyTakeaways: document.getElementById('art-takeaways').value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean),
    body: document.getElementById('art-body').value,
    image: document.getElementById('art-image').value.trim(),
    tags: document.getElementById('art-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
    sourceName: document.getElementById('art-source').value.trim(),
    featured: document.getElementById('art-featured').checked,
    trending: document.getElementById('art-trending').checked,
    draft: document.getElementById('art-draft').checked
  });
  if (editingId) {
    var idx = state.articles.findIndex(function (a) { return a.id === editingId; });
    state.articles[idx] = data;
  } else {
    state.articles.unshift(data);
  }
  renderArticleTable(); renderDash(); resetArticleForm();
  var pushed = await saveState();
  showMsg('art-msg', pushed === false ? '⚠️ Saved locally, but the cloud push failed — check your Bin ID/API key in Cloud & Login.' : '✅ Saved' + (pushed ? ' & pushed to site!' : ' locally — connect Cloud & Login to sync live.'), pushed !== false);
}
async function deleteArticle(id) {
  if (!confirm('Delete this article? This cannot be undone.')) return;
  state.articles = state.articles.filter(function (a) { return a.id !== id; });
  renderArticleTable(); renderDash();
  await saveState();
}

// ── Ticker ────────────────────────────────────────────
function renderTicker() {
  document.getElementById('tickerListWrap').innerHTML = state.ticker.map(function (t, i) {
    return '<div class="ticker-item-row"><span>' + escapeHtml(t) + '</span><button class="del-btn" onclick="delTicker(' + i + ')">✕</button></div>';
  }).join('') || '<p style="color:var(--gr);font-size:13px;padding:14px 0">No ticker items yet.</p>';
}
function addTicker() {
  var v = document.getElementById('ticker-new').value.trim();
  if (!v) return;
  state.ticker.unshift(v);
  document.getElementById('ticker-new').value = '';
  saveState(); renderTicker();
}
function delTicker(i) { state.ticker.splice(i, 1); saveState(); renderTicker(); }

// ── Videos ────────────────────────────────────────────
function renderVideos() {
  document.getElementById('vidTableBody').innerHTML = state.videos.map(function (v, i) {
    return '<tr><td>' + escapeHtml(v.title) + '</td><td>' + escapeHtml(v.youtubeId) + '</td><td><button class="del-btn" onclick="delVideo(' + i + ')">✕</button></td></tr>';
  }).join('') || '<tr><td colspan="3" style="color:var(--gr);text-align:center;padding:20px">No videos yet.</td></tr>';
}
function addVideo() {
  var title = document.getElementById('vid-title').value.trim();
  var id = extractYoutubeId(document.getElementById('vid-id').value.trim());
  if (!title || !id) { alert('Enter a title and a valid YouTube URL or 11-character video ID.'); return; }
  state.videos.unshift({ title: title, youtubeId: id });
  document.getElementById('vid-title').value = ''; document.getElementById('vid-id').value = '';
  saveState(); renderVideos();
}
function delVideo(i) { state.videos.splice(i, 1); saveState(); renderVideos(); }

// ── Team ──────────────────────────────────────────────
function renderTeam() {
  document.getElementById('teamTableBody').innerHTML = state.team.map(function (m, i) {
    return '<tr><td>' + escapeHtml(m.name) + '</td><td>' + escapeHtml(m.role) + '</td><td><button class="del-btn" onclick="delTeam(' + i + ')">✕</button></td></tr>';
  }).join('') || '<tr><td colspan="3" style="color:var(--gr);text-align:center;padding:20px">No team members yet.</td></tr>';
}
function addTeam() {
  var name = document.getElementById('team-name').value.trim(), role = document.getElementById('team-role').value.trim(), bio = document.getElementById('team-bio').value.trim();
  if (!name) return;
  state.team.push({ name: name, role: role, bio: bio });
  document.getElementById('team-name').value = ''; document.getElementById('team-role').value = ''; document.getElementById('team-bio').value = '';
  saveState(); renderTeam();
}
function delTeam(i) { state.team.splice(i, 1); saveState(); renderTeam(); }

// ── Site content ──────────────────────────────────────
function fillSiteForm() {
  var s = state.site;
  document.getElementById('sc-heroTitle').value = s.heroTitle;
  document.getElementById('sc-heroSub').value = s.heroSub;
  document.getElementById('sc-statsTitle').value = s.statsTitle;
  document.getElementById('sc-statsSub').value = s.statsSub;
  document.getElementById('sc-alertEnabled').checked = !!s.alertEnabled;
  document.getElementById('sc-alertTitle').value = s.alertTitle;
  document.getElementById('sc-alertBody').value = s.alertBody;
  document.getElementById('sc-alertHref').value = s.alertHref;
  document.getElementById('sc-footTagline').value = s.footTagline;
  document.getElementById('sc-footBottomName').value = s.footBottomName;
}
async function saveSite() {
  var s = state.site;
  s.heroTitle = document.getElementById('sc-heroTitle').value.trim();
  s.heroSub = document.getElementById('sc-heroSub').value.trim();
  s.statsTitle = document.getElementById('sc-statsTitle').value.trim();
  s.statsSub = document.getElementById('sc-statsSub').value.trim();
  s.alertEnabled = document.getElementById('sc-alertEnabled').checked;
  s.alertTitle = document.getElementById('sc-alertTitle').value.trim();
  s.alertBody = document.getElementById('sc-alertBody').value.trim();
  s.alertHref = document.getElementById('sc-alertHref').value.trim();
  s.footTagline = document.getElementById('sc-footTagline').value.trim();
  s.footBottomName = document.getElementById('sc-footBottomName').value.trim();
  var pushed = await saveState();
  showMsg('sc-msg', pushed === false ? '⚠️ Saved locally, but the cloud push failed — check your Bin ID/API key in Cloud & Login.' : '✅ Saved' + (pushed ? ' & pushed to site!' : ' locally — connect Cloud & Login to sync live.'), pushed !== false);
}

// ── Socials ───────────────────────────────────────────
var SOCIAL_PLATFORMS = ['twitter', 'facebook', 'linkedin', 'instagram', 'youtube', 'telegram', 'mastodon', 'rss'];
function fillSocialsForm() {
  var s = state.site.socials || {};
  SOCIAL_PLATFORMS.forEach(function (p) {
    var entry = s[p] || {};
    var urlEl = document.getElementById('soc-' + p + '-url');
    var handleEl = document.getElementById('soc-' + p + '-handle');
    if (urlEl) urlEl.value = entry.url || '';
    if (handleEl) handleEl.value = entry.handle || '';
  });
  document.getElementById('soc-contact').value = state.site.contactEmail || '';
  document.getElementById('soc-nlAction').value = state.site.newsletterFormAction || '';
}
async function saveSocials() {
  var socials = {};
  SOCIAL_PLATFORMS.forEach(function (p) {
    var urlEl = document.getElementById('soc-' + p + '-url');
    var handleEl = document.getElementById('soc-' + p + '-handle');
    socials[p] = { url: (urlEl && urlEl.value.trim()) || '', handle: (handleEl && handleEl.value.trim()) || '' };
  });
  state.site.socials = socials;
  state.site.contactEmail = document.getElementById('soc-contact').value.trim();
  state.site.newsletterFormAction = document.getElementById('soc-nlAction').value.trim();
  var pushed = await saveState();
  showMsg('soc-msg', pushed === false ? '⚠️ Saved locally, but the cloud push failed — check your Bin ID/API key in Cloud & Login.' : '✅ Saved' + (pushed ? ' & pushed to site!' : ' locally.'), pushed !== false);
}

// ── Monetization (Google AdSense) ──────────────────────
function fillMonetizationForm() {
  document.getElementById('mon-adsenseClientId').value = state.site.adsenseClientId || '';
  updateMonetizationStatus();
}
function updateMonetizationStatus() {
  var dot = document.getElementById('mon-dot'), lbl = document.getElementById('mon-lbl');
  if (!dot || !lbl) return;
  if (state.site.adsenseClientId) { dot.className = 'sdot sdot-green'; lbl.textContent = 'Ads are on — Auto Ads enabled, ads.txt generated on the next build.'; }
  else { dot.className = 'sdot sdot-amber'; lbl.textContent = 'Ads are off — no publisher ID set yet.'; }
}
async function saveMonetization() {
  var id = document.getElementById('mon-adsenseClientId').value.trim();
  if (id && !/^ca-pub-\d+$/.test(id)) {
    showMsg('mon-msg', 'That doesn\'t look like a Publisher ID — it should look like ca-pub-1234567890123456.', false);
    return;
  }
  state.site.adsenseClientId = id;
  var pushed = await saveState();
  updateMonetizationStatus();
  showMsg('mon-msg', pushed === false ? '⚠️ Saved locally, but the cloud push failed — check your Bin ID/API key in Cloud & Login.' : '✅ Saved' + (pushed ? ' & pushed to site! Run a rebuild to bake ads.txt and the script tag into the static pages.' : ' locally — connect Cloud & Login to sync live.'), pushed !== false);
}

// ── Cloud settings ────────────────────────────────────
function fillCloudForm() {
  document.getElementById('set-binId').value = BIN_ID;
  document.getElementById('set-apiKey').value = API_KEY;
}
function saveCloudSettings() {
  BIN_ID = document.getElementById('set-binId').value.trim();
  API_KEY = document.getElementById('set-apiKey').value.trim();
  localStorage.setItem('sc_bin_id', BIN_ID);
  localStorage.setItem('sc_api_key', API_KEY);
  updateCloudStatus();
  showMsg('cloud-msg', hasCloud() ? '✅ Connected!' : 'Saved (both fields required to enable cloud sync).', true);
}
async function pushAllToCloud() {
  if (!hasCloud()) { showMsg('cloud-msg', 'Connect a Bin ID and API Key first.', false); return; }
  var ok = await cloudWrite(cloudPayload());
  showMsg('cloud-msg', ok ? '✅ Pushed current data to the cloud.' : 'Push failed — check your Bin ID/API key.', ok);
}

// ── Login change ──────────────────────────────────────
function changeLogin() {
  var u = document.getElementById('new-user').value.trim(), p = document.getElementById('new-pass').value;
  if (!u || !p || p.length < 8) { showMsg('login-msg', 'Enter a username and a password of at least 8 characters.', false); return; }
  ADMIN_USER = u; ADMIN_PASS = p;
  localStorage.setItem('sc_admin_user', u); localStorage.setItem('sc_admin_pass', p);
  document.getElementById('new-user').value = ''; document.getElementById('new-pass').value = '';
  showMsg('login-msg', '✅ Login updated for next sign-in.', true);
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
