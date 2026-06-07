import { getDatabase } from '../../database/db.js';
import { companySlug } from './companyMatch.js';

export interface TavilyEmailCacheEntry {
  companyKey: string;
  email: string | null;
  sourceUrl: string | null;
  lookedUpAt: string;
}

interface TavilyEmailCacheRow {
  company_key: string;
  email: string | null;
  source_url: string | null;
  looked_up_at: string;
}

export function companyCacheKey(company: string): string {
  return companySlug(company);
}

function mapRow(row: TavilyEmailCacheRow): TavilyEmailCacheEntry {
  return {
    companyKey: row.company_key,
    email: row.email,
    sourceUrl: row.source_url,
    lookedUpAt: row.looked_up_at,
  };
}

export interface TavilyCacheOptions {
  /** Negative (no-email) cache entries older than this are treated as a miss so they get retried. */
  negativeTtlDays?: number;
}

function isNegativeEntryStale(lookedUpAt: string, ttlDays: number): boolean {
  const lookedUpMs = Date.parse(`${lookedUpAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(lookedUpMs)) {
    return false;
  }

  const ageMs = Date.now() - lookedUpMs;
  return ageMs > ttlDays * 24 * 60 * 60 * 1000;
}

export function getTavilyEmailCache(
  company: string,
  options?: TavilyCacheOptions,
): TavilyEmailCacheEntry | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM tavily_email_cache WHERE company_key = ?')
    .get(companyCacheKey(company)) as TavilyEmailCacheRow | undefined;

  if (!row) {
    return null;
  }

  // Re-attempt companies whose negative result has expired (e.g. rebrand, new impressum page).
  if (
    row.email === null &&
    options?.negativeTtlDays !== undefined &&
    options.negativeTtlDays > 0 &&
    isNegativeEntryStale(row.looked_up_at, options.negativeTtlDays)
  ) {
    return null;
  }

  return mapRow(row);
}

export function setTavilyEmailCache(
  company: string,
  email: string | null,
  sourceUrl?: string | null,
): void {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO tavily_email_cache (company_key, email, source_url, looked_up_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(company_key) DO UPDATE SET
      email = excluded.email,
      source_url = excluded.source_url,
      looked_up_at = datetime('now')
  `).run(companyCacheKey(company), email, sourceUrl ?? null);
}
