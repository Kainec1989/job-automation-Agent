import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateCoverLetterContent } from '../src/sender/coverLetterGenerator.js';

describe('validateCoverLetterContent', () => {
  const input = {
    title: 'Junior Developer',
    company: 'Acme GmbH',
    type: 'junior' as const,
    description: 'TypeScript role',
    applicantName: 'Max Mustermann',
  };

  it('rejects initiativ wording', () => {
    const error = validateCoverLetterContent(
      {
        subject: 'Bewerbung Junior Developer',
        body: 'Sehr geehrte Damen und Herren,\n\nInitiativbewerbung bei Acme GmbH.',
        emailBody: 'Kurz bei Acme GmbH.',
      },
      input,
    );

    assert.ok(error?.includes('initiativ'));
  });

  it('rejects placeholder brackets', () => {
    const error = validateCoverLetterContent(
      {
        subject: 'Bewerbung',
        body: 'Sehr geehrte Damen und Herren,\n\nbei Acme GmbH als [Position].',
        emailBody: 'Anbei Bewerbung Acme GmbH.',
      },
      input,
    );

    assert.equal(error, 'placeholder brackets');
  });

  it('accepts valid tailored content', () => {
    const error = validateCoverLetterContent(
      {
        subject: 'Bewerbung als Junior Developer — Acme GmbH',
        body: 'Sehr geehrte Damen und Herren,\n\nhiermit bewerbe ich mich bei Acme GmbH als Junior Developer.\n\nMit freundlichen Grüßen\nMax Mustermann',
        emailBody: 'Guten Tag,\n\nanbei meine Unterlagen für die Stelle bei Acme GmbH.\n\nMit freundlichen Grüßen\nMax Mustermann',
      },
      input,
    );

    assert.equal(error, null);
  });
});
