/**
 * One-off / maintenance cleanup for vacancies.db after pipeline rule updates.
 * Run: node scripts/cleanup-database.cjs
 */
const Database = require('better-sqlite3');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

// Load compiled validation from dist if present, else use tsx path via dynamic import fallback.
// We inline the same rules as hrEmailValidation for the standalone script.
const SUSPICIOUS = [
  'yourself', 'yourname', 'your.email', 'example', 'username', 'name',
  'firstname', 'lastname', 'test', 'sample', 'placeholder', 'email', 'user',
  'schwerbehindertenvertretung', 'behindertenvertretung', 'schwerbehinderung',
];
const GENERIC = new Set(['info', 'kontakt', 'contact', 'hello', 'mail', 'office', 'service', 'support']);

function companySlug(company) {
  return (company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function emailMatchesDomain(email, company) {
  const domain = email.split('@')[1] || '';
  const slug = companySlug(company);
  if (!slug || slug.length < 3) return false;
  const host = domain.replace(/[^a-z0-9]/g, '');
  return host.includes(slug.slice(0, Math.min(slug.length, 12)));
}

function isPlausibleHrEmail(email, company) {
  const normalized = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;

  const [localPart, domain] = normalized.split('@');
  if (SUSPICIOUS.some((p) => localPart === p || localPart.includes(p))) return false;
  if (GENERIC.has(localPart) || localPart.startsWith('info.')) return false;

  if (!company?.trim()) return true;
  if (emailMatchesDomain(normalized, company)) return true;

  const hasHrHint = /bewerbung|karriere|jobs|hr|recruiting|personal|career|talent|hiring|stellen/.test(
    localPart,
  );
  return hasHrHint && domain.endsWith('.de');
}

const dbPath = resolve('data/vacancies.db');
if (!existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
const summary = {
  dupContactedArchived: 0,
  emailsCleared: 0,
  sentAtClearedOnArchived: 0,
};

console.log('=== DB cleanup started ===\n');

// 1. Archive duplicate contacted/replied/rejected rows (keep earliest sent_at per email).
const dupEmails = db
  .prepare(
    `SELECT lower(trim(email)) AS e
     FROM vacancies
     WHERE status IN ('contacted', 'replied', 'rejected')
       AND email IS NOT NULL AND trim(email) != ''
     GROUP BY lower(trim(email))
     HAVING COUNT(*) > 1`,
  )
  .all();

const archiveDup = db.transaction(() => {
  for (const { e } of dupEmails) {
    const rows = db
      .prepare(
        `SELECT id, sent_at FROM vacancies
         WHERE status IN ('contacted', 'replied', 'rejected') AND lower(trim(email)) = ?
         ORDER BY (sent_at IS NULL), sent_at ASC, id ASC`,
      )
      .all(e);

    for (const row of rows.slice(1)) {
      db.prepare(
        `UPDATE vacancies SET status = 'archived', updated_at = datetime('now') WHERE id = ?`,
      ).run(row.id);
      summary.dupContactedArchived += 1;
    }
  }
});
archiveDup();
console.log(`Archived ${summary.dupContactedArchived} duplicate contacted row(s).`);

// 2. Clear implausible emails on "new" vacancies (new validation rules).
const newWithEmail = db
  .prepare(
    `SELECT id, email, company FROM vacancies
     WHERE status = 'new' AND email IS NOT NULL AND trim(email) != ''`,
  )
  .all();

for (const row of newWithEmail) {
  if (!isPlausibleHrEmail(row.email, row.company)) {
    db.prepare(
      `UPDATE vacancies SET email = NULL, updated_at = datetime('now') WHERE id = ?`,
    ).run(row.id);
    summary.emailsCleared += 1;
    console.log(`  Cleared email: ${row.email} (${row.company})`);
  }
}
console.log(`Cleared ${summary.emailsCleared} invalid email(s) on new vacancies.`);

// 3. Archived rows should not carry sent_at (stats hygiene).
const sentOnArchived = db
  .prepare(
    `UPDATE vacancies SET sent_at = NULL, updated_at = datetime('now')
     WHERE status = 'archived' AND sent_at IS NOT NULL`,
  )
  .run();
summary.sentAtClearedOnArchived = sentOnArchived.changes;
console.log(`Cleared sent_at on ${summary.sentAtClearedOnArchived} archived row(s).`);

// 4. VACUUM
db.exec('VACUUM');
console.log('VACUUM completed.');

console.log('\n=== After cleanup ===');
for (const r of db.prepare('SELECT status, COUNT(*) c FROM vacancies GROUP BY status ORDER BY c DESC').all()) {
  console.log(`  ${r.status}: ${r.c}`);
}
const distinctContacted = db
  .prepare(
    `SELECT COUNT(DISTINCT lower(trim(email))) c FROM vacancies
     WHERE status IN ('contacted','replied','rejected') AND email IS NOT NULL`,
  )
  .get().c;
const contactedRows = db.prepare(`SELECT COUNT(*) c FROM vacancies WHERE status='contacted'`).get().c;
console.log(`  contacted rows: ${contactedRows}, distinct emails: ${distinctContacted}`);
console.log(
  `  new with email: ${db.prepare(`SELECT COUNT(*) c FROM vacancies WHERE status='new' AND email IS NOT NULL AND trim(email)!=''`).get().c}`,
);

const pageCount = db.pragma('page_count', { simple: true });
const fileSize = require('node:fs').statSync(dbPath).size;
console.log(`  db size: ${(fileSize / 1024 / 1024).toFixed(2)} MB (${pageCount} pages)`);

db.close();
console.log('\n=== DB cleanup finished ===');
