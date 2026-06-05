import { env } from '../../config/env.js';
import { extractEmailsFromText, pickBestEmail } from '../../scraper/extractEmail.js';
import { AGGREGATOR_HOSTS, CAREER_URL_HINTS } from './constants.js';
import { emailMatchesCompanyDomain, companySlug } from './companyMatch.js';
import { tavilySearch } from './client.js';
import { extractEmailsFromSearchResults } from './extractEmails.js';
import { buildHrEmailSearchQueries } from './queries.js';
import type {
  TavilyEmailLookupInput,
  TavilyEmailLookupResult,
  TavilySearchResult,
} from './types.js';

export { emailMatchesCompanyDomain } from './companyMatch.js';

function isAggregatorHost(host: string): boolean {
  return AGGREGATOR_HOSTS.some((blocked) => host.includes(blocked));
}

function scoreSearchResult(result: TavilySearchResult, company: string): number {
  let score = result.score;

  try {
    const url = new URL(result.url);
    const host = url.hostname.toLowerCase();
    const fullUrl = result.url.toLowerCase();
    const slug = companySlug(company);
    const hostCompact = host.replace(/[^a-z0-9]/g, '');

    if (isAggregatorHost(host)) {
      score -= 0.55;
    }

    if (CAREER_URL_HINTS.test(fullUrl)) {
      score += 0.25;
    }

    if (host.endsWith('.de')) {
      score += 0.12;
    }

    if (slug.length >= 4) {
      const slugPrefix = slug.slice(0, Math.min(slug.length, 12));
      if (hostCompact.includes(slugPrefix) || slug.includes(hostCompact.replace(/www/, ''))) {
        score += 0.4;
      }
    }
  } catch {
    score -= 0.1;
  }

  return score;
}

const MIN_TRUSTED_RESULT_SCORE = 0.4;

function pickBestEmailForCompany(
  candidates: Iterable<string>,
  company: string,
  rankedResults: TavilySearchResult[],
): string | null {
  const list = [...candidates];
  const domainMatches = list.filter((email) => emailMatchesCompanyDomain(email, company));

  if (domainMatches.length > 0) {
    return pickBestEmail(domainMatches);
  }

  const trustedEmails = list.filter((email) => {
    const resultScore = rankedResults.find((result) => {
      const text = `${result.title} ${result.content} ${result.raw_content ?? ''}`;
      return extractEmailsFromText(text).includes(email);
    });

    if (!resultScore) {
      return false;
    }

    return scoreSearchResult(resultScore, company) >= MIN_TRUSTED_RESULT_SCORE;
  });

  return trustedEmails.length > 0 ? pickBestEmail(trustedEmails) : null;
}

function collectCandidateEmails(
  results: TavilySearchResult[],
  company: string,
): { candidates: string[]; sourceUrl: string | null } {
  const ranked = [...results].sort(
    (a, b) => scoreSearchResult(b, company) - scoreSearchResult(a, company),
  );

  const seen = new Set<string>();
  const ordered: string[] = [];
  let sourceUrl: string | null = null;

  for (const result of ranked) {
    const host = (() => {
      try {
        return new URL(result.url).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();

    const texts = [result.title, result.content, result.raw_content ?? ''];
    const emailsInResult: string[] = [];

    for (const text of texts) {
      for (const email of extractEmailsFromText(text)) {
        if (!seen.has(email)) {
          seen.add(email);
          ordered.push(email);
          emailsInResult.push(email);
        }
      }
    }

    if (emailsInResult.length === 0) {
      continue;
    }

    const hasDomainMatch = emailsInResult.some((email) =>
      emailMatchesCompanyDomain(email, company),
    );

    if (isAggregatorHost(host) && !hasDomainMatch) {
      continue;
    }

    if (!sourceUrl) {
      sourceUrl = result.url;
    }
  }

  return { candidates: ordered, sourceUrl };
}

export async function lookupHrEmail(input: TavilyEmailLookupInput): Promise<TavilyEmailLookupResult> {
  const strategies = buildHrEmailSearchQueries(input);
  const maxQueries = Math.max(1, env.tavilyMaxQueriesPerLookup);
  const queriesToRun = strategies.slice(0, maxQueries);

  const allResults: TavilySearchResult[] = [];
  const queriesAttempted: string[] = [];
  let winningQuery = queriesToRun[0]?.query ?? input.company;
  let winningStrategy = queriesToRun[0]?.name ?? 'unknown';

  let bestEmail: string | null = null;
  let bestCandidates: string[] = [];
  let bestSourceUrl: string | null = null;
  let extractedUrls: string[] = [];

  for (const strategy of queriesToRun) {
    queriesAttempted.push(strategy.query);
    const response = await tavilySearch({ query: strategy.query });
    allResults.push(...response.results);

    const { candidates, sourceUrl } = collectCandidateEmails(response.results, input.company);
    const ranked = [...response.results].sort(
      (a, b) => scoreSearchResult(b, input.company) - scoreSearchResult(a, input.company),
    );
    const email = pickBestEmailForCompany(candidates, input.company, ranked);

    if (email) {
      bestEmail = email;
      bestCandidates = candidates;
      bestSourceUrl = sourceUrl;
      winningQuery = strategy.query;
      winningStrategy = strategy.name;
      break;
    }

    if (candidates.length > bestCandidates.length) {
      bestCandidates = candidates;
      bestSourceUrl = sourceUrl;
      winningQuery = strategy.query;
      winningStrategy = strategy.name;
    }
  }

  const uniqueResults = [...new Map(allResults.map((item) => [item.url, item])).values()].sort(
    (a, b) => scoreSearchResult(b, input.company) - scoreSearchResult(a, input.company),
  );

  if (!bestEmail && bestCandidates.length > 0) {
    bestEmail = pickBestEmailForCompany(bestCandidates, input.company, uniqueResults);
  }

  if (!bestEmail && env.tavilyExtractEnabled && uniqueResults.length > 0) {
    const extractResult = await extractEmailsFromSearchResults(uniqueResults, input.company);
    extractedUrls = extractResult.extractedUrls;

    if (extractResult.email) {
      bestEmail = extractResult.email;
      bestCandidates = [...new Set([...bestCandidates, ...extractResult.candidates])];
      bestSourceUrl = extractResult.sourceUrl;
      winningStrategy = 'extract';
      winningQuery = `extract: ${extractedUrls.join(', ')}`;
    } else if (extractResult.candidates.length > bestCandidates.length) {
      bestCandidates = extractResult.candidates;
    }
  }

  return {
    email: bestEmail,
    query: winningQuery,
    strategy: winningStrategy,
    queriesAttempted,
    extractedUrls,
    sourceUrl: bestEmail ? bestSourceUrl : null,
    candidates: bestCandidates,
    results: uniqueResults,
  };
}
