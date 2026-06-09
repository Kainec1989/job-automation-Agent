import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const tempDir = mkdtempSync(join(tmpdir(), 'agent-email-prop-'));
process.env.DATABASE_PATH = join(tempDir, 'test.db');

const { closeDatabase } = await import('../src/database/db.js');
const { VacancyRepository } = await import('../src/database/vacancyRepository.js');

test('updateEmailForCompany propagates email to all new vacancies without email', () => {
  const repo = new VacancyRepository();

  repo.insert({
    title: 'Junior Dev A',
    company: 'Acme GmbH',
    url: 'https://example.com/a',
    type: 'junior',
  });
  repo.insert({
    title: 'Junior Dev B',
    company: 'Acme GmbH',
    url: 'https://example.com/b',
    type: 'junior',
  });
  repo.insert({
    title: 'Other role',
    company: 'Other AG',
    url: 'https://example.com/c',
    type: 'junior',
  });

  const updated = repo.updateEmailForCompany('Acme GmbH', 'hr@acme.de');
  assert.equal(updated, 2);

  const acmeA = repo.findByUrl('https://example.com/a');
  const acmeB = repo.findByUrl('https://example.com/b');
  const other = repo.findByUrl('https://example.com/c');

  assert.equal(acmeA?.email, 'hr@acme.de');
  assert.equal(acmeB?.email, 'hr@acme.de');
  assert.equal(other?.email, null);
});

after(() => {
  closeDatabase();
});
