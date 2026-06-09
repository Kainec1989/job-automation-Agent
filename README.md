# Job Automation Agent

Node.js/TypeScript pipeline for automated job search and applications on the German IT market (Junior Developer, Testautomatisierer, Praktikum).

**Author:** [Vladyslav Plugin](https://github.com/Kainec1989)

## Features

- **Scraping** — Indeed, Stepstone, LinkedIn via Playwright (system Chrome) + Arbeitsagentur (captcha-free JSON API)
- **Per-keyword search** — each keyword entry is searched as its own query (no over-constrained "match all words" search)
- **Resilient scraping** — soft-block/captcha detection with Telegram alerts, navigation retries, stale-session warnings
- **Full job descriptions** — fetches detail pages, not only listing snippets
- **IT classifier** — filters by tech stack, seniority, and non-IT roles
- **SQLite storage** — deduplicated vacancies (incl. cross-board dedup) with status tracking
- **Google Sheets sync** — export to Sheets, import HR emails back to DB
- **HR email lookup** — Tavily search/extract with caching (re-tries stale negatives) and API retries; one lookup per distinct company
- **Email dispatch** — tailored German cover letter (DIN 5008 PDF), CV, DCI certificate
- **LLM cover letters** — optional per-vacancy Anschreiben (PDF) **and** a short, natural inbox email body, with template fallback
- **Safety controls** — Telegram approval before sending, do-not-contact list, per-domain daily caps, dispatch history, DB backups
- **DB health & maintenance** — post-run health checks (backup freshness, dispatch history), migration ledger, incremental auto-vacuum
- **Stats** — rejection reasons per scrape run

## Tech Stack

| Area | Tools |
|------|--------|
| Runtime | Node.js 22+, TypeScript (ESM) |
| Scraping | Playwright, Google Chrome |
| Database | SQLite (`better-sqlite3`) |
| Email | Nodemailer, PDFKit |
| Integrations | Google Sheets API |

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env — SMTP, search keywords, paths

npm run db:init
npm run send:test        # test SMTP + PDF attachments
npm run pipeline:daily   # import → scrape → reclassify → sheets → tavily → dispatch
# Or step by step:
npm run scrape
npm run tavily:enrich -- --limit 5
npm run dispatch
```

## Main Scripts

| Command | Description |
|---------|-------------|
| `npm run scrape` | Run all enabled scrapers, classify, save to DB |
| `npm run db:init` | Initialize SQLite schema |
| `npm run db:cleanup` | Dedup contacted rows, clear bad emails, VACUUM |
| `npm run db:reclassify` | Re-run classifier on `status=new` vacancies; archive misfits |
| `npm run dispatch` | Send applications to vacancies with `status=new` and email |
| `npm run sheets:sync` | Push DB contents to Google Sheets |
| `npm run sheets:import` | Pull emails and status from Google Sheets into DB |
| `npm run lebenslauf:pdf` | Generate `assets/Lebenslauf.pdf` from `Lebenslauf.md` |
| `npm run auth:linkedin` | Save LinkedIn login session (recommended) |
| `npm run auth:indeed` | Save browser session for Indeed (anti-bot) |
| `npm run auth:status` | Check saved session files and cookie counts |
| `npm run tavily:enrich` | Tavily HR email lookup → save to DB |
| `npm run pipeline:daily` | Full daily run (see below) |
| `npm run test` | Unit tests (classifier, email, templates) |

## Daily pipeline

One command for the full workflow:

```bash
npm run pipeline:daily
```

Steps (in order):

1. **Sheets import** — pull manual emails/status from Google Sheets
2. **Scrape** — job boards → classify → SQLite
3. **Reclassify** — archive misfits, clean titles (`status=new` only)
4. **Tavily enrich** — find HR emails (if `TAVILY_ENABLED=true` + API key); propagates email to all `new` rows per company
5. **Dispatch** — send applications (`DISPATCH_LIMIT` per run); retries next day, `failed` after `DISPATCH_MAX_RETRIES`
6. **Sheets sync** — single export at the end (only when the DB changed)

Skip individual steps:

```bash
npm run pipeline:daily -- --skip-scrape --skip-dispatch   # enrich + sync only
npm run pipeline:daily -- --skip-tavily                   # no Tavily API calls
npm run pipeline:daily -- --skip-sheets-import            # skip pulling from Sheets
```

### Notifications

After each pipeline run, optional summary via email and/or Telegram:

```env
PIPELINE_NOTIFY_ENABLED=true
PIPELINE_NOTIFY_EMAIL=true
NOTIFY_EMAIL_TO=plugin.vg.co@gmail.com   # defaults to SMTP_USER
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Setup Telegram (one-time):

```bash
# 1. Telegram → @BotFather → /newbot → copy token to .env
# 2. Send /start to your bot
npm run telegram:setup    # prints your chat_id
# 3. Add TELEGRAM_CHAT_ID=... to .env
npm run notify:test       # sends a test message
```

### Safety controls & LLM cover letters

Optional guards around sending (see [`.env.example`](.env.example)):

```env
DISPATCH_REQUIRE_APPROVAL=false   # ask via Telegram ("да"/"нет") before sending a batch
DISPATCH_APPROVAL_TIMEOUT_MS=600000
DISPATCH_MAX_PER_DOMAIN_PER_DAY=1 # cap applications to one email domain per day (0 = off)
DO_NOT_CONTACT=                   # comma-separated company substrings, domains, or addresses
RESUME_PATH=./assets/Lebenslauf.pdf

# Optional LLM-generated Anschreiben (falls back to the template when off/unavailable)
LLM_ENABLED=false
LLM_PROVIDER=gemini               # gemini (free) | openai | anthropic
LLM_API_KEY=                      # Gemini key: https://aistudio.google.com/apikey
LLM_MODEL=                        # empty = provider default (gemini-2.5-flash)
LLM_BASE_URL=                     # OpenAI-compatible providers (Groq / OpenRouter)
# Fallback #1 — Groq (key: console.groq.com/keys)
LLM_FALLBACK_PROVIDER=openai
LLM_FALLBACK_API_KEY=gsk_...
LLM_FALLBACK_BASE_URL=https://api.groq.com/openai/v1
LLM_FALLBACK_MODEL=llama-3.3-70b-versatile
# Fallback #2 — OpenRouter :free (key: openrouter.ai/keys)
LLM_FALLBACK2_PROVIDER=openai
LLM_FALLBACK2_API_KEY=sk-or-...
LLM_FALLBACK2_BASE_URL=https://openrouter.ai/api/v1
LLM_FALLBACK2_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

Recommended free source: **Google Gemini** (AI Studio) — 1,500 requests/day, no credit card.
Set `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-2.5-flash`, key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
Fallback chain: `gemini-2.5-flash` → `gemini-2.0-flash` → Groq 70B → OpenRouter `:free` → template.

Add **Groq** and optionally **OpenRouter** keys to `LLM_FALLBACK_*` / `LLM_FALLBACK2_*` — both are OpenAI-compatible LLM APIs, not [Hermes Agent](https://github.com/NousResearch/hermes-agent).

Every send attempt (sent / failed / skipped) is recorded in the `dispatch_events` table, and
`scripts/run-daily-pipeline.sh` backs up the SQLite DB to `data/backups/` (keeps the newest 14).
After each run, health checks flag a missing/stale backup or dispatch history that failed to record,
and surface those warnings in the notification. Applied migrations are tracked in a `schema_migrations`
ledger, and the DB uses incremental `auto_vacuum` to stay compact.

Cron (12:00 daily):

```bash
bash scripts/install-cron.sh   # installs crontab entry
```

Manual run (same as cron):

```bash
bash scripts/run-daily-pipeline.sh
```

Logs: `logs/pipeline-YYYY-MM-DD.log` (one file per day, lock prevents overlap).

## Tavily (HR email lookup)

When job pages have no contact email, [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search) can find company career/impressum pages.

1. Create an API key at [app.tavily.com](https://app.tavily.com/)
2. Add `TAVILY_API_KEY=tvly-...` to `.env`
3. Test:

```bash
# One company
npm run tavily:lookup -- --company "thor consulting GmbH" --title "TypeScript Developer"

# Enrich top N DB vacancies (writes email to DB, syncs Sheets if configured)
npm run tavily:enrich -- --limit 3

# Preview without API calls / DB writes
npm run tavily:enrich -- --limit 5 --dry-run
```

Enrichment looks up **one representative vacancy per company** (saves API credits), then **propagates the found email** to all other `new` rows of that company.

Settings: `TAVILY_SEARCH_DEPTH` (`basic` = 1 credit), `TAVILY_MAX_RESULTS`, `TAVILY_MAX_LOOKUPS`, `TAVILY_MAX_QUERIES_PER_LOOKUP`, `TAVILY_EXTRACT_ENABLED` (fetch impressum/karriere pages when search snippets lack email), `TAVILY_MAX_EXTRACT_URLS`, `TAVILY_NEGATIVE_CACHE_TTL_DAYS` (re-try not-found companies after N days), `TAVILY_MAX_RETRIES`.

## Project Structure

```
src/
├── scraper/          # Indeed, Stepstone, LinkedIn, Arbeitsagentur + classifier
├── database/         # SQLite schema & repository
├── sender/           # Anschreiben templates, email, PDF
├── dispatcher/       # Application pipeline
├── sheets/           # Google Sheets sync
├── enrichment/       # Tavily email lookup
├── pipeline/         # Daily orchestration
└── tools/            # CV markdown → PDF, Tavily CLI
```

## Scraping stability

Indeed and LinkedIn often block headless browsers. Recommended setup:

```bash
BROWSER_HEADLESS=false npm run auth:linkedin   # visible browser — log in, saves ./data/linkedin-auth.json
npm run auth:indeed     # optional — accept cookies on Indeed
npm run auth:status     # verify session files
npm run scrape
```

- Recommended `SCRAPERS=stepstone,linkedin,arbeitsagentur` — Arbeitsagentur needs no browser/session
- Add `indeed` only after `npm run auth:indeed` — headless cron often gets HTTP 403
- **LinkedIn session checklist:** refresh every 2–4 weeks (or when `auth:status` / session probe fails):
  `BROWSER_HEADLESS=false npm run auth:linkedin`
- LinkedIn/Indeed sessions older than 7/5 days are flagged stale; refresh with `npm run auth:linkedin` / `auth:indeed`
- `DESCRIPTION_FETCH_CONCURRENCY=4` — parallel detail-page fetches (Stepstone/LinkedIn)
- Before a full LinkedIn run, a quick session probe skips the board when captcha/login wall is detected
- Session files in `./data/` are auto-detected even without `.env` paths
- If you get 403: set `BROWSER_HEADLESS=false` or increase `SEARCH_DELAY_MS`

## Configuration

See [`.env.example`](.env.example). Important variables:

- `SCRAPERS` — recommended `stepstone,linkedin,arbeitsagentur`; add `indeed` after `auth:indeed`
- `LINKEDIN_STORAGE_STATE` / `INDEED_STORAGE_STATE` — paths to saved sessions
- `KEYWORDS_JUNIOR` / `KEYWORDS_PRAKTIKUM` — comma-separated; **each entry is searched as its own query**, so use complete role phrases (e.g. `Junior Developer`), not single broad words like `Junior`
- `SEARCH_LOCATION` / `SEARCH_RADIUS_KM` — default: Leipzig, 150 km
- `FETCH_FULL_DESCRIPTION` — load full job text before classification
- `DESCRIPTION_FETCH_CONCURRENCY` — parallel detail fetches (default: 4)
- `EXTRACT_EMAIL` — parse HR emails from job pages into DB (default: on)
- `SCRAPE_MAX_PAGES` — pages per search URL (default: 3)
- `SCRAPE_PAGE_DELAY_MS` — delay between pages (default: 5000)
- `CHROME_PATH` — e.g. `/usr/bin/google-chrome`
- `DCI_CERTIFICATE_PATH` — optional 3rd PDF attachment

## Security

Never commit:

- `.env`
- `google-credentials.json`
- `data/*.db`
- personal PDFs in `assets/`

## License

MIT — portfolio / educational project.
