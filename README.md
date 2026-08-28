# SentinelCores

Independent coverage of breaches, malware alerts, and practical security
guidance — the rebrand of SecureXplore. Built the same way as this team's
other GitHub Pages site: **plain HTML/CSS/JS, no framework, no server**,
with a custom admin panel that writes to a small cloud JSON store so
changes appear on the live site immediately.

## Architecture

| Piece | What it is |
| ----- | ---------- |
| `index.html` | The entire public site — one file, vanilla JS, no build tool required to run it. |
| `admin/index.html` + `admin/admin.js` | The CMS — a password-gated single page that edits content and pushes it to the cloud. |
| `assets/seed-data.js` | Default/fallback content (including all 20 migrated SecureXplore articles), loaded by **both** of the above so the CMS starts from the same real content the site already shows. |
| [JSONBin.io](https://jsonbin.io) | The "database" — a free hosted JSON store. The admin panel writes to it; the public site reads from it. No server of your own. |
| `scripts/build.js` | The only build step: copies the static files to `dist/` and, if a JSONBin connection is configured, bakes the current live content into `index.html` for instant first paint and SEO. Plain Node, zero dependencies. |
| `.github/workflows/deploy.yml` | Runs the build and deploys `dist/` to GitHub Pages on every push to `main`, and again every 30 minutes so admin edits get baked in even without a new commit. |

**How publishing works:** an edit saved in `admin/` writes straight to your
JSONBin bin. The public site's own JavaScript reads that same bin on every
visit, so changes are live within seconds — no rebuild required. The
scheduled GitHub Actions rebuild is a freshness/SEO optimization on top of
that (baking the current state directly into the HTML crawlers see), not
something changes depend on to appear.

## Local development

No build step needed to just look at it:

```bash
npx serve .
```

Open the URL it prints. `admin/` is a normal path on the same server.

To test the actual deploy build:

```bash
node scripts/build.js
npx serve dist
```

## One-time setup

### 1. Connect a JSONBin (makes admin edits go live)

1. Create a free account at [jsonbin.io](https://jsonbin.io).
2. Create a new bin with any starter content (e.g. `{}`) and set its
   **visibility to Public** — this lets the public site read it without
   exposing your write key. Note the **Bin ID** and your **X-Master-Key**
   (Account → API Keys).
3. Open `admin/index.html` locally (or on the deployed site), sign in
   (default `admin` / `sentinel2026` — change this immediately, see
   below), go to **Cloud & Login**, paste in the Bin ID and API key, and
   click **Save Connection**, then **Push Current Data to Cloud Now** to
   seed the bin with the 20 migrated articles and default site copy.
4. For the GitHub Actions bake step to also pick up your bin, add two
   **repository secrets** (Settings → Secrets and variables → Actions):
   `JSONBIN_ID` and `JSONBIN_KEY`.

Until step 3 is done, the site runs fine on the hardcoded fallback content
in `assets/seed-data.js` — there's nothing broken about skipping this, it
just means admin edits only persist in that browser's `localStorage`
instead of going live for every visitor.

### 2. Change the admin login

The default admin login (`admin` / `sentinel2026`) is a placeholder — change
it the first time you sign in, from **Cloud & Login → Change Login**.

**Important caveat:** this is a client-side login screen only. It stops
casual visitors from finding the CMS, but the username/password check is
visible to anyone who views the page source — it is not a real security
boundary. Don't reuse a sensitive password, and don't rely on it to gate
anything more sensitive than "who can edit this blog."

### 3. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Repo Settings → Pages → Source → GitHub Actions.**
3. Push to `main` (or run the workflow manually) — `https://<you>.github.io/<repo>/` goes live.

**Using a custom domain?** Add a `CNAME` file at the repo root with your
domain (GitHub Pages reads it from the deploy source, so it needs to land
in `dist/` — simplest is adding it directly to the repo root and updating
`scripts/build.js`'s exclude list to *not* skip it, or just add it as an
extra `cp` step in the workflow).

## Content model

Everything the CMS manages lives in one JS object (`state`), matching the
shape in `assets/seed-data.js`:

- **Articles** — `title`, `dek` (hero/featured summary), `excerpt` (~10-word
  feed summary), `section` (`news` / `analysis` / `guides`), `category`
  (free-text slug — Data Breach, Ransomware, whatever you want), `author`,
  `date`, Markdown `body` (blank lines separate paragraphs, `##` for
  headings, `- ` for bullets), `tags`, `image` (optional — omit it for the
  generated icon card), `sourceName` (optional, name only, never a URL),
  `featured` (homepage hero), `trending` (sidebar list).
- **Ticker** — short headline strings scrolling across the top of every page.
- **Videos** — title + YouTube video ID, no API key needed.
- **Team** — name/role/bio, editable in the admin but not currently
  displayed anywhere on the public site (there's no About page).
- **Site** — hero headline/subheadline, the stats-strip title/subtitle
  (the four numbers themselves are computed live from real published
  articles, not editable), the sidebar security alert box, footer
  tagline/copyright, social links, and the newsletter form endpoint.

## Content migration from SecureXplore

All 20 posts from the old xsgsllc.com Blogger site were fetched directly
from the live pages and reproduced in `assets/seed-data.js` with their
original facts, quotes, and publish dates intact — every old
xsgsllc.com/Blogger URL stripped. Hero images were intentionally **not**
carried over: the old site's images were either hotlinked to Blogger's CDN
or were third-party press photos/logos (Toyota, AT&T, etc.) this project
holds no rights to re-host. Every migrated article instead renders a
generated icon card — add a real, licensed `image` URL per article from the
admin panel any time.

## Newsletter signup

There's no server to receive form posts, so the newsletter form on the
homepage posts to whatever URL you set as the **Newsletter form action**
in **Social & Newsletter** — any provider that accepts a standard HTML form
POST works (Formspree, Mailchimp, ConvertKit, Buttondown, ...). Until
that's set, the form renders disabled with an explanation.

## Branding

The logo (shield + circuit motif, navy/teal/gold) lives at
`assets/logo-full.jpg` for use as a full lockup (e.g. social sharing
images). The header/footer/favicon use a simplified inline SVG in the same
palette for crisp rendering at small sizes — see the `<svg>` markup near
the top of `index.html`'s `<header>`.
