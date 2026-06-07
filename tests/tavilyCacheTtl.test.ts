import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const tempDir = mkdtempSync(join(tmpdir(), 'tavily-cache-'));
process.env.DATABASE_PATH = join(tempDir, 'test.db');

const { getTavilyEmailCache, setTavilyEmailCache, companyCacheKey } = await import(
  '../src/enrichment/tavily/emailCache.js'
);
const { getDatabase, closeDatabase } = await import('../src/database/db.js');

after(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

function ageEntry(company: string, days: number): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE tavily_email_cache SET looked_up_at = datetime('now', ?) WHERE company_key = ?`,
  ).run(`-${days} days`, companyCacheKey(company));
}

test('positive cache entries are returned regardless of age', () => {
  setTavilyEmailCache('Alpha GmbH', 'hr@alpha.de', 'https://alpha.de/impressum');
  ageEntry('Alpha GmbH', 90);

  const entry = getTavilyEmailCache('Alpha GmbH', { negativeTtlDays: 14 });
  assert.equal(entry?.email, 'hr@alpha.de');
});

test('fresh negative entries suppress re-lookup', () => {
  setTavilyEmailCache('Beta GmbH', null);
  const entry = getTavilyEmailCache('Beta GmbH', { negativeTtlDays: 14 });
  assert.notEqual(entry, null);
  assert.equal(entry?.email, null);
});

test('stale negative entries are treated as a miss', () => {
  setTavilyEmailCache('Gamma GmbH', null);
  ageEntry('Gamma GmbH', 30);

  const entry = getTavilyEmailCache('Gamma GmbH', { negativeTtlDays: 14 });
  assert.equal(entry, null);
});

test('negativeTtlDays=0 keeps negative entries forever', () => {
  setTavilyEmailCache('Delta GmbH', null);
  ageEntry('Delta GmbH', 365);

  const entry = getTavilyEmailCache('Delta GmbH', { negativeTtlDays: 0 });
  assert.notEqual(entry, null);
});
