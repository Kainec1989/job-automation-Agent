import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeJobFields, sanitizeJobText } from '../src/scraper/sanitizeJobFields.js';

describe('sanitizeJobText', () => {
  it('removes LinkedIn with verification suffix', () => {
    assert.equal(
      sanitizeJobText('Junior Developer\nwith verification'),
      'Junior Developer',
    );
  });

  it('collapses newlines and extra spaces', () => {
    assert.equal(
      sanitizeJobText('Junior   Developer\n\n(m/w/d)'),
      'Junior Developer (m/w/d)',
    );
  });

  it('deduplicates repeated title phrase', () => {
    assert.equal(
      sanitizeJobText('Frontend Engineer Frontend Engineer'),
      'Frontend Engineer',
    );
  });
});

describe('sanitizeJobFields', () => {
  it('cleans both title and company', () => {
    const result = sanitizeJobFields(
      'React Developer\nwith verification',
      'ACME   GmbH\nwith verification',
    );
    assert.equal(result.title, 'React Developer');
    assert.equal(result.company, 'ACME GmbH');
  });
});
