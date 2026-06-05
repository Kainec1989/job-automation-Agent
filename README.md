# Job Automation Agent

Node.js/TypeScript pipeline for automated job search and applications on the German IT market (Junior Developer, Testautomatisierer, Praktikum).

**Author:** [Vladyslav Plugin](https://github.com/Kainec1989)

## Features

- **Scraping** — Indeed, Stepstone, LinkedIn via Playwright (system Chrome)
- **Full job descriptions** — fetches detail pages, not only listing snippets
- **IT classifier** — filters by tech stack, seniority, and non-IT roles
- **SQLite storage** — deduplicated vacancies with status tracking
- **Google Sheets sync** — export to Sheets, import HR emails back to DB
- **Email dispatch** — tailored German cover letter (PDF), CV, DCI certificate
- **Stats** — rejection reasons per scrape run

## Tech Stack

| Area | Tools |
|------|--------|
| Runtime | Node.js 20+, TypeScript (ESM) |
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
npm run scrape
npm run sheets:sync      # export DB → Google Sheets
# Fill "Email (HR)" column in the sheet, then:
npm run sheets:import    # import emails (and status) → DB
npm run send:test        # test SMTP + PDF attachments
npm run dispatch         # send applications (status=new + email in DB)
```

## Main Scripts

| Command | Description |
|---------|-------------|
| `npm run scrape` | Run all enabled scrapers, classify, save to DB |
| `npm run db:reclassify` | Re-run classifier on `status=new` vacancies; archive misfits |
| `npm run dispatch` | Send applications to vacancies with `status=new` and email |
| `npm run sheets:sync` | Push DB contents to Google Sheets |
| `npm run sheets:import` | Pull emails and status from Google Sheets into DB |
| `npm run lebenslauf:pdf` | Generate `assets/Lebenslauf.pdf` from `Lebenslauf.md` |
| `npm run auth:linkedin` | Save LinkedIn login session (recommended) |
| `npm run auth:indeed` | Save browser session for Indeed (anti-bot) |
| `npm run auth:status` | Check saved session files and cookie counts |

## Project Structure

```
src/
├── scraper/          # Indeed, Stepstone, LinkedIn + classifier
├── database/         # SQLite schema & repository
├── sender/           # Anschreiben templates, email, PDF
├── dispatcher/       # Application pipeline
├── sheets/           # Google Sheets sync
└── tools/            # CV markdown → PDF
```

## Scraping stability

Indeed and LinkedIn often block headless browsers. Recommended setup:

```bash
npm run auth:linkedin   # log in once, saves ./data/linkedin-auth.json
npm run auth:indeed     # optional — accept cookies on Indeed
npm run auth:status     # verify session files
npm run scrape
```

- Default `SCRAPERS=stepstone,linkedin` — Indeed disabled until session works
- Session files in `./data/` are auto-detected even without `.env` paths
- If you get 403: set `BROWSER_HEADLESS=false` or increase `SEARCH_DELAY_MS`

## Configuration

See [`.env.example`](.env.example). Important variables:

- `SCRAPERS` — default `stepstone,linkedin`; add `indeed` after `auth:indeed`
- `LINKEDIN_STORAGE_STATE` / `INDEED_STORAGE_STATE` — paths to saved sessions
- `KEYWORDS_JUNIOR` / `KEYWORDS_PRAKTIKUM` — search terms
- `SEARCH_LOCATION` / `SEARCH_RADIUS_KM` — default: Leipzig, 150 km
- `FETCH_FULL_DESCRIPTION` — load full job text before classification
- `EXTRACT_EMAIL` — parse HR emails from job pages into DB (default: on)
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
