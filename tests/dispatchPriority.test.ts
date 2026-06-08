import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const tempDir = mkdtempSync(join(tmpdir(), 'dispatch-priority-'));
process.env.DATABASE_PATH = join(tempDir, 'test.db');

const { VacancyRepository } = await import('../src/database/vacancyRepository.js');
const { closeDatabase } = await import('../src/database/db.js');

const repo = new VacancyRepository();

repo.insert({
  title: 'Praktikum Softwareentwicklung',
  company: 'Zeta GmbH',
  url: 'https://j/zeta-prakt',
  email: 'hr@zeta.de',
  type: 'praktikum',
});
repo.insert({
  title: 'Junior Developer',
  company: 'Eta GmbH',
  url: 'https://j/eta-junior',
  email: 'jobs@eta.de',
  type: 'junior',
});

after(() => {
  closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

test('findPendingWithEmail prefers junior over praktikum', () => {
  const pending = repo.findPendingWithEmail(1, 3);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.type, 'junior');
  assert.equal(pending[0]?.company, 'Eta GmbH');
});
