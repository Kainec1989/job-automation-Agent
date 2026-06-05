import { companySlug } from './companyMatch.js';
import { AGGREGATOR_HOSTS, CAREER_URL_HINTS } from './constants.js';
import type { TavilySearchResult } from './types.js';

const IMPRESSUM_PATHS = ['/impressum', '/kontakt', '/karriere/kontakt', '/de/kontakt'] as const;

function isAggregatorHost(host: string): boolean {
  return AGGREGATOR_HOSTS.some((blocked) => host.includes(blocked));
}

export function urlMatchesCompany(url: string, company: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9]/g, '');
    const slug = companySlug(company);
    if (slug.length < 6) {
      return false;
    }

    const slugPrefix = slug.slice(0, Math.min(slug.length, 12));
    return host.includes(slugPrefix) || slug.includes(host.replace(/^www/, ''));
  } catch {
    return false;
  }
}

function scoreExtractCandidate(result: TavilySearchResult, company: string): number {
  let score = result.score;

  try {
    const url = new URL(result.url);
    const host = url.hostname.toLowerCase();
    const fullUrl = result.url.toLowerCase();

    if (isAggregatorHost(host)) {
      return -1;
    }

    if (CAREER_URL_HINTS.test(fullUrl)) {
      score += 0.3;
    }

    if (host.endsWith('.de')) {
      score += 0.1;
    }

    if (urlMatchesCompany(result.url, company)) {
      score += 0.45;
    }
  } catch {
    return -1;
  }

  return score;
}

function addImpressumVariants(urls: Set<string>, url: string, maxUrls: number): void {
  try {
    const origin = new URL(url).origin;
    for (const path of IMPRESSUM_PATHS) {
      if (urls.size >= maxUrls) {
        return;
      }
      urls.add(`${origin}${path}`);
    }
  } catch {
    // ignore invalid URL
  }
}

/** Выбирает URL для Extract: топ search results + impressum/kontakt на том же домене. */
export function selectExtractUrls(
  results: TavilySearchResult[],
  company: string,
  maxUrls: number,
): string[] {
  const ranked = [...results]
    .map((result) => ({ result, score: scoreExtractCandidate(result, company) }))
    .filter((item) => item.score >= 0.2)
    .sort((a, b) => b.score - a.score);

  const selected = new Set<string>();

  for (const { result } of ranked) {
    if (selected.size >= maxUrls) {
      break;
    }

    selected.add(result.url);

    if (urlMatchesCompany(result.url, company)) {
      addImpressumVariants(selected, result.url, maxUrls);
    }
  }

  return [...selected].slice(0, maxUrls);
}
