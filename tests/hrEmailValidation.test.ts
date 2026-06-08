import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPlausibleHrEmail,
  pickBestHrEmail,
  extractHrEmailFromTexts,
} from '../src/scraper/hrEmailValidation.js';

describe('isPlausibleHrEmail', () => {
  it('rejects yourself@ placeholder', () => {
    assert.equal(isPlausibleHrEmail('yourself@mbition.io', 'MBition GmbH'), false);
  });

  it('accepts domain-matching company email', () => {
    assert.equal(
      isPlausibleHrEmail('karriere@sachsenenergie.de', 'SachsenEnergie AG'),
      true,
    );
  });

  it('accepts bewerbung@ on .de without strict domain match', () => {
    assert.equal(isPlausibleHrEmail('bewerbung@example.de', 'Unknown Corp'), true);
  });

  it('rejects generic info@ without company domain match', () => {
    assert.equal(isPlausibleHrEmail('info@random-host.com', 'Totally Different GmbH'), false);
  });

  it('rejects generic info@ even when domain matches company', () => {
    assert.equal(isPlausibleHrEmail('info@hutter-unger.de', 'Hutter und Unger GmbH'), false);
    assert.equal(isPlausibleHrEmail('info.de@endress.com', 'Endress+Hauser'), false);
  });

  it('rejects disability representative mailboxes', () => {
    assert.equal(
      isPlausibleHrEmail(
        'schwerbehindertenvertretung@volkswagen-infotainment.com',
        'Volkswagen Infotainment GmbH',
      ),
      false,
    );
  });
});

describe('pickBestHrEmail', () => {
  it('returns domain-matching email over unrelated HR email', () => {
    const best = pickBestHrEmail(
      ['bewerbung@other.de', 'karriere@sachsenenergie.de', 'yourself@mbition.io'],
      'SachsenEnergie AG',
    );
    assert.equal(best, 'karriere@sachsenenergie.de');
  });

  it('returns null when all candidates are implausible', () => {
    const best = pickBestHrEmail(['yourself@mbition.io', 'info@random.com'], 'MBition GmbH');
    assert.equal(best, null);
  });
});

describe('extractHrEmailFromTexts', () => {
  it('extracts validated email for company from page text', () => {
    const email = extractHrEmailFromTexts(
      'SachsenEnergie AG',
      'Bewerbungen an karriere@sachsenenergie.de',
    );
    assert.equal(email, 'karriere@sachsenenergie.de');
  });
});
