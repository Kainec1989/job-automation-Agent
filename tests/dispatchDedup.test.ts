import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const tempDir = mkdtempSync(join(tmpdir(), 'dispatch-dedup-'));
process.env.DATABASE_PATH = join(tempDir, 'test.db');

const { VacancyRepository } = await import('../src/database/vacancyRepository.js');
const { closeDatabase } = await import('../src/database/db.js');

const repo = new VacancyRepository();

before(() => {
  // Same company with same HR email, posted as 3 separate listings.
  repo.insert({ title: 'Dev 1', company: 'Acme GmbH', url: 'https://j/acme-1', email: 'a@acme.de' });
  repo.insert({ title: 'Dev 2', company: 'Acme GmbH', url: 'https://j/acme-2', email: 'a@acme.de' });
  repo.insert({ title: 'Dev 3', company: 'Acme GmbH', url: 'https://j/acme-3', email: 'a@acme.de' });

  // Company already contacted on one row; another 'new' row must be skipped.
  const beta = repo.insert({ title: 'Dev', company: 'Beta AG', url: 'https://j/beta-1', email: 'b@beta.de' });
  repo.insert({ title: 'Dev', company: 'Beta AG', url: 'https://j/beta-2', email: 'b@beta.de' });
  repo.markContacted(beta.id);

  // Fresh single company — must be returned.
  repo.insert({ title: 'Dev', company: 'Gamma GmbH', url: 'https://j/gamma-1', email: 'g@gamma.de' });

  // Same email reused across different company names; one already contacted.
  const eps = repo.insert({ title: 'Dev', company: 'Epsilon GmbH', url: 'https://j/eps-1', email: 'shared@x.de' });
  repo.insert({ title: 'Dev', company: 'Delta GmbH', url: 'https://j/delta-1', email: 'shared@x.de' });
  repo.markContacted(eps.id);
});

after(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

test('returns at most one row per company', () => {
  const pending = repo.findPendingWithEmail(50, 3);
  const companies = pending.map((p) => p.company.toLowerCase());
  assert.equal(companies.length, new Set(companies).size, 'company appears more than once');
});

test('returns at most one row per email', () => {
  const pending = repo.findPendingWithEmail(50, 3);
  const emails = pending.map((p) => p.email.toLowerCase());
  assert.equal(emails.length, new Set(emails).size, 'email appears more than once');
});

test('excludes companies already contacted', () => {
  const pending = repo.findPendingWithEmail(50, 3);
  assert.ok(!pending.some((p) => p.company === 'Beta AG'), 'already-contacted company leaked');
});

test('excludes emails already contacted on another company', () => {
  const pending = repo.findPendingWithEmail(50, 3);
  assert.ok(!pending.some((p) => p.email === 'shared@x.de'), 'already-contacted email leaked');
});

test('keeps eligible fresh companies', () => {
  const pending = repo.findPendingWithEmail(50, 3);
  const companies = pending.map((p) => p.company).sort();
  assert.deepEqual(companies, ['Acme GmbH', 'Gamma GmbH']);
});
