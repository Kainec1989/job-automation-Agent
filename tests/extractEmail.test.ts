import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractEmailsFromText,
  extractEmailFromTexts,
  pickBestEmail,
} from '../src/scraper/extractEmail.js';

describe('extractEmailsFromText', () => {
  it('extracts plain email addresses', () => {
    const emails = extractEmailsFromText('Kontakt: bewerbung@firma.de oder info@firma.de');
    assert.deepEqual(emails.sort(), ['bewerbung@firma.de', 'info@firma.de']);
  });

  it('extracts obfuscated at/dot notation', () => {
    const emails = extractEmailsFromText('E-Mail: hr [at] company [dot] de');
    assert.ok(emails.includes('hr@company.de'));
  });

  it('blocks indeed.com domain', () => {
    const emails = extractEmailsFromText('Apply via jobs@indeed.com');
    assert.equal(pickBestEmail(emails), null);
  });

  it('blocks noreply addresses', () => {
    const emails = extractEmailsFromText('noreply@company.de');
    assert.equal(pickBestEmail(emails), null);
  });
});

describe('pickBestEmail', () => {
  it('prefers HR-specific local parts', () => {
    const best = pickBestEmail(['info@company.de', 'bewerbung@company.de', 'sales@company.de']);
    assert.equal(best, 'bewerbung@company.de');
  });

  it('prefers bewerbung@ over generic info@', () => {
    const best = pickBestEmail(['info@firma.de', 'bewerbung@firma.de']);
    assert.equal(best, 'bewerbung@firma.de');
  });
});

describe('extractEmailFromTexts', () => {
  it('picks best email across multiple text chunks', () => {
    const email = extractEmailFromTexts(
      'Schreiben Sie an kontakt@example.org',
      'Bewerbungen: bewerbung@sachsenenergie.de',
    );
    assert.equal(email, 'bewerbung@sachsenenergie.de');
  });

  it('returns null when no valid emails', () => {
    assert.equal(extractEmailFromTexts('Kein Kontakt', null), null);
  });
});
