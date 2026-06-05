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

export function getTavilyEmailCache(company: string): TavilyEmailCacheEntry | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM tavily_email_cache WHERE company_key = ?')
    .get(companyCacheKey(company)) as TavilyEmailCacheRow | undefined;

  return row ? mapRow(row) : null;
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
