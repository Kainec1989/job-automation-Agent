# Job Automation Agent

Node.js/TypeScript pipeline for automated job search and applications on the German IT market (Junior Developer, Testautomatisierer, Praktikum).

**Author:** [Vladyslav Plugin](https://github.com/Kainec1989)

## Features

- **Scraping** — Indeed, Stepstone, LinkedIn via Playwright (system Chrome)
- **Full job descriptions** — fetches detail pages, not only listing snippets
- **IT classifier** — filters by tech stack, seniority, and non-IT roles
- **SQLite storage** — deduplicated vacancies with status tracking
- **Google Sheets sync** — optional export for manual review
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
npm run sheets:sync   # optional
npm run send:test     # test SMTP + PDF attachments
npm run dispatch      # send applications (vacancies need email in DB)
```

## Main Scripts

| Command | Description |
|---------|-------------|
| `npm run scrape` | Run all enabled scrapers, classify, save to DB |
| `npm run db:reclassify` | Re-run classifier on `status=new` vacancies; archive misfits |
| `npm run dispatch` | Send applications to vacancies with `status=new` and email |
| `npm run sheets:sync` | Push DB contents to Google Sheets |
| `npm run lebenslauf:pdf` | Generate `assets/Lebenslauf.pdf` from `Lebenslauf.md` |
| `npm run auth:indeed` | Save browser session for Indeed (anti-bot) |
| `npm run auth:linkedin` | Save LinkedIn login session |

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

## Configuration

See [`.env.example`](.env.example). Important variables:

- `SCRAPERS` — e.g. `stepstone,linkedin` (Indeed often returns 403)
- `KEYWORDS_JUNIOR` / `KEYWORDS_PRAKTIKUM` — search terms
- `SEARCH_LOCATION` / `SEARCH_RADIUS_KM` — default: Leipzig, 150 km
- `FETCH_FULL_DESCRIPTION` — load full job text before classification
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
