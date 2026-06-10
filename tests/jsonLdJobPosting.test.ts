import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractJobPostingFromHtml } from '../src/scraper/extractJobPostingJsonLd.js';

describe('extractJobPostingFromHtml', () => {
  it('parses JobPosting description and hiring organization', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Junior Developer",
            "description": "Wir suchen einen motivierten Entwickler mit TypeScript Erfahrung.",
            "hiringOrganization": { "@type": "Organization", "name": "Acme GmbH" }
          }
        </script>
      </head><body></body></html>
    `;

    const result = extractJobPostingFromHtml(html);
    assert.ok(result);
    assert.equal(result.title, 'Junior Developer');
    assert.match(result.description ?? '', /TypeScript/);
    assert.equal(result.company, 'Acme GmbH');
  });

  it('extracts contact email from applicationContact', () => {
    const html = `
      <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "QA Engineer",
          "description": "Test automation role",
          "applicationContact": { "email": "bewerbung@example.de" }
        }
      </script>
    `;

    const result = extractJobPostingFromHtml(html);
    assert.ok(result);
    assert.deepEqual(result.emails, ['bewerbung@example.de']);
  });

  it('returns null when no JobPosting block exists', () => {
    assert.equal(extractJobPostingFromHtml('<html><body>no schema</body></html>'), null);
  });
});
