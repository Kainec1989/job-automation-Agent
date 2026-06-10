import { env } from '../config/env.js';
import type { ScrapedVacancy } from '../database/types.js';
import { extractJobPostingFromHtml } from './extractJobPostingJsonLd.js';
import { sleep } from './browser.js';
import { buildStepstonePageUrl } from './pagination.js';
import { mergeVacancies } from './mergeVacancies.js';
import { classifyScrapedVacancy } from './scraperUtils.js';
import { extractEmailsFromText } from './extractEmail.js';
import { pickBestHrEmail } from './hrEmailValidation.js';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'de-DE,de;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
} as const;

interface StepstoneListingCard {
  title: string;
  company: string;
  url: string;
  snippet: string | null;
}

function resolveStepstoneUrl(href: string): string {
  if (href.startsWith('http')) {
    return href;
  }

  return `${env.stepstoneBaseUrl}${href.startsWith('/') ? href : `/${href}`}`;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

function parseListingCards(html: string): StepstoneListingCard[] {
  const cards: StepstoneListingCard[] = [];
  const articleRegex =
    /<article[^>]*data-at="job-item"[^>]*>([\s\S]*?)<\/article>/gi;

  for (const match of html.matchAll(articleRegex)) {
    const block = match[1] ?? '';
    const hrefMatch = block.match(/data-at="job-item-title"[^>]*href="([^"]+)"/i);
    const titleMatch = block.match(/data-at="job-item-title"[^>]*>([^<]+)</i);
    const companyMatch = block.match(/data-at="job-item-company-name"[^>]*>([^<]+)</i);
    const snippetMatch = block.match(/data-at="job-card-summary"[^>]*>([^<]+)</i);

    const href = hrefMatch?.[1]?.trim();
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();
    const company = companyMatch?.[1]?.replace(/\s+/g, ' ').trim();

    if (!href || !title || !company) {
      continue;
    }

    cards.push({
      title,
      company,
      url: resolveStepstoneUrl(href),
      snippet: snippetMatch?.[1]?.replace(/\s+/g, ' ').trim() || null,
    });
  }

  return cards;
}

async function fetchStepstoneJobDetails(
  url: string,
  company: string,
  snippet: string | null,
): Promise<{ description: string | null; email: string | null }> {
  const html = await fetchHtml(url);
  if (!html) {
    return { description: snippet, email: null };
  }

  const structured = extractJobPostingFromHtml(html);
  const description = structured?.description ?? snippet;
  const emails = [
    ...(structured?.emails ?? []),
    ...extractEmailsFromText(html),
  ];
  const email = pickBestHrEmail(emails, company);

  return { description, email };
}

async function scrapeStepstoneSearchHttp(baseSearchUrl: string): Promise<ScrapedVacancy[]> {
  const merged = new Map<string, ScrapedVacancy>();

  for (let pageIndex = 0; pageIndex < env.scrapeMaxPages; pageIndex += 1) {
    if (pageIndex > 0 && env.scrapePageDelayMs > 0) {
      await sleep(env.scrapePageDelayMs);
    }

    const searchUrl = buildStepstonePageUrl(baseSearchUrl, pageIndex);
    console.log(`[Stepstone HTTP] Page ${pageIndex + 1}/${env.scrapeMaxPages}: ${searchUrl}`);

    const html = await fetchHtml(searchUrl);
    if (!html) {
      console.warn(`[Stepstone HTTP] Failed to fetch listing page ${pageIndex + 1}`);
      break;
    }

    const cards = parseListingCards(html);
    if (cards.length === 0) {
      console.log(`[Stepstone HTTP] No cards on page ${pageIndex + 1}, stopping.`);
      break;
    }

    const collected: ScrapedVacancy[] = [];
    const concurrency = env.descriptionFetchConcurrency;

    for (let offset = 0; offset < cards.length; offset += concurrency) {
      const batch = cards.slice(offset, offset + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (card) => {
          const { description, email } = await fetchStepstoneJobDetails(
            card.url,
            card.company,
            card.snippet,
          );

          return classifyScrapedVacancy(
            card.title,
            card.company,
            card.url,
            description,
            'Stepstone',
            email,
          );
        }),
      );

      for (const vacancy of batchResults) {
        if (vacancy) {
          collected.push(vacancy);
        }
      }

      if (env.descriptionFetchDelayMs > 0) {
        await sleep(env.descriptionFetchDelayMs);
      }
    }

    console.log(`[Stepstone HTTP] Page ${pageIndex + 1}: ${cards.length} cards, ${collected.length} accepted`);
    mergeVacancies(merged, collected);
  }

  return [...merged.values()];
}

export async function scrapeAllStepstoneHttp(): Promise<ScrapedVacancy[]> {
  const merged = new Map<string, ScrapedVacancy>();
  const searchUrls = env.stepstoneSearchUrls;

  for (let i = 0; i < searchUrls.length; i++) {
    if (i > 0 && env.searchDelayMs > 0) {
      console.log(`[Stepstone HTTP] Waiting ${env.searchDelayMs / 1000}s before next search...`);
      await sleep(env.searchDelayMs);
    }

    try {
      const vacancies = await scrapeStepstoneSearchHttp(searchUrls[i]!);
      mergeVacancies(merged, vacancies);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Stepstone HTTP] Skipping search after error: ${message}`);
    }
  }

  console.log(`[Stepstone HTTP] Total from search: ${merged.size} vacancies`);
  return [...merged.values()];
}
