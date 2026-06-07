import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveContactNameFromEmail } from '../src/sender/anschreibenTemplates.js';
import { dedupeByCompanyTitle } from '../src/scraper/mergeVacancies.js';
import { domainHintsFromUrl } from '../src/enrichment/tavily/queries.js';
import type { ScrapedVacancy } from '../src/database/types.js';

test('deriveContactNameFromEmail: builds name from vorname.nachname', () => {
  assert.equal(deriveContactNameFromEmail('max.mustermann@firma.de'), 'Max Mustermann');
  assert.equal(deriveContactNameFromEmail('anna.schmidt@acme.com'), 'Anna Schmidt');
});

test('deriveContactNameFromEmail: rejects generic mailboxes', () => {
  assert.equal(deriveContactNameFromEmail('info@firma.de'), null);
  assert.equal(deriveContactNameFromEmail('bewerbung@firma.de'), null);
  assert.equal(deriveContactNameFromEmail('karriere@firma.de'), null);
  assert.equal(deriveContactNameFromEmail('jobs@firma.de'), null);
});

test('deriveContactNameFromEmail: rejects non-name local parts', () => {
  assert.equal(deriveContactNameFromEmail('hr2024@firma.de'), null);
  assert.equal(deriveContactNameFromEmail('a.b@firma.de'), null);
  assert.equal(deriveContactNameFromEmail('team@firma.de'), null);
});

test('domainHintsFromUrl: ignores aggregator hosts', () => {
  assert.deepEqual(domainHintsFromUrl('https://de.indeed.com/jobs/123'), []);
  assert.deepEqual(domainHintsFromUrl('https://www.linkedin.com/jobs/view/1'), []);
  assert.deepEqual(domainHintsFromUrl(null), []);
});

test('domainHintsFromUrl: returns base for real company domains', () => {
  assert.deepEqual(domainHintsFromUrl('https://www.codewerk.de/karriere'), [
    'codewerk',
    'codewerk.de',
  ]);
});

function vacancy(overrides: Partial<ScrapedVacancy>): ScrapedVacancy {
  return {
    title: 'Junior Developer',
    company: 'Acme GmbH',
    url: 'https://example.com/1',
    description: null,
    email: null,
    type: 'junior',
    ...overrides,
  };
}

test('dedupeByCompanyTitle: collapses same posting across boards', () => {
  const input = [
    vacancy({ url: 'https://indeed.com/1', title: 'Junior Developer (m/w/d)' }),
    vacancy({ url: 'https://linkedin.com/2', title: 'Junior Developer', email: 'hr@acme.de' }),
    vacancy({ url: 'https://stepstone.de/3', company: 'Other AG', title: 'Junior Developer' }),
  ];

  const result = dedupeByCompanyTitle(input);
  assert.equal(result.length, 2);

  const acme = result.find((v) => v.company === 'Acme GmbH');
  assert.equal(acme?.email, 'hr@acme.de', 'should keep the email from the duplicate');
});
