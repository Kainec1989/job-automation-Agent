import { createHash } from 'node:crypto';
import { getDatabase } from '../database/db.js';

export interface CachedCoverLetter {
  subject: string;
  body: string;
}

/** Stable cache key derived from the inputs that affect generation. */
export function coverLetterCacheKey(parts: {
  company: string;
  title: string;
  type: string;
  description: string | null;
  contactName?: string | null;
}): string {
  const raw = [
    parts.company.trim().toLowerCase(),
    parts.title.trim().toLowerCase(),
    parts.type,
    (parts.contactName ?? '').trim().toLowerCase(),
    (parts.description ?? '').trim().toLowerCase(),
  ].join('|');

  return createHash('sha256').update(raw).digest('hex');
}

export function getCoverLetterCache(cacheKey: string): CachedCoverLetter | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT subject, body FROM cover_letter_cache WHERE cache_key = ?')
    .get(cacheKey) as { subject: string; body: string } | undefined;

  return row ? { subject: row.subject, body: row.body } : null;
}

export function setCoverLetterCache(cacheKey: string, value: CachedCoverLetter): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO cover_letter_cache (cache_key, subject, body)
    VALUES (@cacheKey, @subject, @body)
    ON CONFLICT(cache_key) DO UPDATE SET
      subject = excluded.subject,
      body = excluded.body,
      created_at = datetime('now')
  `).run({ cacheKey, subject: value.subject, body: value.body });
}
