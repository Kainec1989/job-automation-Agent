import { domainHintsFromUrl } from '../tavily/queries.js';
import { extractEmailsFromText } from '../../scraper/extractEmail.js';
import { pickBestHrEmail } from '../../scraper/hrEmailValidation.js';

const IMPRESSUM_PATHS = [
  '/impressum',
  '/de/impressum',
  '/kontakt',
  '/de/kontakt',
  '/karriere',
  '/jobs',
  '/unternehmen/kontakt',
  '/ueber-uns/kontakt',
];

const FETCH_TIMEOUT_MS = 12_000;

export interface ImpressumLookupResult {
  email: string | null;
  sourceUrl: string | null;
  strategy: 'impressum-crawl' | 'none';
}

function buildOriginFromJobUrl(jobUrl: string): string | null {
  try {
    const url = new URL(jobUrl);
    if (!url.protocol.startsWith('http')) {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function buildCandidateOrigins(company: string, jobUrl?: string | null): string[] {
  const origins = new Set<string>();
  const fromJob = jobUrl ? buildOriginFromJobUrl(jobUrl) : null;

  if (fromJob) {
    origins.add(fromJob);
  }

  for (const hint of domainHintsFromUrl(jobUrl)) {
    if (hint.includes('.')) {
      origins.add(`https://${hint}`);
    } else if (hint.length >= 3) {
      origins.add(`https://www.${hint}.de`);
      origins.add(`https://${hint}.de`);
    }
  }

  const slug = company
    .toLowerCase()
    .replace(/\b(gmbh|ag|ug|kg|se|gruppe|group)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  if (slug.length >= 4) {
    origins.add(`https://www.${slug}.de`);
    origins.add(`https://${slug}.de`);
  }

  return [...origins];
}

async function fetchPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'de-DE,de;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupImpressumEmail(input: {
  company: string;
  jobUrl?: string | null;
}): Promise<ImpressumLookupResult> {
  const origins = buildCandidateOrigins(input.company, input.jobUrl);

  for (const origin of origins) {
    for (const path of IMPRESSUM_PATHS) {
      const url = `${origin.replace(/\/$/, '')}${path}`;
      const text = await fetchPageText(url);
      if (!text || text.length < 40) {
        continue;
      }

      const emails = extractEmailsFromText(text);
      const best = pickBestHrEmail(emails, input.company);
      if (best) {
        return { email: best, sourceUrl: url, strategy: 'impressum-crawl' };
      }
    }
  }

  return { email: null, sourceUrl: null, strategy: 'none' };
}
