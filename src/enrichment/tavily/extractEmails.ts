import { env } from '../../config/env.js';
import { extractEmailsFromText, pickBestEmail } from '../../scraper/extractEmail.js';
import { tavilyExtract } from './client.js';
import { emailMatchesCompanyDomain } from './companyMatch.js';
import { selectExtractUrls } from './selectExtractUrls.js';
import type { TavilySearchResult } from './types.js';

const EXTRACT_QUERY =
  'Bewerbung E-Mail Karriere Personal HR kontakt impressum bewerbung@ jobs@ karriere@';

function getExtractedText(raw: { raw_content?: string; rawContent?: string }): string {
  return raw.raw_content ?? raw.rawContent ?? '';
}

export async function extractEmailsFromSearchResults(
  results: TavilySearchResult[],
  company: string,
): Promise<{
  email: string | null;
  candidates: string[];
  extractedUrls: string[];
  sourceUrl: string | null;
}> {
  if (!env.tavilyExtractEnabled) {
    return { email: null, candidates: [], extractedUrls: [], sourceUrl: null };
  }

  const urls = selectExtractUrls(results, company, env.tavilyMaxExtractUrls);
  if (urls.length === 0) {
    return { email: null, candidates: [], extractedUrls: [], sourceUrl: null };
  }

  const response = await tavilyExtract({
    urls,
    query: EXTRACT_QUERY,
    chunks_per_source: 5,
  });

  const seen = new Set<string>();
  const candidates: string[] = [];
  let sourceUrl: string | null = null;

  for (const item of response.results) {
    const text = getExtractedText(item);
    const emails = extractEmailsFromText(text);

    for (const email of emails) {
      if (!seen.has(email)) {
        seen.add(email);
        candidates.push(email);
        if (!sourceUrl) {
          sourceUrl = item.url;
        }
      }
    }
  }

  const domainMatches = candidates.filter((email) => emailMatchesCompanyDomain(email, company));
  const email = domainMatches.length > 0 ? pickBestEmail(domainMatches) : null;

  return {
    email,
    candidates,
    extractedUrls: urls,
    sourceUrl: email ? sourceUrl : null,
  };
}
