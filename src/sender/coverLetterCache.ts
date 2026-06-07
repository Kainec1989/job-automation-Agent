import { createHash } from 'node:crypto';
import { getDatabase } from '../database/db.js';

export interface CachedCoverLetter {
  subject: string;
  /** Full Anschreiben text used for the PDF attachment. */
  body: string;
  /** Short, natural cover note shown in the email body. */
  emailBody: string;
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
    .prepare('SELECT subject, body, email_body FROM cover_letter_cache WHERE cache_key = ?')
    .get(cacheKey) as { subject: string; body: string; email_body: string } | undefined;

  if (!row) {
    return null;
  }

  return { subject: row.subject, body: row.body, emailBody: row.email_body ?? '' };
}

export function setCoverLetterCache(cacheKey: string, value: CachedCoverLetter): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO cover_letter_cache (cache_key, subject, body, email_body)
    VALUES (@cacheKey, @subject, @body, @emailBody)
    ON CONFLICT(cache_key) DO UPDATE SET
      subject = excluded.subject,
      body = excluded.body,
      email_body = excluded.email_body,
      created_at = datetime('now')
  `).run({
    cacheKey,
    subject: value.subject,
    body: value.body,
    emailBody: value.emailBody,
  });
}
